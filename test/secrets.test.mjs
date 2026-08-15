// secrets.test.mjs — credential store, env materialization, and preflight.
//
// The invariant under test is narrow and important: a secret VALUE must never
// come back out through a call an agent can make, and a stored credential must
// be unable to reach a commit. Everything else here (aliases, conflicts,
// blockers) protects those two.
//
// No network, no npm deps. Run with: node scripts/run-tests.mjs secrets

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
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

function set(key, value) {
  return cli(['secrets-set', '--key', key], { GRAPHYLOOP_SECRET_VALUE: value })
}

function read(rel) {
  const file = join(project, rel)
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'graphyloop-secrets-'))
  projects.push(project)
  writeFileSync(join(project, 'package.json'), JSON.stringify({
    name: 'demo',
    dependencies: { next: '14.0.0', '@supabase/supabase-js': '2.39.0' },
    scripts: { build: 'next build', test: 'vitest' },
  }))
})

after(() => {
  for (const dir of projects) rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// No value ever leaves the store through a tool-visible path
// ---------------------------------------------------------------------------

const SECRET = 'sbp_super_secret_service_role_value_0123456789'

test('a stored value is masked in every reported field', () => {
  const res = set('SUPABASE_SERVICE_ROLE_KEY', SECRET)
  assert.equal(res.ok, true)
  const serialized = JSON.stringify(res)
  assert.ok(!serialized.includes(SECRET), `raw value leaked into the result: ${serialized}`)
  assert.match(res.masked, /^\*{8}6789 \(\d+ chars\)$/)
  assert.equal(res.kind, 'secret')
  assert.ok(res.warnings.some((w) => w.includes('server-only')), 'service-role key warns about client exposure')
})

test('secrets-status reports presence and source but no values', () => {
  set('SUPABASE_URL', 'https://abcdefghijkl.supabase.co')
  set('SUPABASE_SERVICE_ROLE_KEY', SECRET)
  const status = cli(['secrets-status', '--provider', 'supabase'])
  const serialized = JSON.stringify(status)
  assert.ok(!serialized.includes(SECRET), 'status leaked a value')

  const supabase = status.providers[0]
  const url = supabase.keys.find((k) => k.key === 'SUPABASE_URL')
  assert.equal(url.present, true)
  assert.equal(url.source, 'store')
  assert.equal(supabase.configured, false, 'anon key still missing')
  assert.deepEqual(supabase.missingRequired, ['SUPABASE_ANON_KEY'])
})

test('a value in the process env wins over the store, and the conflict is reported', () => {
  set('VERCEL_TOKEN', 'stored-token-value-1234')
  const status = cli(['secrets-status', '--provider', 'vercel'], { VERCEL_TOKEN: 'env-token-value-9876' })
  const token = status.providers[0].keys.find((k) => k.key === 'VERCEL_TOKEN')
  assert.equal(token.source, 'env', 'process env is authoritative')
  assert.deepEqual(token.sources, ['env', 'store'])
  assert.match(token.warning, /more than one place/)
})

test('an invalid key name is rejected before anything is written', () => {
  const res = cli(['secrets-set', '--key', 'lower_case'], { GRAPHYLOOP_SECRET_VALUE: 'x' })
  assert.match(res.error, /UPPER_SNAKE_CASE/)
  assert.equal(existsSync(join(project, '.graphyloop', 'secrets.json')), false, 'no store created')
})

test('an unknown provider is rejected with the valid list', () => {
  const res = cli(['secrets-status', '--provider', 'firebase'])
  assert.match(res.error, /unknown provider "firebase"/)
  assert.match(res.error, /supabase, vercel, all/)
})

test('secrets-forget removes the stored value', () => {
  set('VERCEL_TOKEN', 'token-to-drop-1234')
  assert.equal(cli(['secrets-forget', '--key', 'VERCEL_TOKEN']).removed, true)
  const status = cli(['secrets-status', '--provider', 'vercel'])
  assert.equal(status.providers[0].keys.find((k) => k.key === 'VERCEL_TOKEN').present, false)
  assert.match(cli(['secrets-forget', '--key', 'VERCEL_TOKEN']).error, /no stored value/)
})

// ---------------------------------------------------------------------------
// The store cannot be committed
// ---------------------------------------------------------------------------

test('the store is git-ignored before the first value is written, with mode 600 on POSIX', () => {
  const res = set('SUPABASE_URL', 'https://abcdefghijkl.supabase.co')
  assert.equal(res.gitignore.created, true)
  const guard = read('.graphyloop/.gitignore')
  assert.ok(guard.includes('secrets.json'), `guard missing the store: ${guard}`)
  assert.ok(guard.includes('state.json'), 'guard also covers swarm state')

  if (process.platform !== 'win32') {
    const { mode } = statSync(join(project, '.graphyloop', 'secrets.json'))
    assert.equal(mode & 0o777, 0o600, 'store is owner-only')
  }
})

test('a corrupt store is quarantined instead of failing every later call', () => {
  set('SUPABASE_URL', 'https://abcdefghijkl.supabase.co')
  writeFileSync(join(project, '.graphyloop', 'secrets.json'), '{ truncated')
  const status = cli(['secrets-status', '--provider', 'supabase'])
  assert.equal(status.ok, true, 'still answers')
  const quarantined = readdirSync(join(project, '.graphyloop')).filter((f) => f.includes('.corrupt-'))
  assert.equal(quarantined.length, 1, `corrupt store kept for inspection: ${quarantined}`)
})

// ---------------------------------------------------------------------------
// env_sync: values move file-to-file
// ---------------------------------------------------------------------------

test('env-sync writes the env file, aliases public keys only, and never returns values', () => {
  set('SUPABASE_URL', 'https://abcdefghijkl.supabase.co')
  set('SUPABASE_ANON_KEY', 'anon-key-abcdefghijklmnop')
  set('SUPABASE_SERVICE_ROLE_KEY', SECRET)

  const res = cli(['env-sync'])
  assert.equal(res.ok, true)
  assert.ok(!JSON.stringify(res).includes(SECRET), 'env-sync leaked a value into its result')

  const envFile = read('.env.local')
  assert.ok(envFile.includes(`SUPABASE_SERVICE_ROLE_KEY=${SECRET}`), 'real value written to the file the app reads')
  // Next.js was detected from package.json, so public keys get the browser alias.
  assert.ok(envFile.includes('NEXT_PUBLIC_SUPABASE_URL='), 'public key aliased for the framework')
  assert.ok(envFile.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY='))
  assert.ok(
    !envFile.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'),
    'a service-role key must NEVER get a client-visible alias — that ships it in the browser bundle'
  )

  const example = read('.env.example')
  assert.ok(example.includes('SUPABASE_SERVICE_ROLE_KEY='), 'example lists the key name')
  assert.ok(!example.includes(SECRET), 'example must hold names only')

  const gitignore = read('.gitignore')
  assert.ok(gitignore.includes('.env.local'), 'env file git-ignored')
})

test('env-sync is idempotent and refuses to clobber a differing value without force', () => {
  set('SUPABASE_URL', 'https://abcdefghijkl.supabase.co')
  cli(['env-sync'])
  const second = cli(['env-sync'])
  assert.equal(second.wrote, 0, 'second run writes nothing')

  writeFileSync(join(project, '.env.local'), 'SUPABASE_URL=https://hand-edited.supabase.co\n')
  const guarded = cli(['env-sync'])
  assert.deepEqual(guarded.conflicts, ['SUPABASE_URL'], 'the differing key is refused')
  assert.deepEqual(guarded.updated, [], 'nothing overwritten without force')
  assert.ok(guarded.added.includes('NEXT_PUBLIC_SUPABASE_URL'), 'a key the edit dropped is still restored')
  assert.equal(read('.env.local').includes('hand-edited'), true, 'user edit preserved')

  const forced = cli(['env-sync', '--force'])
  assert.deepEqual(forced.updated, ['SUPABASE_URL'])
  assert.ok(forced.backup, 'a backup is kept when overwriting')
  assert.equal(read('.env.local').includes('abcdefghijkl'), true, 'value replaced after force')
})

test('env-sync rejects a target outside the project', () => {
  set('SUPABASE_URL', 'https://abcdefghijkl.supabase.co')
  assert.match(cli(['env-sync', '--target', '../.env']).error, /file name inside the project/)
  assert.match(cli(['env-sync', '--target', 'secrets.txt']).error, /\.env\* file/)
})

test('env-sync with an empty store says so instead of writing an empty file', () => {
  const res = cli(['env-sync'])
  assert.equal(res.wrote, 0)
  assert.match(res.message, /nothing to sync/)
  assert.equal(existsSync(join(project, '.env.local')), false)
})

// ---------------------------------------------------------------------------
// preflight: report + gated plan, never execution
// ---------------------------------------------------------------------------

test('deploy preflight blocks on a missing token and gates the production step', () => {
  const res = cli(['preflight', '--target', 'deploy'])
  assert.equal(res.ok, false)
  assert.deepEqual(res.blockers.map((b) => `${b.code}:${b.key || ''}`), ['missing-secret:VERCEL_TOKEN'])

  const prod = res.plan.find((s) => s.id === 'deploy-prod')
  assert.ok(prod, 'plan includes the production deploy')
  assert.match(prod.gate, /approval/i, 'production deploy is gated')
  assert.match(res.note, /never executes/)
})

test('deploy preflight clears once the token is stored', () => {
  set('VERCEL_TOKEN', 'vercel-token-abcdefghijkl')
  const res = cli(['preflight', '--target', 'deploy'])
  assert.equal(res.ok, true, `still blocked: ${JSON.stringify(res.blockers)}`)
  assert.equal(res.stack.framework, 'next')
  assert.equal(res.stack.scripts.build, 'build')
})

test('db preflight requires a dry-run before the push and gates the push', () => {
  set('SUPABASE_URL', 'https://abcdefghijkl.supabase.co')
  set('SUPABASE_ANON_KEY', 'anon-key-abcdefghijklmnop')
  const res = cli(['preflight', '--target', 'db'])
  assert.equal(res.ok, true, `blocked: ${JSON.stringify(res.blockers)}`)
  const ids = res.plan.map((s) => s.id)
  assert.ok(ids.indexOf('db-dry-run') < ids.indexOf('db-push'), 'dry-run precedes push')
  assert.match(res.plan.find((s) => s.id === 'db-push').gate, /destructive/)
  assert.ok(res.warnings.some((w) => w.includes('SUPABASE_ACCESS_TOKEN')), 'missing CLI token is a warning, not a blocker')
})

test('a committable env file is a blocker, not a note', () => {
  writeFileSync(join(project, '.env.local'), 'SUPABASE_URL=https://x.supabase.co\n')
  writeFileSync(join(project, '.gitignore'), 'node_modules/\n')
  const res = cli(['preflight', '--target', 'all'])
  assert.ok(res.blockers.some((b) => b.code === 'env-not-gitignored'), `expected a gitignore blocker: ${JSON.stringify(res.blockers)}`)
})

test('an unknown preflight target is rejected', () => {
  assert.match(cli(['preflight', '--target', 'staging']).error, /unknown target "staging"/)
})

test('stack detection reads real evidence, not the project name', () => {
  mkdirSync(join(project, 'supabase', 'migrations'), { recursive: true })
  writeFileSync(join(project, 'supabase', 'migrations', '001_init.sql'), 'create table t(id int);')
  writeFileSync(join(project, 'supabase', 'config.toml'), '[db]\n')
  writeFileSync(join(project, 'pnpm-lock.yaml'), '')
  const stack = cli(['stack'])
  assert.equal(stack.framework, 'next')
  assert.equal(stack.pkgManager, 'pnpm')
  assert.equal(stack.db.supabase, true)
  assert.equal(stack.db.supabaseLinked, true)
  assert.equal(stack.db.migrations.count, 1)
})
