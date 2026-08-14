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
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MCP_SERVER = join(REPO_ROOT, 'mcp-server.mjs')
const ADAPTER_CLI = join(REPO_ROOT, 'adapter', 'cli.mjs')

// The 8 tools the contract mandates.
const EXPECTED_TOOLS = [
  'agent_spawn',
  'agent_list',
  'task_distribute',
  'swarm_state',
  'task_record',
  'memory_store',
  'memory_search',
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
  assert.equal(msg.result.serverInfo.version, '0.1.0')
})

test('notifications/initialized produces no response', { timeout: 15000 }, async () => {
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
  await assert.rejects(reader.nextLine(100), /timeout/)
})

test('ping returns empty result', { timeout: 15000 }, async () => {
  const msg = await rpc('ping', {})
  assert.deepEqual(msg.result, {})
})

test('tools/list returns the 8 contracted tools with schemas', { timeout: 15000 }, async () => {
  const msg = await rpc('tools/list', {})
  assert.ok(Array.isArray(msg.result.tools))
  assert.equal(msg.result.tools.length, 8, `expected 8 tools, got ${msg.result.tools.length}`)
  const names = msg.result.tools.map((t) => t.name)
  for (const expected of EXPECTED_TOOLS) {
    assert.ok(names.includes(expected), `missing tool ${expected}`)
  }
  assert.equal(new Set(names).size, 8, 'duplicate tool names')
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

test('missing graphyloop CLI: tools/list works, tools/call returns isError', { timeout: 15000 }, async () => {
  // Force an empty fake home via GRAPHYLOOP_HOME so the default CLI path
  // (~/.graphyloop/graphyloop/cli.mjs) is guaranteed missing regardless of the
  // machine's real ~/.graphyloop state.
  const emptyHome = mkdtempSync(join(tmpdir(), 'graphyloop-mcp-empty-'))
  const s = spawnServer({ GRAPHYLOOP_HOME: emptyHome, GRAPHYLOOP_CLI: undefined })
  const r = createLineReader(s.stdout)
  try {
    s.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })}\n`)
    const list = JSON.parse(await r.nextLine(5000))
    assert.equal(list.result.tools.length, 8)

    s.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'memory_search', arguments: { query: 'x' } } })}\n`
    )
    const call = JSON.parse(await r.nextLine(5000))
    assert.equal(call.result.isError, true)
    assert.ok(call.result.content[0].text.includes('graphyloop CLI not found'), call.result.content[0].text)
  } finally {
    if (s.exitCode === null) {
      s.kill('SIGTERM')
      await waitExit(s, 3000).catch(() => {})
    }
    rmSync(emptyHome, { recursive: true, force: true })
  }
})
