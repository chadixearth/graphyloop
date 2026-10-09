// harness-omp-gemini.test.mjs — Oh My Pi (`omp`) and Gemini CLI harnesses, plus
// the v0.5.0 CLI UX: bare `graphyloop` = install, comma-list --harness, doctor
// `wired` column + fix: lines + DOCTOR marker.
//
// Every case drives the real CLI against a sandbox --home; nothing touches the
// real home directory. Slow by nature (real installs) — excluded from test:fast.
//
// Run with: node scripts/run-tests.mjs harness

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { detectHarnesses } from '../lib/detect.mjs'
import { geminiCommandFile, ompAgentFromSource } from '../lib/frontmatter.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = join(REPO_ROOT, 'bin', 'graphyloop.mjs')
const COMMANDS = JSON.parse(readFileSync(join(REPO_ROOT, 'config', 'opencode.commands.json'), 'utf8'))
const COMMAND_NAMES = Object.keys(COMMANDS).filter((k) => k.startsWith('chadi-'))
const AGENT_FILES = readdirSync(join(REPO_ROOT, 'agents')).filter((f) => f.endsWith('.md'))
const WORKFLOW = readFileSync(join(REPO_ROOT, 'workflow', 'AGENTS.md'), 'utf8')

const sandboxes = []
let home

function cli(...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', timeout: 120000 })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}

function seed(rel, content) {
  const p = join(home, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content)
  return p
}

function json(rel) {
  return JSON.parse(readFileSync(join(home, rel), 'utf8'))
}

function backups(dir) {
  let n = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) n += backups(full)
    else if (entry.name.includes('.bak-')) n++
  }
  return n
}

// Snapshot of every file under dir (relative path -> bytes) to prove "writes nothing".
function snapshot(dir, root = dir, out = new Map()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) snapshot(full, root, out)
    else out.set(full.slice(root.length), readFileSync(full).toString('base64'))
  }
  return out
}

// Minimal TOML reader for the two keys a gemini command file has; decodes basic
// string escapes so the round trip against the source template is exact.
function parseCommandToml(text) {
  const unescape = (s) => s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c) => {
    if (c.length === 5) return String.fromCharCode(parseInt(c.slice(1), 16))
    return { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' }[c] ?? assert.fail(`bad escape \\${c}`)
  })
  const d = /^description = "((?:[^"\\\n]|\\.)*)"\n/.exec(text)
  assert.ok(d, `description line is a valid basic string:\n${text.slice(0, 200)}`)
  const rest = text.slice(d[0].length)
  assert.ok(rest.startsWith('prompt = """\n'), 'prompt opens a multi-line basic string')
  const body = rest.slice('prompt = """\n'.length)
  // The closing delimiter is the first unescaped run of three quotes.
  let i = 0
  let end = -1
  while (i < body.length) {
    if (body[i] === '\\') { i += 2; continue }
    if (body.startsWith('"""', i)) { end = i; break }
    i++
  }
  assert.ok(end >= 0, 'prompt has a closing """')
  assert.equal(body.slice(end), '"""\n', 'nothing after the closing delimiter')
  return { description: unescape(d[1]), prompt: unescape(body.slice(0, end)) }
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'graphyloop-omp-gemini-'))
  sandboxes.push(home)
})

after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Detection + converters
// ---------------------------------------------------------------------------

test('detect finds omp (~/.omp) and gemini (~/.gemini) only when their dirs exist', () => {
  const byName = (h) => Object.fromEntries(detectHarnesses(h).map((x) => [x.name, x]))
  const none = byName(home)
  assert.equal(none.omp.present, false)
  assert.equal(none.gemini.present, false)

  mkdirSync(join(home, '.omp'))
  mkdirSync(join(home, '.gemini'))
  const some = byName(home)
  assert.equal(some.omp.present, true)
  assert.equal(some.gemini.present, true)
  assert.equal(some.omp.configPath, join(home, '.omp', 'agent', 'mcp.json'))
  assert.equal(some.gemini.configPath, join(home, '.gemini', 'settings.json'))
})

test('omp agent converter keeps only name + description and the body verbatim', () => {
  const src = '---\nmode: subagent\nmodel: some/model\ndescription: >\n  Does a thing.\n  Second line.\npermission:\n  edit: allow\n---\nBODY LINE\n'
  const out = ompAgentFromSource(src, 'chadi-x.md')
  assert.equal(out, '---\nname: chadi-x\ndescription: Does a thing. Second line.\n---\n\nBODY LINE\n')
  assert.ok(!/model:|tools:/.test(out.split('---')[1]))
  // A description YAML would misparse is quoted.
  const tricky = ompAgentFromSource('---\ndescription: Use when: x # y\n---\nB', 'a.md')
  assert.match(tricky, /description: "Use when: x # y"/)
})

test('gemini command converter escapes backslashes and triple quotes and maps $ARGUMENTS', () => {
  const template = 'Path C:\\dir\\new, say """hi""" and "quoted" then $ARGUMENTS end"'
  const parsed = parseCommandToml(geminiCommandFile('x', 'Desc with "quotes" and \\ slash', template))
  assert.equal(parsed.description, 'Desc with "quotes" and \\ slash')
  assert.equal(parsed.prompt, 'Path C:\\dir\\new, say """hi""" and "quoted" then {{args}} end"')
})

// ---------------------------------------------------------------------------
// omp
// ---------------------------------------------------------------------------

test('omp install wires mcp.json (keeps disabledServers), 26 agents without model, skills, rules', () => {
  const mcpFile = seed(
    join('.omp', 'agent', 'mcp.json'),
    JSON.stringify({ mcpServers: { other: { command: 'x', args: [] } }, disabledServers: ['foo'] }, null, 2)
  )
  const r = cli('install', '--harness', 'omp', '--home', home)
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /GRAPH_LOOP_INSTALLED/)

  const mcp = JSON.parse(readFileSync(mcpFile, 'utf8'))
  assert.deepEqual(mcp.disabledServers, ['foo'], 'disabledServers preserved')
  assert.deepEqual(mcp.mcpServers.other, { command: 'x', args: [] }, 'other server preserved')
  assert.deepEqual(mcp.mcpServers.graphyloop, {
    command: 'node',
    args: [join(home, '.graphyloop', 'mcp-server.mjs')],
  })

  const agentsDir = join(home, '.omp', 'agent', 'agents')
  const agents = readdirSync(agentsDir).filter((f) => f.endsWith('.md'))
  assert.equal(agents.length, AGENT_FILES.length)
  assert.equal(agents.length, 26, 'the full squad lands in omp')
  for (const f of agents) {
    const text = readFileSync(join(agentsDir, f), 'utf8')
    const front = text.split(/^---$/m)[1]
    assert.ok(!/^model:/m.test(front), `${f} has no model: key`)
    assert.match(front, /^name: /m)
    assert.match(front, /^description: /m)
    assert.ok(!/^tools:/m.test(front), `${f} has no tools: key`)
  }

  assert.ok(existsSync(join(home, '.omp', 'agent', 'skills', 'graphyloop-waves', 'SKILL.md')), 'skills installed')
  assert.equal(readFileSync(join(home, '.omp', 'agent', 'AGENTS.md'), 'utf8'), WORKFLOW)
  assert.ok(!existsSync(join(home, '.omp', 'agent', 'commands')), 'omp has no file commands')
})

test('omp never clobbers an existing AGENTS.md, even with --force, and warns instead', () => {
  const rules = seed(join('.omp', 'agent', 'AGENTS.md'), '# my own rules\n')
  for (const flags of [[], ['--force']]) {
    const r = cli('install', '--harness', 'omp', '--home', home, ...flags)
    assert.equal(r.code, 0, r.out + r.err)
    assert.equal(readFileSync(rules, 'utf8'), '# my own rules\n', `kept with flags ${flags}`)
    assert.match(r.out, /kept your AGENTS\.md; graphyloop rules are in skill graphyloop-workflow/)
  }
  assert.equal(readFileSync(rules, 'utf8'), '# my own rules\n', 'still untouched after both runs')
  assert.ok(!readdirSync(join(home, '.omp', 'agent')).some((f) => f.startsWith('AGENTS.md.bak')))
})

test('omp update path (forced) over an unchanged tree writes nothing and mints no backup', () => {
  assert.equal(cli('install', '--harness', 'omp', '--home', home).code, 0)
  const before = snapshot(join(home, '.omp'))
  const r = cli('install', '--harness', 'omp', '--home', home, '--force')
  assert.equal(r.code, 0, r.out + r.err)
  assert.deepEqual(snapshot(join(home, '.omp')), before, 'tree byte-identical')
  assert.equal(backups(join(home, '.omp')), 0)
  assert.match(r.out, /same {2}.+\(unchanged\)/)
})

test('omp uninstall removes only graphyloop-owned items', () => {
  const mcpFile = seed(
    join('.omp', 'agent', 'mcp.json'),
    JSON.stringify({ mcpServers: { other: { command: 'x', args: [] } }, disabledServers: ['foo'] })
  )
  assert.equal(cli('install', '--harness', 'omp', '--home', home).code, 0)
  seed(join('.omp', 'agent', 'agents', 'my-agent.md'), '---\nname: my-agent\n---\nmine\n')
  const edited = join(home, '.omp', 'agent', 'agents', 'chadi-backend.md')
  writeFileSync(edited, '---\nname: chadi-backend\ndescription: edited\n---\nHAND EDITED\n')
  seed(join('.omp', 'agent', 'skills', 'my-skill', 'SKILL.md'), '---\nname: my-skill\n---\n')

  const r = cli('uninstall', '--harness', 'omp', '--home', home)
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /GRAPH_LOOP_UNINSTALLED/)

  const mcp = JSON.parse(readFileSync(mcpFile, 'utf8'))
  assert.ok(mcp.mcpServers.other, 'user server kept')
  assert.ok(!mcp.mcpServers.graphyloop, 'graphyloop server removed')
  assert.deepEqual(mcp.disabledServers, ['foo'])
  assert.ok(existsSync(join(home, '.omp', 'agent', 'agents', 'my-agent.md')), 'user agent kept')
  assert.ok(existsSync(edited), 'edited graphyloop agent kept')
  assert.ok(!existsSync(join(home, '.omp', 'agent', 'agents', 'chadi-explorer.md')), 'pristine agent removed')
  assert.ok(existsSync(join(home, '.omp', 'agent', 'skills', 'my-skill', 'SKILL.md')), 'user skill kept')
  assert.ok(!existsSync(join(home, '.omp', 'agent', 'skills', 'graphyloop-waves')), 'bundled skill removed')
  assert.ok(!existsSync(join(home, '.omp', 'agent', 'AGENTS.md')), 'pristine rules file removed')
})

test('omp uninstall keeps a user AGENTS.md that differs from the graphyloop copy', () => {
  const rules = seed(join('.omp', 'agent', 'AGENTS.md'), '# mine\n')
  assert.equal(cli('install', '--harness', 'omp', '--home', home).code, 0)
  assert.equal(cli('uninstall', '--harness', 'omp', '--home', home).code, 0)
  assert.equal(readFileSync(rules, 'utf8'), '# mine\n')
})

// ---------------------------------------------------------------------------
// gemini
// ---------------------------------------------------------------------------

test('gemini install merges settings.json (user keys kept) and writes parse-valid TOML commands', () => {
  seed(
    join('.gemini', 'settings.json'),
    JSON.stringify({ theme: 'Dracula', mcpServers: { github: { command: 'npx', args: ['gh'] } } }, null, 2)
  )
  const r = cli('install', '--harness', 'gemini', '--home', home)
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /GRAPH_LOOP_INSTALLED/)

  const settings = json(join('.gemini', 'settings.json'))
  assert.equal(settings.theme, 'Dracula')
  assert.deepEqual(settings.mcpServers.github, { command: 'npx', args: ['gh'] })
  assert.deepEqual(settings.mcpServers.graphyloop, {
    command: 'node',
    args: [join(home, '.graphyloop', 'mcp-server.mjs')],
  })

  const cmdDir = join(home, '.gemini', 'commands')
  const files = readdirSync(cmdDir).filter((f) => f.endsWith('.toml'))
  assert.equal(files.length, COMMAND_NAMES.length)
  assert.equal(files.length, 15, '15 slash commands')
  for (const name of COMMAND_NAMES) {
    const parsed = parseCommandToml(readFileSync(join(cmdDir, `${name}.toml`), 'utf8'))
    assert.equal(parsed.description, COMMANDS[name].description)
    assert.equal(parsed.prompt, COMMANDS[name].template.replace(/\$ARGUMENTS/g, '{{args}}'), `${name} round-trips`)
  }
  assert.equal(readFileSync(join(home, '.gemini', 'GEMINI.md'), 'utf8'), WORKFLOW)
  assert.ok(!existsSync(join(home, '.gemini', 'agents')), 'gemini has no file agents')
})

test('gemini never clobbers an existing GEMINI.md, even with --force', () => {
  const rules = seed(join('.gemini', 'GEMINI.md'), '# my gemini rules\n')
  for (const flags of [[], ['--force']]) {
    const r = cli('install', '--harness', 'gemini', '--home', home, ...flags)
    assert.equal(r.code, 0, r.out + r.err)
    assert.equal(readFileSync(rules, 'utf8'), '# my gemini rules\n')
    assert.match(r.out, /kept your GEMINI\.md/)
  }
  assert.ok(!readdirSync(join(home, '.gemini')).some((f) => f.startsWith('GEMINI.md.bak')))
})

test('gemini forced re-install writes nothing; an edited command is backed up and restored', () => {
  assert.equal(cli('install', '--harness', 'gemini', '--home', home).code, 0)
  const before = snapshot(join(home, '.gemini'))
  const same = cli('install', '--harness', 'gemini', '--home', home, '--force')
  assert.equal(same.code, 0, same.out + same.err)
  assert.deepEqual(snapshot(join(home, '.gemini')), before)
  assert.equal(backups(join(home, '.gemini')), 0)

  const edited = join(home, '.gemini', 'commands', `${COMMAND_NAMES[0]}.toml`)
  writeFileSync(edited, 'prompt = "edited"\n')
  const again = cli('install', '--harness', 'gemini', '--home', home, '--force')
  assert.equal(again.code, 0)
  assert.equal(backups(join(home, '.gemini')), 1, 'exactly the changed command is backed up')
  assert.equal(
    parseCommandToml(readFileSync(edited, 'utf8')).prompt,
    COMMANDS[COMMAND_NAMES[0]].template.replace(/\$ARGUMENTS/g, '{{args}}'),
    'edited command restored to the graphyloop copy'
  )
})

test('gemini uninstall removes only graphyloop-owned items', () => {
  seed(join('.gemini', 'settings.json'), JSON.stringify({ theme: 'x', mcpServers: { github: { command: 'npx', args: [] } } }))
  assert.equal(cli('install', '--harness', 'gemini', '--home', home).code, 0)
  seed(join('.gemini', 'commands', 'mine.toml'), 'prompt = "mine"\n')
  const edited = join(home, '.gemini', 'commands', `${COMMAND_NAMES[1]}.toml`)
  writeFileSync(edited, 'prompt = "edited"\n')

  const r = cli('uninstall', '--harness', 'gemini', '--home', home)
  assert.equal(r.code, 0, r.out + r.err)
  const settings = json(join('.gemini', 'settings.json'))
  assert.equal(settings.theme, 'x')
  assert.ok(settings.mcpServers.github)
  assert.ok(!settings.mcpServers.graphyloop)
  assert.ok(existsSync(join(home, '.gemini', 'commands', 'mine.toml')))
  assert.ok(existsSync(edited), 'edited command kept')
  assert.ok(!existsSync(join(home, '.gemini', 'commands', `${COMMAND_NAMES[0]}.toml`)), 'pristine command removed')
  assert.ok(!existsSync(join(home, '.gemini', 'GEMINI.md')))
})

// ---------------------------------------------------------------------------
// CLI UX
// ---------------------------------------------------------------------------

test('--harness accepts a comma list and rejects unknown names listing all seven', () => {
  const ok = cli('install', '--harness', 'claude,omp', '--home', home)
  assert.equal(ok.code, 0, ok.out + ok.err)
  assert.ok(existsSync(join(home, '.claude', 'agents')), 'claude installed')
  assert.ok(existsSync(join(home, '.omp', 'agent', 'agents')), 'omp installed')
  assert.ok(!existsSync(join(home, '.gemini')), 'gemini not installed')
  assert.ok(!existsSync(join(home, '.cursor')), 'cursor not installed')
  assert.match(ok.out, /harness: claude, omp/)

  const bad = cli('install', '--harness', 'claude,nope', '--home', home)
  assert.equal(bad.code, 1)
  for (const name of ['opencode', 'claude', 'codex', 'cursor', 'dsh', 'omp', 'gemini']) {
    assert.ok(bad.err.includes(name), `error lists ${name}: ${bad.err}`)
  }
})

test('bare graphyloop installs detected harnesses; --help still prints help', () => {
  mkdirSync(join(home, '.omp'), { recursive: true })
  const r = cli('--home', home)
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /GRAPH_LOOP_INSTALLED/)
  assert.match(r.out, /harness: omp\b/)
  assert.ok(existsSync(join(home, '.omp', 'agent', 'mcp.json')), 'omp wired by the bare command')
  assert.ok(!existsSync(join(home, '.gemini')), 'undetected harness left alone')
  assert.match(r.out, /Oh My Pi:.*graphyloop workflow init/, 'tailored next step')
  assert.ok(!/OpenCode:\s+ask/.test(r.out), 'next steps only list installed harnesses')

  const help = cli('--help')
  assert.equal(help.code, 0)
  assert.match(help.out, /Usage:/)
})

test('bare graphyloop on a machine with no harnesses installs all seven', () => {
  const r = cli('--home', home)
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /installing for all 7 harnesses/)
  for (const rel of [
    join('.config', 'opencode', 'opencode.json'),
    join('.claude.json'),
    join('.codex', 'config.toml'),
    join('.cursor', 'mcp.json'),
    join('.dsh', 'cordis.patch.yml'),
    join('.omp', 'agent', 'mcp.json'),
    join('.gemini', 'settings.json'),
  ]) {
    assert.ok(existsSync(join(home, rel)), `${rel} written`)
  }
})

test('doctor: wired column, fix: lines for unwired harnesses, DOCTOR marker', () => {
  // omp present but never wired.
  mkdirSync(join(home, '.omp'), { recursive: true })
  const bad = cli('doctor', '--home', home)
  assert.equal(bad.code, 0, 'doctor always exits 0')
  assert.match(bad.out, /\bomp\s+present\s+no\b/)
  assert.match(bad.out, /fix: npx -y graphyloop install --harness omp/)
  const issues = /GRAPH_LOOP_DOCTOR_ISSUES (\d+)/.exec(bad.out)
  assert.ok(issues, bad.out)
  assert.ok(Number(issues[1]) >= 1)

  assert.equal(cli('install', '--harness', 'omp', '--home', home).code, 0)
  const good = cli('doctor', '--home', home)
  assert.match(good.out, /\bomp\s+present\s+yes\b/)
  assert.ok(!/fix: npx -y graphyloop install --harness omp/.test(good.out))
  assert.match(good.out, /GRAPH_LOOP_DOCTOR_OK/)
  assert.ok(!/GRAPH_LOOP_DOCTOR_ISSUES/.test(good.out))
})

test('doctor treats an entry pointing at a missing mcp-server.mjs as not wired', () => {
  seed(
    join('.gemini', 'settings.json'),
    JSON.stringify({ mcpServers: { graphyloop: { command: 'node', args: [join(home, 'nowhere', 'mcp-server.mjs')] } } })
  )
  const r = cli('doctor', '--home', home)
  assert.match(r.out, /\bgemini\s+present\s+no\b/)
  assert.match(r.out, /fix: npx -y graphyloop install --harness gemini/)
})

test('all-harness install then doctor reports 7 wired rows and DOCTOR_OK', () => {
  assert.equal(cli('install', '--harness', 'all', '--home', home).code, 0)
  const r = cli('doctor', '--home', home)
  for (const name of ['opencode', 'claude', 'codex', 'cursor', 'dsh', 'omp', 'gemini']) {
    assert.match(r.out, new RegExp(`\\b${name}\\s+present\\s+yes\\b`), `${name} wired:\n${r.out}`)
  }
  assert.match(r.out, /GRAPH_LOOP_DOCTOR_OK/)
})
