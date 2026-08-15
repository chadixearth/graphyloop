// mcp.test.mjs — MCP stdio server tests (B7). Contract: CONTRACTS.md "CONTRACT: mcp.mjs (B1)".
//
// Drives the real mcp-server.mjs over newline-delimited JSON-RPC 2.0 on stdin/stdout.
// A temp HOME holds a fake graphyloop CLI (copy of the real adapter/cli.mjs) at
// ~/.graphyloop/graphyloop/cli.mjs; GRAPHYLOOP_PROJECT_ROOT points at a temp project that is
// pre-initialized (graphyloop CLI requires init before memory ops). GRAPHYLOOP_CLI env override
// selects the fake CLI.
//
// No network, no npm deps. Run with: node --test test/

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { CORE_LIB_FILES } from '../lib/install-core.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MCP_SERVER = join(REPO_ROOT, 'mcp-server.mjs')
const ADAPTER_CLI = join(REPO_ROOT, 'adapter', 'cli.mjs')
const PKG_VERSION = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version

// The tools the contract mandates.
const EXPECTED_TOOLS = [
  'agent_spawn',
  'agent_list',
  'task_distribute',
  'swarm_state',
  'task_record',
  'memory_store',
  'memory_search',
  'memory_forget',
  'plan_feature',
  'secrets_status',
  'secrets_set',
  'env_sync',
  'preflight',
  'shutdown',
]

let homeDir
let projectDir
let fakeCli
let server
let reader
let errBuf
let seq = 0

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Reads one complete line at a time from a stream; nextLine() resolves with the
// next line, rejecting on timeout.
function createLineReader(stream) {
  let buffer = ''
  const waiters = []
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += chunk
    let idx
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (waiters.length > 0) waiters.shift()(line)
    }
  })
  return {
    nextLine(timeoutMs = 5000) {
      return new Promise((resolveLine, reject) => {
        let waiter
        const timer = setTimeout(() => {
          // Remove the timed-out waiter so it cannot consume a later line.
          const i = waiters.indexOf(waiter)
          if (i >= 0) waiters.splice(i, 1)
          reject(new Error('line read timeout'))
        }, timeoutMs)
        waiter = (line) => {
          clearTimeout(timer)
          resolveLine(line)
        }
        waiters.push(waiter)
      })
    },
  }
}

function waitExit(child, timeoutMs = 5000) {
  return new Promise((resolveExit, reject) => {
    if (child.exitCode !== null) return resolveExit(child.exitCode)
    const timer = setTimeout(() => reject(new Error('process did not exit in time')), timeoutMs)
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolveExit(code)
    })
  })
}

// Writes one JSON-RPC request, waits for the response line, asserts id match.
async function rpc(method, params) {
  const id = ++seq
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  const line = await reader.nextLine(5000)
  const msg = JSON.parse(line)
  assert.equal(msg.id, id, `response id mismatch for ${method}`)
  return msg
}

async function callTool(name, args) {
  const msg = await rpc('tools/call', { name, arguments: args ?? {} })
  assert.ok(msg.result, `tools/call ${name} returned no result`)
  return msg.result
}

function spawnServer(extraEnv) {
  const child = spawn(process.execPath, [MCP_SERVER], {
    env: {
      ...process.env,
      GRAPHYLOOP_PROJECT_ROOT: projectDir,
      GRAPHYLOOP_CLI: fakeCli,
      ...extraEnv,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stderr.resume()
  return child
}

// ---------------------------------------------------------------------------
// Lifecycle: temp HOME with fake graphyloop CLI + pre-initialized temp project
// ---------------------------------------------------------------------------

before(async () => {
  homeDir = mkdtempSync(join(tmpdir(), 'graphyloop-mcp-home-'))
  projectDir = mkdtempSync(join(tmpdir(), 'graphyloop-mcp-proj-'))
  fakeCli = join(homeDir, '.graphyloop', 'graphyloop', 'cli.mjs')
  mkdirSync(dirname(fakeCli), { recursive: true })
  copyFileSync(ADAPTER_CLI, fakeCli)
  // The CLI imports ../lib/engine.mjs, which in turn imports the rest of the
  // engine modules, so the fake home has to mirror the installed tree or it dies
  // with ERR_MODULE_NOT_FOUND. The list comes from the installer itself so a new
  // core module cannot silently break the installed layout.
  mkdirSync(join(homeDir, '.graphyloop', 'lib'), { recursive: true })
  for (const name of CORE_LIB_FILES) {
    copyFileSync(join(REPO_ROOT, 'lib', name), join(homeDir, '.graphyloop', 'lib', name))
  }
  copyFileSync(join(REPO_ROOT, 'package.json'), join(homeDir, '.graphyloop', 'package.json'))

  // graphyloop CLI refuses memory ops until init; pre-initialize the temp project.
  const init = spawnSync(process.execPath, [fakeCli, 'init'], {
    env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: projectDir },
    encoding: 'utf8',
  })
  assert.equal(init.status, 0, `graphyloop init failed: ${init.stderr}`)

  server = spawnServer({})
  reader = createLineReader(server.stdout)
  errBuf = ''
  server.stderr.setEncoding('utf8')
  server.stderr.on('data', (d) => {
    errBuf += d
  })
})

after(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await waitExit(server, 3000).catch(() => {})
  }
  for (const dir of [homeDir, projectDir]) {
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('initialize returns protocol version and server info', { timeout: 15000 }, async () => {
  const msg = await rpc('initialize', {})
  assert.equal(msg.result.protocolVersion, '2024-11-05')
  assert.deepEqual(msg.result.capabilities, { tools: {} })
  assert.equal(msg.result.serverInfo.name, 'graphyloop-mcp')
  assert.equal(msg.result.serverInfo.version, PKG_VERSION, 'serverInfo.version tracks package.json')
})

test('notifications/initialized produces no response', { timeout: 15000 }, async () => {
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
  await assert.rejects(reader.nextLine(100), /timeout/)
})

test('ping returns empty result', { timeout: 15000 }, async () => {
  const msg = await rpc('ping', {})
  assert.deepEqual(msg.result, {})
})

test('tools/list returns every contracted tool with a schema', { timeout: 15000 }, async () => {
  const msg = await rpc('tools/list', {})
  assert.ok(Array.isArray(msg.result.tools))
  assert.equal(msg.result.tools.length, EXPECTED_TOOLS.length, `expected ${EXPECTED_TOOLS.length} tools, got ${msg.result.tools.length}`)
  const names = msg.result.tools.map((t) => t.name)
  for (const expected of EXPECTED_TOOLS) {
    assert.ok(names.includes(expected), `missing tool ${expected}`)
  }
  assert.equal(new Set(names).size, EXPECTED_TOOLS.length, 'duplicate tool names')
  for (const tool of msg.result.tools) {
    assert.equal(typeof tool.description, 'string', `${tool.name}: description`)
    assert.ok(tool.inputSchema && typeof tool.inputSchema === 'object', `${tool.name}: inputSchema`)
  }
})

test('tools/call memory_store persists a memory', { timeout: 15000 }, async () => {
  const result = await callTool('memory_store', { content: 'mcp test', type: 'event' })
  assert.equal(result.isError, false, JSON.stringify(result))
  const data = JSON.parse(result.content[0].text)
  assert.equal(data.ok, true, JSON.stringify(data))
  assert.ok(data.totalMemories >= 1)
})

test('tools/call memory_search finds the stored memory', { timeout: 15000 }, async () => {
  const result = await callTool('memory_search', { query: 'mcp' })
  assert.equal(result.isError, false, JSON.stringify(result))
  const data = JSON.parse(result.content[0].text)
  assert.equal(data.ok, true, JSON.stringify(data))
  assert.ok(Array.isArray(data.results))
  assert.ok(
    data.results.some((r) => r.content === 'mcp test'),
    `results did not contain 'mcp test': ${result.content[0].text}`
  )
})

test('tools/call with unknown tool returns isError', { timeout: 15000 }, async () => {
  const result = await callTool('unknown-tool', {})
  assert.equal(result.isError, true)
  assert.ok(result.content[0].text.length > 0)
})

test('tools/call memory_search without query returns isError (validation)', { timeout: 15000 }, async () => {
  const result = await callTool('memory_search', {})
  assert.equal(result.isError, true)
})

test('tools/call memory_store without content returns isError (validation)', { timeout: 15000 }, async () => {
  const result = await callTool('memory_store', { type: 'event' })
  assert.equal(result.isError, true)
})

// ---------------------------------------------------------------------------
// Planning + secrets/deploy tools
// ---------------------------------------------------------------------------

test('tools/call plan_feature returns a wave plan whose tasks task_distribute accepts', { timeout: 20000 }, async () => {
  const planned = await callTool('plan_feature', { goal: 'inventory system with stock levels and a dashboard' })
  assert.equal(planned.isError, false, planned.content[0].text)
  const plan = JSON.parse(planned.content[0].text)
  assert.equal(plan.shape, 'fullstack')
  assert.deepEqual(plan.waves.map((w) => w.name), ['contract', 'builders', 'integration', 'verify'])

  // The output of one tool must be valid input to the next without reshaping.
  await callTool('agent_spawn', { type: 'data', id: 'plan-data' })
  await callTool('agent_spawn', { type: 'coder', id: 'plan-coder' })
  const dist = await callTool('task_distribute', { tasks: JSON.stringify(plan.tasks) })
  assert.equal(dist.isError, false, dist.content[0].text)
  const res = JSON.parse(dist.content[0].text)
  assert.deepEqual(res.dispatchNow, ['w0-contract'], 'only wave 0 is dispatchable')
  assert.ok(res.blocked.length > 0, 'later waves reported as blocked')
})

test('tools/call plan_feature without a goal returns isError (validation)', { timeout: 15000 }, async () => {
  const result = await callTool('plan_feature', {})
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /"goal" is required/)
})

test('tools/call secrets_set stores a credential and never echoes the value', { timeout: 15000 }, async () => {
  const value = 'sbp_mcp_service_role_value_abcdef123456'
  const set = await callTool('secrets_set', { key: 'SUPABASE_SERVICE_ROLE_KEY', value })
  assert.equal(set.isError, false, set.content[0].text)
  assert.ok(!set.content[0].text.includes(value), 'raw credential came back over MCP')

  const status = await callTool('secrets_status', { provider: 'supabase' })
  assert.equal(status.isError, false, status.content[0].text)
  assert.ok(!status.content[0].text.includes(value), 'secrets_status leaked the value')
  const data = JSON.parse(status.content[0].text)
  const key = data.providers[0].keys.find((k) => k.key === 'SUPABASE_SERVICE_ROLE_KEY')
  assert.equal(key.present, true)
  assert.equal(key.source, 'store')
})

test('tools/call secrets_set validates the key name and requires a value', { timeout: 15000 }, async () => {
  const badKey = await callTool('secrets_set', { key: 'not-a-key', value: 'x' })
  assert.equal(badKey.isError, true)
  assert.match(badKey.content[0].text, /UPPER_SNAKE_CASE/)

  const noValue = await callTool('secrets_set', { key: 'VERCEL_TOKEN' })
  assert.equal(noValue.isError, true)
  assert.match(noValue.content[0].text, /"value" is required/)
})

test('tools/call preflight reports blockers and gates without executing anything', { timeout: 15000 }, async () => {
  const result = await callTool('preflight', { target: 'deploy' })
  assert.equal(result.isError, false, result.content[0].text)
  const data = JSON.parse(result.content[0].text)
  assert.equal(data.ok, false, 'no VERCEL_TOKEN in this project yet')
  assert.ok(data.blockers.some((b) => b.key === 'VERCEL_TOKEN'))
  assert.match(data.plan.find((s) => s.id === 'deploy-prod').gate, /approval/i)

  const bad = await callTool('preflight', { target: 'staging' })
  assert.equal(bad.isError, true)
  assert.match(bad.content[0].text, /db, deploy, all/)
})

test('tools/call env_sync rejects a non-env target', { timeout: 15000 }, async () => {
  const result = await callTool('env_sync', { target: 'config.json' })
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /\.env\*/)
})

// Regression: the contracted tool set has no init tool, so before lazy init a
// fresh project answered every tool call with {"error":"not initialized"} —
// graphyloop was inert in claude/codex/cursor until someone ran the CLI by hand.
test('fresh project auto-initializes on the first tool call', { timeout: 15000 }, async () => {
  const fresh = mkdtempSync(join(tmpdir(), 'graphyloop-mcp-fresh-'))
  const s = spawnServer({ GRAPHYLOOP_PROJECT_ROOT: fresh })
  const r = createLineReader(s.stdout)
  try {
    s.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'memory_store', arguments: { content: 'auto init' } } })}\n`
    )
    const stored = JSON.parse(await r.nextLine(5000))
    assert.equal(stored.result.isError, false, stored.result.content[0].text)
    assert.equal(JSON.parse(stored.result.content[0].text).ok, true)
    assert.ok(
      existsSync(join(fresh, '.graphyloop', 'state.json')),
      'state file created under the project root'
    )

    s.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'agent_spawn', arguments: { type: 'coder' } } })}\n`
    )
    const spawned = JSON.parse(await r.nextLine(5000))
    assert.equal(spawned.result.isError, false, spawned.result.content[0].text)
  } finally {
    if (s.exitCode === null) {
      s.kill('SIGTERM')
      await waitExit(s, 3000).catch(() => {})
    }
    rmSync(fresh, { recursive: true, force: true })
  }
})

// Auto-init writes <root>/.graphyloop/state.json, so a client launched with its
// cwd at HOME must be refused rather than littering the home tree.
test('home directory is refused as a project root', { timeout: 15000 }, async () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'graphyloop-mcp-home-guard-'))
  const s = spawnServer({ GRAPHYLOOP_HOME: fakeHome, GRAPHYLOOP_PROJECT_ROOT: fakeHome })
  const r = createLineReader(s.stdout)
  try {
    s.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'memory_store', arguments: { content: 'should not persist' } } })}\n`
    )
    const res = JSON.parse(await r.nextLine(5000))
    assert.equal(res.result.isError, true)
    assert.match(res.result.content[0].text, /not a project root/)
    assert.ok(!existsSync(join(fakeHome, '.graphyloop')), 'home directory left untouched')
  } finally {
    if (s.exitCode === null) {
      s.kill('SIGTERM')
      await waitExit(s, 3000).catch(() => {})
    }
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('tools/call shutdown exits the process with code 0', { timeout: 15000 }, async () => {
  const result = await callTool('shutdown', {})
  assert.equal(result.isError, false, JSON.stringify(result))
  const code = await waitExit(server, 5000)
  assert.equal(code, 0, `shutdown exit code was ${code}`)
})

test('server exits with code 0 on stdin EOF', { timeout: 15000 }, async () => {
  const s = spawnServer({})
  s.stdin.end()
  const code = await waitExit(s, 5000)
  assert.equal(code, 0, `EOF exit code was ${code}`)
})

test('a pinned CLI that does not exist is reported, not silently ignored', { timeout: 15000 }, async () => {
  // GRAPHYLOOP_CLI pins the server to one engine build. If that pin is bad the
  // server must say so rather than quietly running a different engine.
  const emptyHome = mkdtempSync(join(tmpdir(), 'graphyloop-mcp-empty-'))
  const s = spawnServer({ GRAPHYLOOP_HOME: emptyHome, GRAPHYLOOP_CLI: join(emptyHome, 'missing.mjs') })
  const r = createLineReader(s.stdout)
  try {
    s.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })}
`)
    const list = JSON.parse(await r.nextLine(5000))
    assert.equal(list.result.tools.length, EXPECTED_TOOLS.length)

    s.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'memory_search', arguments: { query: 'x' } } })}
`
    )
    const call = JSON.parse(await r.nextLine(5000))
    assert.equal(call.result.isError, true)
    assert.ok(call.result.content[0].text.includes('graphyloop engine not found'), call.result.content[0].text)
  } finally {
    if (s.exitCode === null) {
      s.kill('SIGTERM')
      await waitExit(s, 3000).catch(() => {})
    }
    rmSync(emptyHome, { recursive: true, force: true })
  }
})

// With no CLI on disk and no pin, the only way these can succeed is the
// in-process engine — which is the point: no child process per tool call.
test('runs in-process with no CLI installed at all', { timeout: 15000 }, async () => {
  const emptyHome = mkdtempSync(join(tmpdir(), 'graphyloop-mcp-inproc-home-'))
  const proj = mkdtempSync(join(tmpdir(), 'graphyloop-mcp-inproc-proj-'))
  const s = spawn(process.execPath, [MCP_SERVER], {
    env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: proj, GRAPHYLOOP_HOME: emptyHome, GRAPHYLOOP_CLI: '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  s.stderr.resume()
  const r = createLineReader(s.stdout)
  try {
    s.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'memory_store', arguments: { content: 'in-process store' } } })}
`
    )
    const stored = JSON.parse(await r.nextLine(5000))
    assert.equal(stored.result.isError, false, stored.result.content[0].text)

    s.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'memory_search', arguments: { query: 'in-process' } } })}
`
    )
    const found = JSON.parse(await r.nextLine(5000))
    const data = JSON.parse(found.result.content[0].text)
    assert.ok(data.results.some((m) => m.content === 'in-process store'), found.result.content[0].text)

    // and the new correction path: forget it again
    const id = data.results.find((m) => m.content === 'in-process store').id
    s.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'memory_forget', arguments: { id } } })}
`
    )
    const forgotten = JSON.parse(await r.nextLine(5000))
    assert.equal(forgotten.result.isError, false, forgotten.result.content[0].text)
    assert.equal(JSON.parse(forgotten.result.content[0].text).removed.id, id)
  } finally {
    if (s.exitCode === null) {
      s.kill('SIGTERM')
      await waitExit(s, 3000).catch(() => {})
    }
    rmSync(emptyHome, { recursive: true, force: true })
    rmSync(proj, { recursive: true, force: true })
  }
})

// Spawns its own server: the shared one is already gone by this point, having
// been exited by the shutdown test above.
test('initialize echoes a newer protocol version the client asks for', { timeout: 15000 }, async () => {
  const s = spawnServer({})
  const r = createLineReader(s.stdout)
  try {
    s.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}
`)
    assert.equal(JSON.parse(await r.nextLine(5000)).result.protocolVersion, '2025-06-18')

    s.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } })}
`)
    assert.equal(
      JSON.parse(await r.nextLine(5000)).result.protocolVersion,
      '2024-11-05',
      'an unknown version falls back to the one we implement'
    )
  } finally {
    if (s.exitCode === null) {
      s.kill('SIGTERM')
      await waitExit(s, 3000).catch(() => {})
    }
  }
})
