// adapter.test.mjs — graphyloop engine tests (adapter/cli.mjs).
//
// The engine owns <project>/.opencode/graphyloop/state.json: every harness path
// (OpenCode plugin, MCP server, bare CLI) funnels through it, so its failure
// modes are everyone's failure modes. Each test drives the real CLI via
// spawnSync against a throwaway project root.
//
// No network, no npm deps. Run with: node scripts/run-tests.mjs

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(REPO_ROOT, 'adapter', 'cli.mjs')

const projects = []
let project

function stateFile(root = project) {
  return join(root, '.opencode', 'graphyloop', 'state.json')
}

// Runs the engine and parses its single JSON line. Every command answers with
// JSON on stdout and exit 0 — a non-zero status is itself a failure.
function cli(args, env = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: project, ...env },
  })
  assert.equal(r.status, 0, `exit ${r.status}: ${r.stdout}${r.stderr}`)
  try {
    return JSON.parse(r.stdout)
  } catch {
    assert.fail(`non-JSON output: ${r.stdout || r.stderr}`)
  }
}

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'graphyloop-adapter-'))
  projects.push(project)
})

after(() => {
  for (const dir of projects) rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// State durability
// ---------------------------------------------------------------------------

test('init creates state and is idempotent', () => {
  const first = cli(['init'])
  assert.equal(first.ok, true)
  assert.ok(existsSync(stateFile()), 'state.json written')
  const again = cli(['init'])
  assert.equal(again.message, 'already initialized')
})

test('corrupt state file is quarantined instead of bricking the CLI', () => {
  cli(['init'])
  writeFileSync(stateFile(), '{"agents": [ truncated')

  // Before the recovery path this threw a SyntaxError on every later command.
  const status = cli(['status'])
  assert.equal(status.initialized, false, 'recovered as a fresh, uninitialized state')

  const quarantined = readdirSync(dirname(stateFile())).filter((f) => f.includes('.corrupt-'))
  assert.equal(quarantined.length, 1, `corrupt file kept for forensics: ${quarantined}`)

  assert.equal(cli(['init']).ok, true, 're-init works after recovery')
})

test('state written by an older version keeps working', () => {
  // No taskQueue key: cmdStatus used to crash on s.taskQueue.filter.
  mkdirSync(dirname(stateFile()), { recursive: true })
  writeFileSync(stateFile(), JSON.stringify({ initialized: true, agents: [], memories: [] }))
  const status = cli(['status'])
  assert.equal(status.initialized, true)
  assert.equal(status.pendingTasks, 0)
})

test('saves are atomic — no temp files survive a command', () => {
  cli(['init'])
  cli(['memory-store', '--content', 'atomic write check'])
  const leftovers = readdirSync(dirname(stateFile())).filter((f) => f.includes('.tmp-'))
  assert.deepEqual(leftovers, [], `temp files left behind: ${leftovers}`)
})

test('memory log is capped so the state file cannot grow without bound', () => {
  cli(['init'])
  for (let i = 0; i < 6; i++) cli(['memory-store', '--content', `entry ${i}`], { GRAPHYLOOP_MAX_MEMORIES: '3' })
  const state = JSON.parse(readFileSync(stateFile(), 'utf8'))
  assert.equal(state.memories.length, 3, 'oldest entries dropped')
  assert.equal(state.memories.at(-1).content, 'entry 5', 'newest entry kept')
})

// ---------------------------------------------------------------------------
// Argument handling
// ---------------------------------------------------------------------------

test('--flag=value is accepted alongside --flag value', () => {
  cli(['init'])
  cli(['memory-store', '--content=equals form', '--type=lesson'])
  const found = cli(['memory-search', '--query=equals'])
  assert.equal(found.ok, true)
  assert.ok(found.results.some((m) => m.content === 'equals form' && m.type === 'lesson'), JSON.stringify(found))
})

test('a missing value is reported instead of swallowing the next flag', () => {
  cli(['init'])
  const res = cli(['memory-store', '--content', '--type', 'event'])
  assert.equal(res.error, 'need --content', JSON.stringify(res))
})

test('empty search query is rejected rather than dumping every memory', () => {
  cli(['init'])
  cli(['memory-store', '--content', 'a'])
  cli(['memory-store', '--content', 'b'])
  assert.equal(cli(['memory-search', '--query', '  ']).error, 'need --query')
})

// ---------------------------------------------------------------------------
// Swarm behavior
// ---------------------------------------------------------------------------

test('spawn rejects unknown agent types and duplicate ids', () => {
  cli(['init'])
  const bad = cli(['spawn', '--type', 'wizard'])
  assert.match(bad.error, /unknown agent type "wizard"/)

  assert.equal(cli(['spawn', '--type', 'coder', '--id', 'c1']).ok, true)
  assert.match(cli(['spawn', '--type', 'tester', '--id', 'c1']).error, /already exists/)
})

test('distribute rejects malformed task payloads', () => {
  cli(['init'])
  assert.match(cli(['distribute', '--tasks', '{"id":"t1"}']).error, /must be a JSON array/)
  assert.match(cli(['distribute', '--tasks', '[{"description":"no id"}]']).error, /index 0 is missing an "id"/)
})

test('distribute routes a task to a capability-matched agent', () => {
  cli(['init'])
  cli(['spawn', '--type', 'coder', '--id', 'coder-1'])
  const res = cli(['distribute', '--tasks', JSON.stringify([{ id: 't1', type: 'code', description: 'ship it', priority: 'high' }])])
  assert.equal(res.ok, true)
  assert.equal(res.assignments.length, 1)
  assert.equal(res.assignments[0].agentId, 'coder-1')
  assert.equal(res.assignments[0].opencodeAgentType, 'chadi-backend')
})

test('record reports whether the task and agent were actually found', () => {
  cli(['init'])
  cli(['spawn', '--type', 'coder', '--id', 'coder-1'])
  cli(['distribute', '--tasks', JSON.stringify([{ id: 't1', type: 'code', description: 'x', priority: 'low' }])])

  const hit = cli(['record', '--taskId', 't1', '--status', 'completed'])
  assert.equal(hit.taskFound, true)
  assert.equal(hit.agentFound, true)

  // A typo used to look exactly like a successful record.
  const miss = cli(['record', '--taskId', 'typo', '--status', 'completed'])
  assert.equal(miss.taskFound, false)
  assert.equal(miss.agentFound, false)
})

test('shutdown terminates agents and keeps memories', () => {
  cli(['init'])
  cli(['memory-store', '--content', 'survives shutdown', '--type', 'decision'])
  assert.equal(cli(['shutdown']).ok, true)

  const state = JSON.parse(readFileSync(stateFile(), 'utf8'))
  assert.equal(state.initialized, false)
  assert.ok(state.agents.every((a) => a.status === 'terminated'), 'agents terminated')

  cli(['init'])
  const found = cli(['memory-search', '--query', 'survives'])
  assert.ok(found.results.some((m) => m.content === 'survives shutdown'), 'memory survived the restart')
})
