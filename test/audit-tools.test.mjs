// audit-tools.test.mjs — Regression tests for runtime tool audit findings (v0.6.1).
//
// Covers:
// 1. MCP spawned-CLI path (`GRAPHYLOOP_CLI` set) passes boolean flags (`plan_feature`
//    includeDeploy -> --deploy, `env_sync` force -> --force).
// 2. `memory-store` / `memory_store` omits empty metadata instead of storing `""`,
//    and validates `type` against MEMORY_TYPES just like `memory_search`.
// 3. `task_record` / `record` rejects invalid status values (e.g. "done") instead
//    of counting them as failed tasks, and persists/returns the optional `error`
//    message when a task fails.
// 4. MCP server and OpenCode plugin self-heal when `.graphyloop/state.json` is
//    shut down or cleaned up externally mid-session.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { CORE_LIB_FILES } from '../lib/install-core.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MCP_SERVER = join(REPO_ROOT, 'mcp-server.mjs')
const ADAPTER_CLI = join(REPO_ROOT, 'adapter', 'cli.mjs')

let homeDir
let projectDir
let fakeCli
let server
let reader
let seq = 0

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

async function rpc(method, params) {
  const id = ++seq
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  const line = await reader.nextLine(5000)
  return JSON.parse(line)
}

async function callTool(name, args) {
  const msg = await rpc('tools/call', { name, arguments: args ?? {} })
  return msg.result
}

function cli(args, env = {}) {
  const r = spawnSync(process.execPath, [ADAPTER_CLI, ...args], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: projectDir, ...env },
  })
  assert.equal(r.status, 0, `exit ${r.status}: ${r.stdout}${r.stderr}`)
  return JSON.parse(r.stdout)
}

before(() => {
  homeDir = mkdtempSync(join(tmpdir(), 'gl-audit-tools-home-'))
  projectDir = mkdtempSync(join(tmpdir(), 'gl-audit-tools-proj-'))
  fakeCli = join(homeDir, '.graphyloop', 'graphyloop', 'cli.mjs')
  mkdirSync(dirname(fakeCli), { recursive: true })
  copyFileSync(ADAPTER_CLI, fakeCli)
  mkdirSync(join(homeDir, '.graphyloop', 'lib'), { recursive: true })
  for (const name of CORE_LIB_FILES) {
    copyFileSync(join(REPO_ROOT, 'lib', name), join(homeDir, '.graphyloop', 'lib', name))
  }
  copyFileSync(join(REPO_ROOT, 'package.json'), join(homeDir, '.graphyloop', 'package.json'))

  writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
    name: 'audit-demo',
    dependencies: { next: '15.0.0', '@supabase/supabase-js': '2.45.0' },
    scripts: { build: 'next build', test: 'node --test' },
  }))

  server = spawn(process.execPath, [MCP_SERVER], {
    env: {
      ...process.env,
      GRAPHYLOOP_HOME: homeDir,
      GRAPHYLOOP_PROJECT_ROOT: projectDir,
      GRAPHYLOOP_CLI: fakeCli,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  server.stderr.resume()
  reader = createLineReader(server.stdout)
})

after(() => {
  if (server && server.exitCode === null) server.kill('SIGTERM')
  for (const dir of [homeDir, projectDir]) {
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

test('MCP spawned-CLI path passes includeDeploy (--deploy) and force (--force)', { timeout: 15000 }, async () => {
  // Goal does not mention deploy, so w4-deploy only appears if includeDeploy:true reaches the CLI as --deploy.
  const planned = await callTool('plan_feature', {
    goal: 'inventory system with stock levels and a dashboard',
    includeDeploy: true,
  })
  assert.equal(planned.isError, false, planned.content[0].text)
  const plan = JSON.parse(planned.content[0].text)
  assert.ok(
    plan.tasks.some((t) => t.id === 'w4-deploy'),
    `expected w4-deploy when includeDeploy:true, got waves: ${plan.waves.map((w) => w.name)}`
  )

  // Store a secret, sync, hand-edit .env.local to create a conflict, then env_sync with force:true.
  await callTool('secrets_set', { key: 'SUPABASE_URL', value: 'https://initial.supabase.co' })
  await callTool('env_sync', {})
  writeFileSync(join(projectDir, '.env.local'), 'SUPABASE_URL=https://conflict.supabase.co\n')

  const forced = await callTool('env_sync', { force: true })
  assert.equal(forced.isError, false, forced.content[0].text)
  const syncData = JSON.parse(forced.content[0].text)
  assert.deepEqual(syncData.updated, ['SUPABASE_URL'], `expected force:true to overwrite conflict: ${JSON.stringify(syncData)}`)
})

test('memory-store omits empty metadata and validates memory type', { timeout: 15000 }, async () => {
  cli(['init'])
  const stored = cli(['memory-store', '--content', 'no metadata flag passed'])
  assert.equal(stored.ok, true)
  const found = cli(['memory-search', '--query', 'no metadata flag']).results.find((m) => m.id === stored.id)
  assert.equal(found.metadata, undefined, `expected undefined metadata when omitted, got: ${JSON.stringify(found.metadata)}`)

  const badCli = cli(['memory-store', '--content', 'bad type', '--type', 'not-a-valid-type'])
  assert.match(badCli.error || '', /unknown memory type/, `CLI should reject unknown memory type: ${JSON.stringify(badCli)}`)

  const badMcp = await callTool('memory_store', { content: 'bad type', type: 'not-a-valid-type' })
  assert.equal(badMcp.isError, true, `MCP should reject unknown memory type: ${badMcp.content[0].text}`)
})

test('task_record rejects invalid status and records failure error messages', { timeout: 15000 }, async () => {
  await callTool('agent_spawn', { type: 'coder', id: 'rec-coder' })
  await callTool('task_distribute', {
    tasks: JSON.stringify([
      { id: 'rec-t1', type: 'code', description: 'step 1', priority: 'high', wave: 0 },
      { id: 'rec-t2', type: 'code', description: 'step 2', priority: 'high', wave: 1, dependsOn: ['rec-t1'] },
    ]),
  })

  // "done" is not a valid status (must be "completed" or "failed")
  const badStatus = await callTool('task_record', { taskId: 'rec-t1', status: 'done' })
  assert.equal(badStatus.isError, true, `expected isError for status="done": ${badStatus.content[0].text}`)

  const badCliStatus = cli(['record', '--taskId', 'rec-t1', '--status', 'done'])
  assert.match(badCliStatus.error || '', /completed.*failed/, `expected CLI error for status="done": ${JSON.stringify(badCliStatus)}`)

  // Failing a task with an error message records the error on the task and in the response
  const failed = await callTool('task_record', {
    taskId: 'rec-t1',
    status: 'failed',
    error: 'migration syntax error on line 12',
  })
  assert.equal(failed.isError, false, failed.content[0].text)
  const failData = JSON.parse(failed.content[0].text)
  assert.equal(failData.taskError, 'migration syntax error on line 12')
  const state = JSON.parse(readFileSync(join(projectDir, '.graphyloop', 'state.json'), 'utf8'))
  const taskInQueue = state.taskQueue.find((t) => t.id === 'rec-t1')
  assert.equal(taskInQueue.error, 'migration syntax error on line 12')
})

test('MCP server self-heals when state.json is shut down externally mid-session', { timeout: 15000 }, async () => {
  // Warm up MCP session
  const first = await callTool('memory_store', { content: 'before external shutdown' })
  assert.equal(first.isError, false, first.content[0].text)

  // External CLI shutdown flips state.initialized = false while MCP server is still running
  const down = cli(['shutdown'])
  assert.equal(down.ok, true)

  // Next MCP tool call should re-initialize automatically instead of failing with "not initialized"
  const after = await callTool('memory_store', { content: 'after external shutdown' })
  assert.equal(after.isError, false, `MCP failed after external shutdown: ${after.content[0].text}`)
  assert.equal(JSON.parse(after.content[0].text).ok, true)
})

test('plan_feature classifies a small backend-only Node app goal as no-fanout with no Supabase secrets', () => {
  const plainNodeProj = mkdtempSync(join(tmpdir(), 'gl-audit-plain-node-'))
  try {
    writeFileSync(join(plainNodeProj, 'package.json'), JSON.stringify({
      name: 'plain-node-app',
      version: '1.0.0',
      type: 'module',
      scripts: { test: 'node --test' },
    }))
    const goal = 'Add a GET /health endpoint to this Node app (plain node:http server in server.mjs) that returns {ok:true, uptime}, plus a node:test test for it. Keep it tiny.'
    const plan = cli(['plan', '--goal', goal], { GRAPHYLOOP_PROJECT_ROOT: plainNodeProj })
    assert.equal(plan.ok, true)
    assert.equal(plan.shape, 'no-fanout', `expected no-fanout for single-layer endpoint, got shape=${plan.shape} lanes=${JSON.stringify(plan.lanes)}`)
    assert.ok(!plan.lanes.includes('fullstack'), `must not match fullstack from "app": ${JSON.stringify(plan.lanes)}`)
    assert.ok(!plan.lanes.includes('data'), `must not invent data lane: ${JSON.stringify(plan.lanes)}`)
    assert.ok(!plan.lanes.includes('frontend'), `must not invent frontend lane: ${JSON.stringify(plan.lanes)}`)
    assert.deepEqual(plan.tasks, [], 'inline/single-builder work should not fan out wave tasks')
    assert.deepEqual(plan.secretsNeeded || [], [], `must not ask for SUPABASE_* when stack.supabase=false and goal has no DB/Supabase: ${JSON.stringify(plan.secretsNeeded)}`)

    // Even for a multi-layer goal in a non-Supabase repo (package.json has no @supabase/* and goal does not mention supabase/db/auth/migration),
    // secretsNeeded must not fabricate SUPABASE_* keys.
    const multiNoSb = cli(
      ['plan', '--goal', 'Build a REST API and a dashboard page for this Node app'],
      { GRAPHYLOOP_PROJECT_ROOT: plainNodeProj }
    )
    assert.equal(multiNoSb.shape, 'two-lane', `expected two-lane (backend+frontend), got ${multiNoSb.shape} (${multiNoSb.lanes})`)
    assert.deepEqual(multiNoSb.secretsNeeded, [], `expected no SUPABASE_* secrets for non-Supabase repo: ${JSON.stringify(multiNoSb.secretsNeeded)}`)
  } finally {
    rmSync(plainNodeProj, { recursive: true, force: true })
  }
})
