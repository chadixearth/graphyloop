// update.test.mjs — `graphyloop update` and core drift detection.
//
// The promise being tested is "an existing user can move to a newer graphyloop
// without losing anything": the update overwrites graphyloop-owned files, repairs
// a tree that is missing new core modules, and leaves the user's config keys and
// hand-edited agents alone. Each case drives the real CLI against a sandbox home.
//
// Slow by nature (a real install per case) — this suite is excluded from
// `npm run test:fast`.
//
// No network, no npm deps. Run with: node scripts/run-tests.mjs update

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { CORE_LIB_FILES } from '../lib/install-core.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = join(REPO_ROOT, 'bin', 'graphyloop.mjs')
const PKG_VERSION = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version

const sandboxes = []
let home

function cli(...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', timeout: 120000 })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}

function install(...extra) {
  const r = cli('install', '--harness', 'opencode', '--home', home, ...extra)
  assert.equal(r.code, 0, `install failed: ${r.out}${r.err}`)
  return r
}

function corePath(...parts) {
  return join(home, '.graphyloop', ...parts)
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'graphyloop-update-'))
  sandboxes.push(home)
})

after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------------------

test('update --check reports up-to-date after a fresh install and writes nothing', () => {
  install()
  const before = readFileSync(corePath('lib', 'engine.mjs'), 'utf8')

  const res = cli('update', '--check', '--home', home)
  assert.equal(res.code, 0)
  assert.match(res.out, /status:\s+up-to-date/)
  assert.match(res.out, /GRAPH_LOOP_UPDATE_CHECK/)
  assert.match(res.out, /Nothing to do/)
  assert.equal(readFileSync(corePath('lib', 'engine.mjs'), 'utf8'), before, '--check must not rewrite files')
})

test('update --check --json reports an older installed version as update-available', () => {
  install()
  writeFileSync(corePath('package.json'), JSON.stringify({ name: 'graphyloop', version: '0.0.1' }))

  const res = cli('update', '--check', '--json', '--home', home)
  const state = JSON.parse(res.out)
  assert.equal(state.installedVersion, '0.0.1')
  assert.equal(state.runningVersion, PKG_VERSION)
  assert.equal(state.status, 'update-available')
  assert.equal(state.needsUpdate, true)
  assert.deepEqual(state.missing, [])
})

test('a core tree missing a new engine module reports incomplete, not up-to-date', () => {
  install()
  // This is the real-world drift: engine.mjs imports these statically, so a tree
  // without them cannot even be loaded — a version-only check would call it fine.
  rmSync(corePath('lib', 'secrets.mjs'))
  rmSync(corePath('lib', 'planner.mjs'))

  const state = JSON.parse(cli('update', '--check', '--json', '--home', home).out)
  assert.equal(state.installedVersion, PKG_VERSION, 'version still matches')
  assert.equal(state.status, 'incomplete')
  assert.equal(state.needsUpdate, true)
  assert.equal(state.missing.length, 2, JSON.stringify(state.missing))
})

test('update --check on a machine with no install says not-installed', () => {
  const state = JSON.parse(cli('update', '--check', '--json', '--home', home).out)
  assert.equal(state.installed, false)
  assert.equal(state.status, 'not-installed')
  assert.equal(state.needsUpdate, true)
})

// ---------------------------------------------------------------------------
// The update itself
// ---------------------------------------------------------------------------

test('update repairs a stale, incomplete install and reports the version move', () => {
  install()
  writeFileSync(corePath('package.json'), JSON.stringify({ name: 'graphyloop', version: '0.0.1' }))
  rmSync(corePath('lib', 'secrets.mjs'))

  const res = cli('update', '--home', home)
  assert.equal(res.code, 0, res.err)
  assert.match(res.out, new RegExp(`graphyloop update: 0\\.0\\.1 -> ${PKG_VERSION.replace(/\./g, '\\.')}`))
  assert.match(res.out, /repairing missing core files: .*secrets\.mjs/)
  assert.match(res.out, /GRAPH_LOOP_UPDATED/)
  assert.match(res.out, /Restart your harness/)

  for (const name of CORE_LIB_FILES) {
    assert.ok(existsSync(corePath('lib', name)), `lib/${name} restored`)
  }
  const after = JSON.parse(cli('update', '--check', '--json', '--home', home).out)
  assert.equal(after.status, 'up-to-date')
})

test('update overwrites a modified core file but keeps a backup', () => {
  install()
  writeFileSync(corePath('lib', 'engine.mjs'), '// locally mangled\n')

  assert.equal(cli('update', '--home', home).code, 0)
  const engine = readFileSync(corePath('lib', 'engine.mjs'), 'utf8')
  assert.ok(engine.includes('createEngine'), 'core file refreshed')

  const backups = readdirSync(corePath('lib')).filter((f) => f.startsWith('engine.mjs.bak-'))
  assert.equal(backups.length, 1, `expected one backup, got ${backups}`)
  assert.match(readFileSync(corePath('lib', backups[0]), 'utf8'), /locally mangled/)
})

test('update preserves user config keys and a hand-edited agent', () => {
  const configDir = join(home, '.config', 'opencode')
  mkdirSync(join(configDir, 'agents'), { recursive: true })
  writeFileSync(join(configDir, 'opencode.json'), `${JSON.stringify({
    plugin: ['./plugins/my-own/plugin.js'],
    model: 'my-provider/my-model',
    default_agent: 'my-agent',
    command: { 'my-command': { description: 'mine', template: 'do it' } },
  }, null, 2)}\n`)
  const edited = join(configDir, 'agents', 'agent-chadi.md')
  writeFileSync(edited, '---\nname: agent-chadi\n---\n\nMY OWN VERSION\n')

  install()
  assert.equal(cli('update', '--home', home).code, 0)

  const config = JSON.parse(readFileSync(join(configDir, 'opencode.json'), 'utf8'))
  assert.ok(config.plugin.includes('./plugins/my-own/plugin.js'), 'user plugin kept')
  assert.equal(config.model, 'my-provider/my-model', 'user model kept')
  assert.equal(config.default_agent, 'my-agent', 'user default_agent kept')
  assert.ok(config.command['my-command'], 'user command kept')
  assert.ok(config.plugin.some((p) => String(p).includes('graphyloop')), 'graphyloop plugin still wired')

  // --force refreshes graphyloop-owned files, so an edited agent is replaced —
  // but only after a timestamped backup, which is what makes it recoverable.
  const backups = readdirSync(join(configDir, 'agents')).filter((f) => f.startsWith('agent-chadi.md.bak-'))
  assert.equal(backups.length >= 1, true, 'edited agent backed up before refresh')
  assert.match(readFileSync(join(configDir, 'agents', backups[0]), 'utf8'), /MY OWN VERSION/)
})

test('update is idempotent', () => {
  install()
  assert.equal(cli('update', '--home', home).code, 0)
  const second = cli('update', '--home', home)
  assert.equal(second.code, 0)
  assert.match(second.out, /GRAPH_LOOP_UPDATED/)
  assert.equal(JSON.parse(cli('update', '--check', '--json', '--home', home).out).status, 'up-to-date')
})

test('doctor reports the installed core version and points at update when stale', () => {
  install()
  const clean = cli('doctor', '--home', home)
  assert.match(clean.out, new RegExp(`version ${PKG_VERSION.replace(/\./g, '\\.')} vs package`))
  assert.match(clean.out, /up-to-date/)
  assert.equal(/npx -y graphyloop@latest update/.test(clean.out), false, 'no update hint when current')

  writeFileSync(corePath('package.json'), JSON.stringify({ name: 'graphyloop', version: '0.0.1' }))
  const stale = cli('doctor', '--home', home)
  assert.match(stale.out, /update-available/)
  assert.match(stale.out, /npx -y graphyloop@latest update/)
  assert.equal(stale.code, 0, 'doctor always exits 0')
})

test('help documents the update command', () => {
  const res = cli('--help')
  assert.match(res.out, /graphyloop update \[--check\]/)
  assert.match(res.out, /--check\s+update only: report drift, write nothing/)
})
