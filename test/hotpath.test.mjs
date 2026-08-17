// Hot-path suite — the caching that makes tool calls cheap, and the invariants
// that keep it honest.
//
// The engine used to re-read and re-parse <project>/.graphyloop/state.json on
// every single call, which was the dominant cost of every MCP tool (2.4 ms for a
// read-only status at 800 memories, before any work). It is now cached against
// the file's stat signature. That is a correctness risk, not just a speed change:
// a cache that misses an outside write would make an agent act on a stale swarm,
// and a cache that keeps an unsaved mutation would invent state that never hit
// disk. Both are tested here, by observation rather than by timing, so the suite
// is deterministic on a loaded CI box.
//
// engine.metrics() exists for exactly this: loads vs parses is observable, so
// "the cache works" is an assertion instead of a claim.
//
// No network, no npm deps. Run with: node scripts/run-tests.mjs hotpath

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createEngine } from '../lib/engine.mjs'
import { TOOL_NAMES } from '../lib/mcp.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(REPO_ROOT, 'adapter', 'cli.mjs')
const MCP_SERVER = join(REPO_ROOT, 'mcp-server.mjs')

const dirs = []
const children = [] // spawned MCP servers, reaped in after()
let project

function stateFile(root = project) {
  return join(root, '.graphyloop', 'state.json')
}

/** Remember a spawned server so teardown can wait for it before deleting its cwd. */
function track(child) {
  children.push(child)
  return child
}

/** A second OS process mutating the same state file — the staleness scenario. */
function otherProcess(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: project },
  })
  assert.equal(r.status, 0, `cli ${args[0]} failed: ${r.stdout}${r.stderr}`)
  return JSON.parse(r.stdout)
}

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'graphyloop-hotpath-'))
  dirs.push(project)
})

after(async () => {
  // Windows keeps a handle on a child's cwd until it actually exits, and a killed
  // process exits asynchronously — so wait for the servers, then delete, then
  // shrug: these are temp directories the OS reclaims anyway.
  await Promise.all(children.map((child) => new Promise((done) => {
    if (child.exitCode !== null || child.signalCode) return done()
    child.once('exit', done)
    try { child.kill() } catch { done() }
    setTimeout(done, 2000).unref()
  })))
  for (const dir of dirs) {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }) } catch { /* temp dir */ }
  }
})

// ---------------------------------------------------------------------------
// The cache does its job
// ---------------------------------------------------------------------------

test('repeated read-only calls parse the state file once, not once per call', () => {
  const engine = createEngine({ projectRoot: project })
  engine.init()
  for (let i = 0; i < 40; i++) engine.status()
  for (let i = 0; i < 20; i++) engine.memorySearch({ query: 'initialized' })

  const m = engine.metrics()
  assert.ok(m.loads >= 60, `every call still loads state (got ${m.loads})`)
  assert.equal(m.parses, 0, `no re-parse after the write that seeded the cache (parses: ${m.parses})`)
})

test('a write refreshes the cache instead of dropping it', () => {
  const engine = createEngine({ projectRoot: project })
  engine.init()
  const before = engine.metrics().parses
  for (let i = 0; i < 10; i++) {
    engine.memoryStore({ content: `lesson ${i}`, type: 'lesson' })
    engine.status() // the read right after a write is the common pattern
  }
  assert.equal(engine.metrics().parses, before, 'a write re-stamps the cache with what it just wrote')
  assert.equal(engine.status().memories, 11, 'init event + 10 stores')
})

// ---------------------------------------------------------------------------
// The cache cannot go stale — this is the part that would be a bug, not a slowdown
// ---------------------------------------------------------------------------

test('a write by another process is visible to the next call', () => {
  const engine = createEngine({ projectRoot: project })
  engine.init()
  assert.equal(engine.memorySearch({ query: 'outside' }).results.length, 0)

  otherProcess(['memory-store', '--content', 'decision taken outside this process', '--type', 'decision'])

  const found = engine.memorySearch({ query: 'outside' })
  assert.equal(found.results.length, 1, 'the outside write is picked up without restarting')
  assert.equal(found.results[0].content, 'decision taken outside this process')
  assert.ok(engine.metrics().parses >= 1, 'and it cost a real re-parse, so the signature changed')
})

test('an outside write between two reads changes the answer', () => {
  const engine = createEngine({ projectRoot: project })
  engine.init()
  const first = engine.status().agents
  otherProcess(['spawn', '--type', 'tester', '--id', 'outside-tester'])
  const second = engine.status()
  assert.equal(second.agents, first + 1, 'agent count reflects the other process')
  assert.ok(second.agentsList.some((a) => a.id === 'outside-tester'), 'and the roster is the new one')
})

test('a write transaction that fails leaves nothing behind in the cache', () => {
  const engine = createEngine({ projectRoot: project })
  engine.init()
  // maxAgents is 8 and init seeds the leader, so the 8th spawn is rejected after
  // the state was already loaded — the error path must not publish a mutation.
  const ids = []
  for (let i = 0; i < 12; i++) {
    const r = engine.spawn({ type: 'coder', id: `c-${i}` })
    if (r.ok) ids.push(r.agent.id)
  }
  assert.equal(ids.length, 7, `filled up to maxAgents (spawned ${ids.length})`)

  const onDisk = JSON.parse(readFileSync(stateFile(), 'utf8'))
  assert.equal(engine.status().agents, onDisk.agents.length, 'in-memory view matches the file exactly')
  assert.equal(onDisk.agents.length, 8, 'leader + 7 workers, nothing invented by the rejected calls')
})

test('a corrupt state file written underneath a live engine is quarantined, not served from cache', () => {
  const engine = createEngine({ projectRoot: project })
  engine.init()
  engine.memoryStore({ content: 'before corruption' })
  writeFileSync(stateFile(), '{"agents": [ truncated')

  const status = engine.status()
  assert.equal(status.initialized, false, 'recovered as fresh instead of serving the cached copy')
})

// ---------------------------------------------------------------------------
// Search results must not change because the search text is cached
// ---------------------------------------------------------------------------

test('cached search text yields the same ranking as a cold engine', () => {
  const warm = createEngine({ projectRoot: project })
  warm.init()
  for (let i = 0; i < 50; i++) {
    warm.memoryStore({
      content: `lesson ${i}: the lock path under contention on module ${i % 7}`,
      type: i % 2 ? 'lesson' : 'decision',
      metadata: { module: `mod-${i % 7}`, index: i },
    })
  }
  const queries = ['lock path under contention', 'mod-3', 'module 5', 'lesson', 'nothing matches this at all']
  const cold = createEngine({ projectRoot: project }) // fresh process-equivalent: no caches at all

  for (const query of queries) {
    for (const type of [undefined, 'lesson']) {
      const a = warm.memorySearch({ query, type, limit: '10' })
      const b = cold.memorySearch({ query, type, limit: '10' })
      assert.deepEqual(
        a.results.map((r) => [r.id, r.score]),
        b.results.map((r) => [r.id, r.score]),
        `ranking differs for "${query}"${type ? ` (type ${type})` : ''}`
      )
      assert.equal(a.searched, b.searched, `searched count differs for "${query}"`)
    }
  }
  // A second search over the same store must reuse the text, not rebuild it.
  assert.equal(warm.metrics().searches, queries.length * 2)
})

test('search still finds an entry stored after the text cache warmed up', () => {
  const engine = createEngine({ projectRoot: project })
  engine.init()
  engine.memoryStore({ content: 'first entry about caching' })
  assert.equal(engine.memorySearch({ query: 'caching' }).results.length, 1)
  engine.memoryStore({ content: 'second entry about caching', metadata: { tag: 'late' } })
  assert.equal(engine.memorySearch({ query: 'caching' }).results.length, 2, 'the new entry is searchable')
  assert.equal(engine.memorySearch({ query: 'late' }).results.length, 1, 'including its metadata')
})

// ---------------------------------------------------------------------------
// State file format
// ---------------------------------------------------------------------------

test('state is written compact, and pretty only when asked', () => {
  const engine = createEngine({ projectRoot: project })
  engine.init()
  engine.memoryStore({ content: 'compact by default' })
  const compact = readFileSync(stateFile(), 'utf8')
  assert.ok(!compact.includes('\n  "'), 'no two-space indentation in the default write')
  assert.equal(JSON.parse(compact).memories.length, 2, 'and it is still valid JSON')

  const other = mkdtempSync(join(tmpdir(), 'graphyloop-hotpath-pretty-'))
  dirs.push(other)
  const pretty = createEngine({ projectRoot: other, prettyState: true })
  pretty.init()
  const text = readFileSync(stateFile(other), 'utf8')
  assert.ok(text.includes('\n  "'), 'GRAPHYLOOP_PRETTY_STATE / prettyState restores the readable form')
  assert.equal(JSON.parse(text).initialized, true)
})

test('a compact file written by this engine is readable by a separate process', () => {
  const engine = createEngine({ projectRoot: project })
  engine.init()
  engine.memoryStore({ content: 'written compact, read elsewhere', type: 'pattern' })
  const found = otherProcess(['memory-search', '--query', 'read elsewhere'])
  assert.equal(found.results.length, 1, 'the CLI in another process parses it fine')
})

// ---------------------------------------------------------------------------
// Locking still serialises writers
// ---------------------------------------------------------------------------

test('several engines writing the same file lose nothing', () => {
  const first = createEngine({ projectRoot: project })
  first.init()
  const engines = [first, ...Array.from({ length: 5 }, () => createEngine({ projectRoot: project }))]
  let expected = first.status().memories
  for (let round = 0; round < 8; round++) {
    for (const [i, engine] of engines.entries()) {
      const r = engine.memoryStore({ content: `writer ${i} round ${round}` })
      assert.equal(r.ok, true, `writer ${i} failed: ${JSON.stringify(r)}`)
      expected++
    }
  }
  const onDisk = JSON.parse(readFileSync(stateFile(), 'utf8')).memories.length
  assert.equal(onDisk, expected, 'every write survived the interleaving')
})

// ---------------------------------------------------------------------------
// Stack detection cache
// ---------------------------------------------------------------------------

test('the stack cache notices an edited package.json', () => {
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'p', dependencies: {} }))
  const engine = createEngine({ projectRoot: project })
  assert.equal(engine.stack().frameworkLabel, engine.stack().frameworkLabel, 'stable while nothing changes')
  const before = engine.stack().framework

  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'p', dependencies: { next: '15.0.0' } }))
  const after = engine.stack().framework
  assert.notEqual(after, before, `framework re-detected after the edit (${before} -> ${after})`)
  assert.equal(after, 'next')
})

// ---------------------------------------------------------------------------
// Prebuilt JSON-RPC responses (ping / tools/list are answered from a template)
// ---------------------------------------------------------------------------

function rpcRound(requests) {
  return new Promise((done, fail) => {
    const home = mkdtempSync(join(tmpdir(), 'graphyloop-hotpath-home-'))
    dirs.push(home)
    const child = track(spawn(process.execPath, [MCP_SERVER], {
      cwd: project,
      env: { ...process.env, GRAPHYLOOP_HOME: home, GRAPHYLOOP_PROJECT_ROOT: project },
      stdio: ['pipe', 'pipe', 'ignore'],
    }))
    const lines = []
    let buf = ''
    const timer = setTimeout(() => { child.kill(); fail(new Error(`timed out with ${lines.length}/${requests.length} responses`)) }, 15000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buf += chunk
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) lines.push(JSON.parse(line))
        if (lines.length === requests.length) {
          clearTimeout(timer)
          child.kill()
          done(lines)
          return
        }
      }
    })
    for (const req of requests) child.stdin.write(`${JSON.stringify(req)}\n`)
  })
}

test('ping and tools/list answer correctly for numeric and string ids', async () => {
  const [numeric, stringId, list, listStr] = await rpcRound([
    { jsonrpc: '2.0', id: 7, method: 'ping', params: {} },
    { jsonrpc: '2.0', id: 'abc-123', method: 'ping' },
    { jsonrpc: '2.0', id: 8, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 'list-id', method: 'tools/list' },
  ])

  assert.equal(numeric.id, 7, 'numeric id preserved as a number')
  assert.equal(typeof numeric.id, 'number')
  assert.deepEqual(numeric.result, {})
  assert.equal(stringId.id, 'abc-123', 'string id preserved as a string')
  assert.equal(typeof stringId.id, 'string')
  assert.deepEqual(stringId.result, {})

  for (const msg of [list, listStr]) {
    assert.ok(Array.isArray(msg.result.tools), 'tools/list still returns an array')
    assert.deepEqual(msg.result.tools.map((t) => t.name), TOOL_NAMES, 'the prebuilt payload is the real tool list')
    for (const tool of msg.result.tools) {
      assert.equal(typeof tool.description, 'string')
      assert.equal(tool.inputSchema.type, 'object', `${tool.name} keeps its schema`)
    }
  }
})

test('several requests arriving in one chunk are all answered, in order', async () => {
  // The raw newline splitter replaced readline; a client that pipelines a burst
  // into a single write must still get one response per request.
  const requests = Array.from({ length: 12 }, (_, i) => ({ jsonrpc: '2.0', id: i + 1, method: i % 2 ? 'ping' : 'tools/list' }))
  const answers = await rpcRound(requests)
  assert.deepEqual(answers.map((a) => a.id), requests.map((r) => r.id), 'one answer per request, same order')
})

test('a request with no trailing newline is still answered when stdin closes', async () => {
  const home = mkdtempSync(join(tmpdir(), 'graphyloop-hotpath-home-'))
  dirs.push(home)
  const answer = await new Promise((done, fail) => {
    const child = track(spawn(process.execPath, [MCP_SERVER], {
      cwd: project,
      env: { ...process.env, GRAPHYLOOP_HOME: home, GRAPHYLOOP_PROJECT_ROOT: project },
      stdio: ['pipe', 'pipe', 'ignore'],
    }))
    const timer = setTimeout(() => { child.kill(); fail(new Error('no answer for an unterminated request')) }, 15000)
    child.stdout.setEncoding('utf8')
    child.stdout.once('data', (chunk) => {
      clearTimeout(timer)
      child.kill()
      done(JSON.parse(String(chunk).trim()))
    })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'initialize', params: {} })) // no \n
    child.stdin.end()
  })
  assert.equal(answer.id, 99)
  assert.equal(answer.result.serverInfo.name, 'graphyloop-mcp')
})

test('a request far larger than one pipe chunk is reassembled correctly', async () => {
  // ~300 KB of tasks in a single line: this is the payload shape that exercises
  // the multi-chunk path, and the one the old readline interface handled for us.
  const tasks = Array.from({ length: 400 }, (_, i) => ({
    id: `t-${i}`,
    type: 'code',
    priority: 'medium',
    description: `task ${i} — ${'x'.repeat(600)}`,
  }))
  const payload = JSON.stringify(tasks)
  assert.ok(payload.length > 240_000, `payload should span many chunks (${payload.length} bytes)`)

  const [spawned, distributed] = await rpcRound([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'agent_spawn', arguments: { type: 'coder', id: 'big-payload-coder' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'task_distribute', arguments: { tasks: payload } } },
  ])
  assert.equal(spawned.result.isError, false, `spawn failed: ${spawned.result.content?.[0]?.text}`)
  assert.equal(distributed.result.isError, false, `distribute failed: ${distributed.result.content?.[0]?.text}`)
  const parsed = JSON.parse(distributed.result.content[0].text)
  assert.equal(parsed.assignments.length, 400, 'every task in the oversized request arrived intact')
  assert.equal(parsed.assignments[399].taskId, 't-399', 'including the last one')
})

// ---------------------------------------------------------------------------
// metrics() contract
// ---------------------------------------------------------------------------

test('metrics reports the hot-path counters and the state file it describes', () => {
  const engine = createEngine({ projectRoot: project })
  engine.init()
  engine.memorySearch({ query: 'anything' })
  const m = engine.metrics()
  for (const key of ['loads', 'parses', 'writes', 'lockWaits', 'searches']) {
    assert.equal(typeof m[key], 'number', `metrics.${key} is a number`)
  }
  assert.equal(m.writes, 1, 'init is one write')
  assert.equal(m.searches, 1)
  assert.equal(m.stateFile, stateFile())
  assert.equal(m.cached, true, 'the state is cached after init')
})

// A dirty state directory is created by the tests above; make sure the suite did
// not leave a lock behind that would make a later run wait for the timeout.
test('no lock directory survives the suite', () => {
  const engine = createEngine({ projectRoot: project })
  engine.init()
  engine.memoryStore({ content: 'last write' })
  mkdirSync(dirname(stateFile()), { recursive: true })
  const entries = readFileSync(stateFile(), 'utf8')
  assert.ok(entries.length > 0)
  assert.equal(engine.metrics().lockWaits, 0, 'an uncontended engine never waits on the lock')
})
