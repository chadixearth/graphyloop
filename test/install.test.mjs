// install.test.mjs — per-harness installer tests (B7). Contract: CONTRACTS.md
// "CONTRACT: installers", "CONTRACT: cli.mjs (B6)", "CONTRACT: detect.mjs".
//
// Sandbox HOME with pre-seeded user configs (custom keys in opencode.json,
// existing mcpServers in .claude.json, existing [model] section in
// .codex/config.toml, existing server in .cursor/mcp.json). Drives
// `node bin/graphyloop.mjs install|doctor` via spawnSync with --home <sandbox>.
//
// Asserts: user keys preserved everywhere, graphyloop entries added exactly once,
// agents dirs populated, 12 commands per harness, AGENTS.md installed, re-runs
// idempotent, --skip-agents leaves agents untouched, doctor lists all 4 harnesses.
// No network, no npm deps. Run with: node --test test/

import { test, before, after } from 'node:test'
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
import { TOOL_NAMES } from '../lib/mcp.mjs'
import { CORE_LIB_FILES } from '../lib/install-core.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = join(REPO_ROOT, 'bin', 'graphyloop.mjs')
// Derived from the repo, not hardcoded: adding an agent or a command should not
// require editing this file, but a *dropped* one still fails the assertions.
const AGENT_COUNT = readdirSync(join(REPO_ROOT, 'agents')).filter((f) => f.endsWith('.md')).length
const COMMAND_COUNT = Object.keys(
  JSON.parse(readFileSync(join(REPO_ROOT, 'config', 'opencode.commands.json'), 'utf8'))
).filter((k) => k.startsWith('chadi-')).length

let sandbox

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runCli(args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env },
    timeout: 60000,
  })
}

function write(root, relPath, content) {
  const p = join(root, relPath)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content)
  return p
}

function countMd(dir) {
  if (!existsSync(dir)) return 0
  return readdirSync(dir).filter((f) => f.endsWith('.md')).length
}

function countOccurrences(text, needle) {
  let n = 0
  let i = 0
  while ((i = text.indexOf(needle, i)) >= 0) {
    n += 1
    i += needle.length
  }
  return n
}

// First YAML frontmatter block of an .md file ("" when absent).
function frontmatterOf(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  return m ? m[1] : ''
}

const normalizePlugin = (value) => String(value).replace(/^\.\//, '').replace(/[\\/]+$/, '')
const GRAPHYLOOP_PLUGIN = 'plugins/graphyloop/plugin.js'

// ---------------------------------------------------------------------------
// Sandbox: pre-seeded user configs (what the installer must never destroy)
// ---------------------------------------------------------------------------

before(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'graphyloop-install-'))

  // opencode: custom model, custom command, custom plugin entry, custom default_agent
  write(
    sandbox,
    join('.config', 'opencode', 'opencode.json'),
    JSON.stringify(
      {
        model: 'user-model-keep',
        default_agent: 'user-default-agent',
        plugin: ['./user-plugin.js'],
        command: { 'user-custom-cmd': { description: 'user custom command' } },
      },
      null,
      2
    )
  )

  // claude: existing mcpServers (one other server) + custom top-level key
  write(
    sandbox,
    '.claude.json',
    JSON.stringify(
      {
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
        },
        customKey: 'keep-me',
      },
      null,
      2
    )
  )

  // claude: user-authored agent (content differs from shipped — must survive uninstall)
  write(
    sandbox,
    join('.claude', 'agents', 'my-custom-agent.md'),
    '---\nname: my-custom-agent\ndescription: user-authored agent\ntools: Read\n---\n\nMy own agent.\n'
  )

  // codex: existing [model] section + custom section
  write(
    sandbox,
    join('.codex', 'config.toml'),
    [
      '# user codex config',
      '[model]',
      'model = "gpt-5-codex"',
      '',
      '[extra.user]',
      'enabled = true',
      '',
    ].join('\n')
  )

  // cursor: existing server
  write(
    sandbox,
    join('.cursor', 'mcp.json'),
    JSON.stringify(

      {
        mcpServers: {
          github: { command: 'npx', args: ['@modelcontextprotocol/server-github'] },
        },
      },
      null,
      2
    )
  )
})

after(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('install --harness all --force installs every harness and preserves user config', () => {
  const res = runCli(['install', '--home', sandbox, '--harness', 'all', '--force'])
  assert.equal(res.status, 0, res.stdout + res.stderr)
  assert.ok(res.stdout.includes('GRAPH_LOOP_INSTALLED'), res.stdout)

  // --- opencode ---
  const ocRoot = join(sandbox, '.config', 'opencode')
  const oc = JSON.parse(readFileSync(join(ocRoot, 'opencode.json'), 'utf8'))
  assert.equal(oc.model, 'user-model-keep', 'custom model key preserved')
  assert.equal(oc.default_agent, 'user-default-agent', 'default_agent preserved (never overwritten)')
  assert.ok(oc.command['user-custom-cmd'], 'custom command preserved')
  const chadiCmds = Object.keys(oc.command).filter((k) => k.startsWith('chadi-'))
  assert.equal(chadiCmds.length, COMMAND_COUNT, `expected ${COMMAND_COUNT} chadi commands`)
  const plugins = oc.plugin.map(normalizePlugin)
  assert.equal(
    plugins.filter((p) => p === GRAPHYLOOP_PLUGIN).length,
    1,
    `graphyloop plugin entry present once: ${JSON.stringify(plugins)}`
  )
  assert.equal(plugins.filter((p) => p === 'user-plugin.js').length, 1, 'user plugin kept')
  assert.equal(countMd(join(ocRoot, 'agents')), AGENT_COUNT, 'opencode agents dir populated')
  assert.ok(existsSync(join(ocRoot, 'AGENTS.md')), 'opencode AGENTS.md installed')

  // --- claude ---
  const claudeJson = JSON.parse(readFileSync(join(sandbox, '.claude.json'), 'utf8'))
  assert.equal(claudeJson.customKey, 'keep-me', 'claude custom key preserved')
  assert.deepEqual(
    claudeJson.mcpServers.filesystem,
    { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
    'existing claude mcp server preserved'
  )
  assert.ok(claudeJson.mcpServers.graphyloop, 'graphyloop mcp entry added to claude')
  assert.equal(claudeJson.mcpServers.graphyloop.command, 'node')
  assert.ok(claudeJson.mcpServers.graphyloop.args[0].includes('mcp-server.mjs'), claudeJson.mcpServers.graphyloop.args[0])
  assert.equal(Object.keys(claudeJson.mcpServers).filter((k) => k === 'graphyloop').length, 1)

  const claudeAgents = join(sandbox, '.claude', 'agents')
  assert.ok(countMd(claudeAgents) >= AGENT_COUNT, 'claude agents populated (shipped + user-authored preserved)')
  for (const f of readdirSync(claudeAgents).filter((f) => f.endsWith('.md'))) {
    const fm = frontmatterOf(readFileSync(join(claudeAgents, f), 'utf8'))
    const base = f.replace(/\.md$/, '')
    assert.ok(fm.includes(`name: ${base}`), `${f}: name from filename`)
    assert.match(fm, /description:/, `${f}: description`)
    assert.match(fm, /tools:/, `${f}: tools`)
    assert.doesNotMatch(fm, /^model:/m, `${f}: model omitted (inherit)`)
  }
  const claudeCommands = join(sandbox, '.claude', 'commands')
  assert.equal(countMd(claudeCommands), COMMAND_COUNT, 'claude commands dir populated')
  for (const f of readdirSync(claudeCommands).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(join(claudeCommands, f), 'utf8')
    assert.match(text, /^---\r?\n/, `${f}: command frontmatter`)
    assert.match(frontmatterOf(text), /description:/, `${f}: description`)
  }
  assert.ok(existsSync(join(sandbox, '.claude', 'AGENTS.md')), 'claude AGENTS.md installed')

  // --- codex ---
  const toml = readFileSync(join(sandbox, '.codex', 'config.toml'), 'utf8')
  assert.ok(toml.includes('[model]'), 'user [model] section preserved')
  assert.ok(toml.includes('model = "gpt-5-codex"'), 'user model value preserved')
  assert.ok(toml.includes('[extra.user]'), 'custom toml section preserved')
  assert.equal(countOccurrences(toml, '[mcp_servers.graphyloop]'), 1, 'codex graphyloop mcp section once')
  assert.ok(toml.includes('command = "node"'), 'codex mcp command node')
  assert.equal(countMd(join(sandbox, '.codex', 'prompts')), COMMAND_COUNT, 'codex prompts populated')
  const codexPromptFiles = readdirSync(join(sandbox, '.codex', 'prompts')).filter((f) => f.endsWith('.md'))
  if (codexPromptFiles.length > 0) {
    const firstPrompt = readFileSync(join(sandbox, '.codex', 'prompts', codexPromptFiles[0]), 'utf8')
    assert.ok(!firstPrompt.trimStart().startsWith('---'), 'codex prompts are frontmatter-less')
  }
  assert.ok(existsSync(join(sandbox, '.codex', 'AGENTS.md')), 'codex AGENTS.md installed')

  // --- cursor ---
  const cursorJson = JSON.parse(readFileSync(join(sandbox, '.cursor', 'mcp.json'), 'utf8'))
  assert.deepEqual(
    cursorJson.mcpServers.github,
    { command: 'npx', args: ['@modelcontextprotocol/server-github'] },
    'existing cursor mcp server preserved'
  )
  assert.ok(cursorJson.mcpServers.graphyloop, 'graphyloop mcp entry added to cursor')
  assert.equal(Object.keys(cursorJson.mcpServers).filter((k) => k === 'graphyloop').length, 1)
  assert.ok(existsSync(join(sandbox, '.cursor', 'rules', 'AGENTS.md')), 'cursor AGENTS.md installed')

  // --- core install target (~/.graphyloop) ---
  assert.ok(existsSync(join(sandbox, '.graphyloop', 'graphyloop', 'cli.mjs')), 'adapter cli copied')
  assert.ok(existsSync(join(sandbox, '.graphyloop', 'plugins', 'graphyloop', 'plugin.js')), 'plugin copied')
  assert.ok(existsSync(join(sandbox, '.graphyloop', 'mcp-server.mjs')), 'mcp server copied')

  // --- opencode plugin must exist at the path opencode.json references ---
  const ocCfg = JSON.parse(readFileSync(join(sandbox, '.config', 'opencode', 'opencode.json'), 'utf8'))
  const pluginEntry = ocCfg.plugin.find((p) => String(p).includes('graphyloop/plugin.js'))
  assert.ok(pluginEntry, 'graphyloop plugin entry present in opencode.json')
  const pluginDest = join(sandbox, '.config', 'opencode', String(pluginEntry).replace(/^\.\//, ''))
  assert.ok(existsSync(pluginDest), `plugin file exists at referenced path: ${pluginDest}`)
  const repoPlugin = readFileSync(join(REPO_ROOT, 'plugin', 'graphyloop', 'plugin.js'), 'utf8')
  assert.equal(readFileSync(pluginDest, 'utf8'), repoPlugin, 'installed plugin equals shipped plugin')
  // plugin.js must resolve the CLI under the new ~/.graphyloop core location
  assert.ok(repoPlugin.includes('.graphyloop'), 'plugin.js points at ~/.graphyloop core location')
})

test('re-running install is idempotent (no duplicate graphyloop entries)', () => {
  const res = runCli(['install', '--home', sandbox, '--harness', 'all', '--force'])
  assert.equal(res.status, 0, res.stdout + res.stderr)
  assert.ok(res.stdout.includes('GRAPH_LOOP_INSTALLED'))

  const oc = JSON.parse(readFileSync(join(sandbox, '.config', 'opencode', 'opencode.json'), 'utf8'))
  assert.equal(
    oc.plugin.map(normalizePlugin).filter((p) => p === GRAPHYLOOP_PLUGIN).length,
    1,
    'opencode: no duplicate graphyloop plugin entry'
  )
  assert.equal(
    Object.keys(oc.command).filter((k) => k.startsWith('chadi-')).length,
    COMMAND_COUNT,
    'opencode: no duplicate chadi commands'
  )

  const claudeJson = JSON.parse(readFileSync(join(sandbox, '.claude.json'), 'utf8'))
  assert.equal(Object.keys(claudeJson.mcpServers).filter((k) => k === 'graphyloop').length, 1, 'claude: graphyloop once')

  const toml = readFileSync(join(sandbox, '.codex', 'config.toml'), 'utf8')
  assert.equal(countOccurrences(toml, '[mcp_servers.graphyloop]'), 1, 'codex: graphyloop section once')

  const cursorJson = JSON.parse(readFileSync(join(sandbox, '.cursor', 'mcp.json'), 'utf8'))
  assert.equal(Object.keys(cursorJson.mcpServers).filter((k) => k === 'graphyloop').length, 1, 'cursor: graphyloop once')
})

test('installed MCP server runs from ~/.graphyloop (self-contained artifact)', async () => {
  const { spawn } = await import('node:child_process')
  const installedMcp = join(sandbox, '.graphyloop', 'mcp-server.mjs')
  assert.ok(existsSync(installedMcp), 'mcp-server.mjs installed')
  for (const name of CORE_LIB_FILES) {
    assert.ok(existsSync(join(sandbox, '.graphyloop', 'lib', name)), `lib/${name} installed alongside`)
  }

  const projectDir = mkdtempSync(join(tmpdir(), 'graphyloop-inst-mcp-proj-'))
  const s = spawn(process.execPath, [installedMcp], {
    env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: projectDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let out = ''
  s.stdout.setEncoding('utf8')
  s.stdout.on('data', (d) => { out += d })
  s.stderr.resume()
  const exit = new Promise((res) => s.on('exit', res))

  // try/finally is load-bearing: a failing assertion used to skip stdin.end(),
  // and the spawned server then held its stdio pipes open forever — `node --test`
  // waits on the handle, so one stale expectation hung the whole suite instead of
  // reporting a failure.
  try {
    s.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`)
    s.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`)
    await new Promise((res) => setTimeout(res, 1500))
    const lines = out.trim().split('\n')
    assert.equal(lines.length, 2, `installed server responded to both requests: ${out}`)
    assert.equal(JSON.parse(lines[0]).result.serverInfo.name, 'graphyloop-mcp')
    // Count comes from the shipped registry, so adding a tool never breaks this.
    assert.equal(
      JSON.parse(lines[1]).result.tools.length,
      TOOL_NAMES.length,
      `installed server lists ${TOOL_NAMES.length} tools`
    )
  } finally {
    s.stdin.end()
    await Promise.race([exit, new Promise((res) => setTimeout(res, 3000))])
    if (s.exitCode === null) s.kill('SIGKILL')
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('--skip-agents leaves agent directories untouched', () => {
  const ocAgents = join(sandbox, '.config', 'opencode', 'agents')
  const claudeAgents = join(sandbox, '.claude', 'agents')
  const beforeOc = countMd(ocAgents)
  const beforeClaude = countMd(claudeAgents)
  assert.ok(beforeOc > 0 && beforeClaude > 0, 'agents present before skip run')

  const res = runCli(['install', '--home', sandbox, '--harness', 'all', '--force', '--skip-agents'])
  assert.equal(res.status, 0, res.stdout + res.stderr)
  assert.equal(countMd(ocAgents), beforeOc, 'opencode agents unchanged')
  assert.equal(countMd(claudeAgents), beforeClaude, 'claude agents unchanged')
})

test('uninstall removes only graphyloop additions, keeps user config, exit 0', () => {
  const res = runCli(['uninstall', '--home', sandbox])
  assert.equal(res.status, 0, `uninstall exit 0: ${res.stdout + res.stderr}`)
  assert.ok(res.stdout.includes('GRAPH_LOOP_UNINSTALLED'), res.stdout)

  // user keys survive
  const oc = JSON.parse(readFileSync(join(sandbox, '.config', 'opencode', 'opencode.json'), 'utf8'))
  assert.equal(oc.model, 'user-model-keep', 'user model preserved after uninstall')
  assert.equal(oc.command['user-custom-cmd'].description, 'user custom command', 'user command preserved after uninstall')
  assert.equal(oc.default_agent, 'user-default-agent', 'user default_agent preserved after uninstall')
  assert.ok(
    !oc.plugin.some((p) => String(p).includes('graphyloop/plugin.js')),
    'graphyloop plugin entry removed from opencode.json'
  )
  assert.ok(!Object.keys(oc.command).some((k) => k.startsWith('chadi-')), 'chadi commands removed from opencode.json')

  const claudeJson = JSON.parse(readFileSync(join(sandbox, '.claude.json'), 'utf8'))
  assert.ok(claudeJson.mcpServers.filesystem, 'user claude server preserved')
  assert.equal(claudeJson.customKey, 'keep-me', 'user claude key preserved')
  assert.ok(!claudeJson.mcpServers.graphyloop, 'graphyloop removed from .claude.json')

  const toml = readFileSync(join(sandbox, '.codex', 'config.toml'), 'utf8')
  assert.ok(toml.includes('[model]'), 'user codex section preserved')
  assert.ok(!toml.includes('mcp_servers.graphyloop'), 'graphyloop section removed from config.toml')

  const cursorJson = JSON.parse(readFileSync(join(sandbox, '.cursor', 'mcp.json'), 'utf8'))
  assert.ok(cursorJson.mcpServers.github, 'user cursor server preserved')
  assert.ok(!cursorJson.mcpServers.graphyloop, 'graphyloop removed from cursor mcp.json')

  // core fully gone (backups *.bak-* may remain — that is by design)
  assert.ok(!existsSync(join(sandbox, '.graphyloop', 'graphyloop', 'cli.mjs')), 'core cli removed')
  assert.ok(!existsSync(join(sandbox, '.graphyloop', 'mcp-server.mjs')), 'mcp server removed')
  assert.ok(!existsSync(join(sandbox, '.graphyloop', 'lib', 'mcp.mjs')), 'lib/mcp.mjs removed')
  assert.ok(!existsSync(join(sandbox, '.graphyloop', 'lib', 'engine.mjs')), 'lib/engine.mjs removed')

  // user agents (seeded, content differs) survive
  assert.ok(existsSync(join(sandbox, '.claude', 'agents', 'my-custom-agent.md')), 'user claude agent preserved')
})

test('re-install after uninstall restores everything (round trip)', () => {
  const res = runCli(['install', '--home', sandbox, '--harness', 'all', '--force'])
  assert.equal(res.status, 0, res.stdout + res.stderr)
  assert.ok(res.stdout.includes('GRAPH_LOOP_INSTALLED'))
  assert.ok(existsSync(join(sandbox, '.graphyloop', 'graphyloop', 'cli.mjs')), 'core restored')
  assert.ok(existsSync(join(sandbox, '.graphyloop', 'lib', 'mcp.mjs')), 'lib restored')
  const oc = JSON.parse(readFileSync(join(sandbox, '.config', 'opencode', 'opencode.json'), 'utf8'))
  assert.ok(oc.plugin.some((p) => String(p).includes('graphyloop/plugin.js')), 'plugin entry restored')
  assert.equal(Object.keys(oc.command).filter((k) => k.startsWith('chadi-')).length, COMMAND_COUNT, 'commands restored')
  const toml = readFileSync(join(sandbox, '.codex', 'config.toml'), 'utf8')
  assert.equal(countOccurrences(toml, '[mcp_servers.graphyloop]'), 1, 'codex section restored once')
})

test('doctor lists all four harnesses', () => {
  const res = runCli(['doctor', '--home', sandbox])
  assert.equal(res.status, 0, res.stdout + res.stderr)
  const out = res.stdout.toLowerCase()
  for (const name of ['opencode', 'claude', 'codex', 'cursor']) {
    assert.ok(out.includes(name), `doctor output missing ${name}: ${res.stdout}`)
  }
})
