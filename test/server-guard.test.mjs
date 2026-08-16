// server-guard: inline dev servers must be detached, and the detach patterns
// that leak the tool's stdout pipe must stay blocked.
//
// The regression that motivated this suite: isSafelyDetached() used to WHITELIST
// `Start-Process -RedirectStandardOutput x -RedirectStandardError y`, which is
// the exact pattern that hangs. -Redirect* makes PowerShell call CreateProcess
// with bInheritHandles=TRUE, so the dev server inherits the agent tool's stdout
// pipe and EOF never arrives. Measured: launcher exited at 2.3s, caller's stdout
// EOF at 21.8s (when the server died); with a real server, never.
//
// Platform note: the guard is Windows-only (PowerShell launcher, Win32 handle
// semantics), so every case pins platform: 'win32' and injects exe paths instead
// of probing PATH. That keeps the suite meaningful on Linux CI.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import plugin, {
  createServerGuard,
  isSafelyDetached,
  matchesPattern,
  detectPort,
  findLauncher,
  blockMessage,
  BROKEN_DETACH_PATTERNS,
  SERVER_PATTERNS,
} from '../plugin/server-guard/plugin.js'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const LAUNCHER = join(REPO, 'plugin', 'server-guard', 'start-server.ps1')
const FAKE_NODE = 'C:\\nodejs\\node.exe'
const FAKE_NPM_CLI = 'C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'

function guard(directory = REPO) {
  return createServerGuard({
    directory,
    launcher: LAUNCHER,
    platform: 'win32',
    exePaths: { node: FAKE_NODE, npmCli: FAKE_NPM_CLI, python: 'C:\\python\\python.exe' },
  })
}

async function run(command, hooks = guard()) {
  const output = { args: { command } }
  try {
    await hooks['tool.execute.before']({ tool: 'bash' }, output)
    return { ok: true, ...output.args }
  } catch (err) {
    return { ok: false, message: err.message }
  }
}

describe('server-guard: shipped assets', () => {
  test('the launcher ships with the plugin', () => {
    assert.ok(existsSync(LAUNCHER), 'plugin/server-guard/start-server.ps1 must ship')
  })

  test('findLauncher resolves the copy beside the plugin', () => {
    assert.equal(findLauncher(), LAUNCHER)
  })

  test('findLauncher returns null when nothing is installed', () => {
    assert.equal(findLauncher([join(tmpdir(), 'graphyloop-absent-launcher.ps1')]), null)
  })

  test('the launcher never re-introduces the leaking detach', async () => {
    const { readFileSync } = await import('node:fs')
    const script = readFileSync(LAUNCHER, 'utf8')
    // Comments discuss the broken pattern on purpose; only real code matters.
    const code = script
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n')
    for (const call of code.match(/Start-Process[^\r\n]*/g) || []) {
      assert.doesNotMatch(
        call,
        /-RedirectStandard(Output|Error)/,
        `Start-Process must not redirect stdio (bInheritHandles=TRUE leaks the caller's pipe): ${call}`
      )
    }
    assert.match(code, /Start-Process -FilePath 'cmd\.exe'/, 'the launcher starts the .cmd wrapper')
    assert.match(script, /ShellExecuteEx/, 'the no-inheritance rationale must stay documented')
  })
})

describe('server-guard: broken detach patterns', () => {
  test('Start-Process with stdio redirects is blocked, not trusted', async () => {
    const command =
      'Start-Process node -ArgumentList "server.js" -RedirectStandardOutput out.log -RedirectStandardError err.log'
    assert.equal(isSafelyDetached(command), false, 'must not be treated as a safe detach')
    const result = await run(command)
    assert.equal(result.ok, false)
    assert.match(result.message, /SERVER_GUARD_BLOCKED/)
    assert.match(result.message, /stdout pipe handle/)
  })

  test('a single redirect is enough to be blocked', async () => {
    const result = await run('Start-Process node -ArgumentList "app.js" -RedirectStandardOutput out.log')
    assert.equal(result.ok, false)
  })

  test('-Wait is a foreground run, so it stays allowed', async () => {
    const result = await run('Start-Process tsc -ArgumentList "--noEmit" -RedirectStandardOutput out.log -Wait')
    assert.equal(result.ok, true, result.message)
  })

  test('cmd /c start stays blocked', async () => {
    const result = await run('cmd /c start npm run dev')
    assert.equal(result.ok, false)
  })

  test('Start-Process against a package manager stays blocked', async () => {
    const result = await run('Start-Process npm -ArgumentList "run","dev"')
    assert.equal(result.ok, false)
  })

  test('matchesPattern handles both regex and predicate entries', () => {
    const kinds = new Set(BROKEN_DETACH_PATTERNS.map((p) => typeof p))
    assert.ok(kinds.has('function'), 'the redirect rule is a predicate')
    assert.ok(kinds.has('object'), 'the legacy rules stay regexes')
    for (const pattern of BROKEN_DETACH_PATTERNS) {
      assert.equal(typeof matchesPattern(pattern, 'echo hello'), 'boolean')
    }
  })
})

describe('server-guard: rewrites', () => {
  test('npm run dev becomes a launcher call', async () => {
    const result = await run('npm run dev')
    assert.equal(result.ok, true, result.message)
    assert.match(result.command, /SERVER_GUARD_REWRITE/)
    assert.match(result.command, /start-server\.ps1/)
    assert.match(result.command, /-CommandB64 [A-Za-z0-9+/=]+$/)
  })

  test('the rewritten command carries the original inside base64', async () => {
    const result = await run('npm run dev')
    const b64 = result.command.match(/-CommandB64 ([A-Za-z0-9+/=]+)$/)[1]
    const inner = Buffer.from(b64, 'base64').toString('utf8')
    assert.equal(inner, `"${FAKE_NODE}" "${FAKE_NPM_CLI}" run dev`)
  })

  test('an explicit --port wins over the default', async () => {
    const result = await run('npm run dev -- --port 4321')
    assert.match(result.command, /-Port 4321\b/)
  })

  test('a direct node server entrypoint is rewritten', async () => {
    const result = await run('node server.js')
    assert.equal(result.ok, true, result.message)
    assert.match(result.command, /start-server\.ps1/)
  })

  test('python -m http.server is rewritten on its own default port', async () => {
    const result = await run('python -m http.server')
    assert.equal(result.ok, true, result.message)
    assert.match(result.command, /-Port 8000\b/)
  })

  test('an existing launcher call is left untouched', async () => {
    const command = `powershell -NoProfile -File "${LAUNCHER}" -Port 3000 -CommandB64 aGk=`
    const result = await run(command)
    assert.equal(result.ok, true, result.message)
    assert.equal(result.command, command)
  })

  test('a package.json script port is detected when the command has none', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'graphyloop-sg-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite --port 5199' } }))
    const result = await run('npm run dev', guard(dir))
    assert.match(result.command, /-Port 5199\b/)
  })
})

describe('server-guard: blocks that need a human decision', () => {
  test('pnpm dev is blocked with launcher instructions', async () => {
    const result = await run('pnpm dev')
    assert.equal(result.ok, false)
    assert.match(result.message, /start-server\.ps1/)
  })

  test('command chains are never half-rewritten', async () => {
    const result = await run('npm run build && npm run dev')
    assert.equal(result.ok, false)
  })

  test('a missing launcher blocks with a reinstall hint instead of a broken rewrite', async () => {
    const hooks = createServerGuard({
      directory: REPO,
      launcher: null,
      platform: 'win32',
      exePaths: { node: FAKE_NODE, npmCli: FAKE_NPM_CLI },
    })
    const result = await run('npm run dev', hooks)
    assert.equal(result.ok, false)
    assert.match(result.message, /npx graphyloop@latest/)
  })

  test('the block message explains the pipe-EOF mechanism', () => {
    assert.match(blockMessage('inline-server', LAUNCHER), /reads stdout until EOF/)
  })
})

describe('server-guard: pass-through and hygiene', () => {
  test('ordinary commands are untouched', async () => {
    const result = await run('npm test')
    assert.equal(result.ok, true, result.message)
    assert.equal(result.command, 'npm test')
  })

  test('a bash call without a timeout gets the backstop', async () => {
    const result = await run('npm test')
    assert.equal(result.timeout, 300000)
  })

  test('an explicit timeout is respected', async () => {
    const output = { args: { command: 'npm test', timeout: 5000 } }
    await guard()['tool.execute.before']({ tool: 'bash' }, output)
    assert.equal(output.args.timeout, 5000)
  })

  test('non-bash tools are ignored', async () => {
    const output = { args: { command: 'npm run dev' } }
    await guard()['tool.execute.before']({ tool: 'read' }, output)
    assert.equal(output.args.command, 'npm run dev')
    assert.equal(output.args.timeout, undefined)
  })

  test('every server pattern is a regex', () => {
    for (const pattern of SERVER_PATTERNS) assert.ok(pattern instanceof RegExp)
  })
})

describe('server-guard: platform gate', () => {
  test('no hooks are installed off Windows', () => {
    assert.equal(createServerGuard({ platform: 'linux' }), null)
    assert.equal(createServerGuard({ platform: 'darwin' }), null)
  })

  test('the default export always resolves to a hook object', async () => {
    const hooks = await plugin({ directory: REPO })
    assert.equal(typeof hooks, 'object')
    if (process.platform === 'win32') {
      assert.equal(typeof hooks['tool.execute.before'], 'function')
    } else {
      assert.deepEqual(hooks, {})
    }
  })
})
