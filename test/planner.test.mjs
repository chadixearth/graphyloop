// planner.test.mjs — feature planning + wave/dependency dispatch.
//
// Two things are under test. First, that "I want an inventory system" decomposes
// into a contract wave followed by data/backend/frontend running TOGETHER rather
// than a serial chain — that is the whole point of the planner. Second, that the
// dependency tracking is real: a wave-2 task must stay blocked until its wave-1
// builders are recorded complete, because a plan that only *describes* order and
// then dispatches everything at once is worse than no plan.
//
// No network, no npm deps. Run with: node scripts/run-tests.mjs planner

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(REPO_ROOT, 'adapter', 'cli.mjs')

const projects = []
let project

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
    return assert.fail(`non-JSON output: ${r.stdout || r.stderr}`)
  }
}

const INVENTORY = 'I want an inventory system with stock levels, suppliers and a dashboard, then deploy to vercel'

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'graphyloop-planner-'))
  projects.push(project)
})

after(() => {
  for (const dir of projects) rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Plan shape
// ---------------------------------------------------------------------------

test('an inventory system plans database, backend and frontend in ONE parallel wave', () => {
  const plan = cli(['plan', '--goal', INVENTORY])
  assert.equal(plan.ok, true)
  assert.equal(plan.shape, 'fullstack')

  const waves = plan.waves.map((w) => w.name)
  assert.deepEqual(waves, ['contract', 'builders', 'integration', 'verify', 'deploy'])

  const builders = plan.waves.find((w) => w.name === 'builders')
  assert.equal(builders.parallel, true, 'builders wave must be parallel')
  assert.ok(builders.taskIds.includes('w1-data'), 'database lane present')
  assert.ok(builders.taskIds.includes('w1-backend'), 'backend lane present')
  assert.ok(builders.taskIds.includes('w1-frontend'), 'frontend lane present')
  assert.ok(builders.taskIds.includes('w1-tests'), 'tests are written from the contract, not after the code')
  assert.match(builders.dispatch, /ONE tool-call block/)
})

test('every builder depends on the contract, and nothing else depends on a sibling builder', () => {
  const plan = cli(['plan', '--goal', INVENTORY])
  const byId = new Map(plan.tasks.map((t) => [t.id, t]))
  const builders = plan.tasks.filter((t) => t.wave === 1)

  for (const t of builders) {
    assert.deepEqual(t.dependsOn, ['w0-contract'], `${t.id} must depend only on the contract`)
  }
  // A builder waiting on another builder would serialize the wave.
  for (const t of builders) {
    for (const dep of t.dependsOn) {
      assert.notEqual(byId.get(dep).wave, 1, `${t.id} depends on a sibling builder`)
    }
  }
  assert.equal(byId.get('w0-contract').wave, 0)
  assert.deepEqual(byId.get('w0-contract').dependsOn, [])
})

test('integration waits for all builders, verification waits for integration', () => {
  const plan = cli(['plan', '--goal', INVENTORY])
  const integration = plan.tasks.find((t) => t.id === 'w2-integration')
  for (const id of ['w1-data', 'w1-backend', 'w1-frontend', 'w1-tests']) {
    assert.ok(integration.dependsOn.includes(id), `integration must wait for ${id}`)
  }
  for (const t of plan.tasks.filter((x) => x.wave === 3)) {
    assert.deepEqual(t.dependsOn, ['w2-integration'], `${t.id} must run after integration`)
  }
})

test('the verify wave covers test, typecheck, security, performance and review in parallel', () => {
  const plan = cli(['plan', '--goal', INVENTORY])
  const verify = plan.waves.find((w) => w.name === 'verify')
  assert.equal(verify.parallel, true)
  assert.deepEqual(
    verify.taskIds.sort(),
    ['w3-performance', 'w3-quality', 'w3-review', 'w3-security', 'w3-test'],
    'connect -> test -> performance -> security all run, and run together'
  )
})

test('a deploy request adds a gated deploy wave that runs last', () => {
  const plan = cli(['plan', '--goal', INVENTORY])
  const deploy = plan.tasks.find((t) => t.id === 'w4-deploy')
  assert.ok(deploy, 'deploy wave planned when the goal mentions shipping')
  assert.match(deploy.gate, /approval/i, 'production deploy is never unattended')
  for (const id of ['w3-test', 'w3-security']) {
    assert.ok(deploy.dependsOn.includes(id), `deploy must wait for ${id}`)
  }
  assert.ok(plan.secretsNeeded.includes('VERCEL_TOKEN'))
  assert.ok(plan.secretsNeeded.includes('SUPABASE_URL'))
})

test('no deploy wave unless deployment was asked for', () => {
  const plan = cli(['plan', '--goal', 'inventory system with a stock dashboard'])
  assert.equal(plan.tasks.some((t) => t.wave === 4), false)
  const forced = cli(['plan', '--goal', 'inventory system with a stock dashboard', '--deploy'])
  assert.equal(forced.tasks.some((t) => t.id === 'w4-deploy'), true, '--deploy opts in explicitly')
})

test('auth work escalates to the heavy lane with a mandatory security pass', () => {
  const plan = cli(['plan', '--goal', 'add login with roles and permissions to the admin app'])
  assert.equal(plan.lane, 'heavy')
  assert.ok(plan.sensitive.includes('auth'))
  assert.ok(plan.tasks.some((t) => t.id === 'w3-security'), 'security review is planned, not optional')
  assert.ok(plan.notes.some((n) => n.includes('Heavy lane')))
})

test('each task carries exclusive file ownership and an acceptance check', () => {
  const plan = cli(['plan', '--goal', INVENTORY])
  for (const t of plan.tasks) {
    assert.ok(t.acceptance && t.acceptance.length > 10, `${t.id} has no acceptance check`)
    assert.ok(t.agent && t.agent.startsWith('chadi-'), `${t.id} has no harness agent`)
  }
  // Two write-capable lanes in the same wave must not claim the same path.
  const seen = new Map()
  for (const t of plan.tasks.filter((x) => x.wave === 1)) {
    for (const glob of t.owns) {
      assert.equal(seen.has(glob), false, `${glob} claimed by both ${seen.get(glob)} and ${t.id}`)
      seen.set(glob, t.id)
    }
  }
})

test('a non-feature request is told not to fan out instead of inventing lanes', () => {
  const plan = cli(['plan', '--goal', 'rename the helper function in one file'])
  assert.equal(plan.shape, 'no-fanout')
  assert.deepEqual(plan.tasks, [])
  assert.match(plan.recommendation, /inline/)
})

test('a missing goal is rejected', () => {
  assert.match(cli(['plan']).error, /need a goal/)
})

test('the plan is recorded as a decision memory so wave metrics are real', () => {
  cli(['init'])
  cli(['plan', '--goal', INVENTORY])
  const found = cli(['memory-search', '--query', 'PLAN shape', '--type', 'decision'])
  assert.equal(found.results.length >= 1, true, 'plan shape stored for later comparison')
  assert.match(found.results[0].content, /shape=fullstack/)
})

// ---------------------------------------------------------------------------
// Wave dispatch: the dependency gate is real
// ---------------------------------------------------------------------------

function seedSwarm() {
  cli(['init'])
  for (const [type, id] of [['architect', 'arch-1'], ['data', 'data-1'], ['coder', 'coder-1'], ['frontend', 'fe-1'], ['tester', 'test-1']]) {
    cli(['spawn', '--type', type, '--id', id])
  }
}

test('distribute dispatches wave 0 only and reports the rest as blocked', () => {
  seedSwarm()
  const plan = cli(['plan', '--goal', INVENTORY])
  const res = cli(['distribute', '--tasks', JSON.stringify(plan.tasks)])

  assert.equal(res.ok, true)
  assert.deepEqual(res.dispatchNow, ['w0-contract'], 'only the contract may start')
  assert.equal(res.blocked.length, plan.tasks.length - 1, 'everything else waits')

  const contract = res.assignments.find((a) => a.taskId === 'w0-contract')
  assert.equal(contract.ready, true)
  assert.equal(contract.wave, 0)
  assert.equal(contract.opencodeAgentType, 'chadi-architect', 'planner agent overrides the generic mapping')
  assert.match(contract.prompt, /wave 0/)
  assert.match(contract.prompt, /Files you own EXCLUSIVELY/)
  assert.match(contract.prompt, /Acceptance check:/)

  const data = res.assignments.find((a) => a.taskId === 'w1-data')
  assert.equal(data.ready, false)
  assert.match(data.prompt, /Depends on: w0-contract/)
})

test('recording the contract unblocks exactly the builder wave', () => {
  seedSwarm()
  const plan = cli(['plan', '--goal', INVENTORY])
  cli(['distribute', '--tasks', JSON.stringify(plan.tasks)])

  const rec = cli(['record', '--taskId', 'w0-contract', '--status', 'completed'])
  assert.equal(rec.ok, true)
  assert.deepEqual(
    rec.unblocked.map((t) => t.id).sort(),
    ['w1-backend', 'w1-data', 'w1-frontend', 'w1-tests'],
    'the whole builder wave goes ready at once'
  )

  const status = cli(['status'])
  assert.equal(status.readyTasks, 4)
  assert.equal(status.waves['1'].pending, 4)
  assert.equal(status.waves['0'].completed, 1)
  assert.equal(status.blockedTasks, plan.tasks.length - 5, 'later waves still gated')
})

test('integration stays blocked until every builder is recorded', () => {
  seedSwarm()
  const plan = cli(['plan', '--goal', INVENTORY])
  cli(['distribute', '--tasks', JSON.stringify(plan.tasks)])
  cli(['record', '--taskId', 'w0-contract', '--status', 'completed'])

  for (const id of ['w1-data', 'w1-backend', 'w1-frontend']) {
    const rec = cli(['record', '--taskId', id, '--status', 'completed'])
    assert.deepEqual(rec.unblocked, [], `${id} alone must not release integration`)
  }
  const last = cli(['record', '--taskId', 'w1-tests', '--status', 'completed'])
  assert.deepEqual(last.unblocked.map((t) => t.id), ['w2-integration'], 'the last builder releases integration')
})

test('a task with no wave or dependsOn is dispatchable immediately (unchanged behaviour)', () => {
  cli(['init'])
  cli(['spawn', '--type', 'coder', '--id', 'coder-1'])
  const res = cli(['distribute', '--tasks', JSON.stringify([{ id: 't1', type: 'code', description: 'fix', priority: 'low' }])])
  assert.deepEqual(res.dispatchNow, ['t1'])
  assert.equal(res.assignments[0].wave, 0)
  assert.deepEqual(res.assignments[0].dependsOn, [])
  assert.deepEqual(res.blocked, [])
})

test('a dependency on an id that does not exist blocks instead of silently dispatching', () => {
  cli(['init'])
  cli(['spawn', '--type', 'coder', '--id', 'coder-1'])
  const res = cli(['distribute', '--tasks', JSON.stringify([
    { id: 't2', type: 'code', description: 'wire it up', priority: 'high', wave: 1, dependsOn: ['t-typo'] },
  ])])
  assert.deepEqual(res.dispatchNow, [])
  assert.deepEqual(res.blocked[0].unknownDeps, ['t-typo'])
})

test('malformed wave/dependsOn input is rejected with the offending task id', () => {
  cli(['init'])
  cli(['spawn', '--type', 'coder', '--id', 'coder-1'])
  const bad = (task) => cli(['distribute', '--tasks', JSON.stringify([task])]).error
  assert.match(bad({ id: 'a', wave: -1 }), /invalid wave/)
  assert.match(bad({ id: 'a', wave: 'soon' }), /invalid wave/)
  assert.match(bad({ id: 'a', dependsOn: 'b' }), /invalid dependsOn/)
  assert.match(bad({ id: 'a', dependsOn: [7] }), /non-string id/)
  assert.match(bad({ id: 'a', dependsOn: ['a'] }), /depends on itself/)
})

test('the plan reports the detected stack so dispatch prompts can name real commands', () => {
  writeFileSync(join(project, 'package.json'), JSON.stringify({
    name: 'demo', dependencies: { next: '14.0.0' }, scripts: { build: 'next build', test: 'vitest' },
  }))
  const plan = cli(['plan', '--goal', INVENTORY])
  assert.equal(plan.stack.framework, 'Next.js')
  assert.equal(plan.stack.testScript, 'test')
})
