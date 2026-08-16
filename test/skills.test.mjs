// skills.test.mjs — bundled skills: install, keep-user-copy, uninstall.
//
// The invariant that matters most is the FORCE EXCEPTION: users install skills
// from several collections into one tree, and some of our names exist there too.
// A graphyloop install/update must never replace a skill the user already has,
// even with --force — that would be data loss dressed as an upgrade.
//
// No network, no npm deps. Run with: node scripts/run-tests.mjs skills

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { bundledSkills, installSkills, skillFiles } from '../lib/install-skills.mjs'
import { GRAPHYLOOP_SKILLS, STATIC_GRAPHYLOOP_SKILLS, REFERENCED_SKILLS } from '../lib/engine.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = join(REPO_ROOT, 'bin', 'graphyloop.mjs')

const sandboxes = []
let home

function cli(...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', timeout: 120000 })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'graphyloop-skills-'))
  sandboxes.push(home)
})

after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// The bundle itself
// ---------------------------------------------------------------------------

test('the package ships skills, each a directory with a valid SKILL.md', () => {
  const names = bundledSkills()
  assert.ok(names.length >= 5, `expected bundled skills, got ${names.join(', ')}`)
  for (const name of names) {
    const file = join(REPO_ROOT, 'skills', name, 'SKILL.md')
    const text = readFileSync(file, 'utf8')
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    assert.ok(fm, `${name}: SKILL.md needs frontmatter`)
    assert.match(fm[1], new RegExp(`name:\\s*${name}\\b`), `${name}: frontmatter name must match the directory`)
    assert.match(fm[1], /description:\s*\S/, `${name}: frontmatter needs a description`)
    // The description is what the harness uses to decide when to load the skill;
    // a vague one-liner makes the skill dead weight.
    assert.ok(fm[1].match(/description:\s*(.*)/)[1].length > 60, `${name}: description too thin to route on`)
  }
})

test('the squad workflow references every bundled skill by name', () => {
  const agents = readdirSync(join(REPO_ROOT, 'agents'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => readFileSync(join(REPO_ROOT, 'agents', f), 'utf8'))
    .join('\n')
  const workflow = readFileSync(join(REPO_ROOT, 'workflow', 'AGENTS.md'), 'utf8')
  const haystack = `${agents}\n${workflow}`
  for (const name of bundledSkills()) {
    assert.ok(haystack.includes(name), `${name} is bundled but no agent or rule file mentions it`)
  }
})

// The installed core cannot read skills/ (it runs from ~/.graphyloop), so the
// engine carries a static fallback list. A skill added to the package but not to
// that list installs fine and then reports as "not bundled" at runtime — invisible
// until an agent asks.
test('the engine static fallback list matches what the package actually ships', () => {
  assert.deepEqual(
    STATIC_GRAPHYLOOP_SKILLS,
    bundledSkills(),
    'STATIC_GRAPHYLOOP_SKILLS (lib/engine.mjs) is out of sync with skills/'
  )
  assert.deepEqual(GRAPHYLOOP_SKILLS, bundledSkills(), 'GRAPHYLOOP_SKILLS resolved from the repo tree must match skills/')
})

// The drift this guards against shipped once already: agents named skills
// (design-taste-frontend, api-connector-builder, security-scan, …) that were
// neither bundled nor listed as referenced, so skills_status answered
// "referenced.missing: []" while subagents were told to load skills that existed
// nowhere on the machine. Every name an agent routes on must be accounted for.
test('every skill an agent routes on is either bundled or tracked as referenced', () => {
  const known = new Set([...GRAPHYLOOP_SKILLS, ...REFERENCED_SKILLS])
  const stackSpecific = /-security$|-patterns$/ // django-security, mysql-patterns: conditional on the project stack
  const unknown = new Map()

  for (const file of readdirSync(join(REPO_ROOT, 'agents')).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(join(REPO_ROOT, 'agents', file), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      if (!/^(Primary:|Supporting \(load when relevant\):)/.test(line)) continue
      for (const [, name] of line.matchAll(/`([a-z][a-z0-9-]+)`/g)) {
        if (known.has(name) || stackSpecific.test(name)) continue
        if (!unknown.has(name)) unknown.set(name, `${file}: ${line.trim()}`)
      }
    }
  }
  assert.deepEqual(
    [...unknown.keys()],
    [],
    `untracked skills in agent Primary/Supporting lines — bundle them or add to REFERENCED_SKILLS:\n${[...unknown.values()].join('\n')}`
  )
})

test('bundled and referenced skill names never overlap, and both lists are sorted and unique', () => {
  for (const [label, list] of [['GRAPHYLOOP_SKILLS', GRAPHYLOOP_SKILLS], ['REFERENCED_SKILLS', REFERENCED_SKILLS]]) {
    assert.deepEqual(list, [...list].sort(), `${label} must stay sorted`)
    assert.equal(new Set(list).size, list.length, `${label} has a duplicate`)
  }
  const overlap = REFERENCED_SKILLS.filter((n) => GRAPHYLOOP_SKILLS.includes(n))
  assert.deepEqual(overlap, [], 'a skill cannot be both bundled and "bring your own"')
})

// ---------------------------------------------------------------------------
// installSkills()
// ---------------------------------------------------------------------------

test('installSkills copies every bundled skill into an empty root', () => {
  const skillsDir = join(home, 'skills')
  const res = installSkills({ skillsDir })
  assert.equal(res.installed.length, bundledSkills().length)
  assert.equal(res.skipped, 0)
  for (const name of bundledSkills()) {
    assert.ok(existsSync(join(skillsDir, name, 'SKILL.md')), `${name} installed`)
  }
})

test('an existing skill directory is kept, even though install ran again', () => {
  const skillsDir = join(home, 'skills')
  const name = bundledSkills()[0]
  mkdirSync(join(skillsDir, name), { recursive: true })
  writeFileSync(join(skillsDir, name, 'SKILL.md'), '---\nname: mine\n---\n\nMY OWN VERSION\n')

  const res = installSkills({ skillsDir })
  assert.deepEqual(res.kept, [name])
  assert.equal(
    readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8').includes('MY OWN VERSION'),
    true,
    'user skill must survive'
  )
})

// ---------------------------------------------------------------------------
// End to end through the CLI
// ---------------------------------------------------------------------------

test('install puts the skills where OpenCode and Claude look for them', () => {
  const res = cli('install', '--home', home, '--harness', 'all')
  assert.equal(res.code, 0, res.out + res.err)
  for (const name of bundledSkills()) {
    assert.ok(existsSync(join(home, '.config', 'opencode', 'skills', name, 'SKILL.md')), `opencode: ${name}`)
    assert.ok(existsSync(join(home, '.claude', 'skills', name, 'SKILL.md')), `claude: ${name}`)
  }
  assert.match(res.out, /Installing bundled skills/)
})

test('--force does NOT overwrite a user-owned skill of the same name', () => {
  install()
  const target = join(home, '.config', 'opencode', 'skills', bundledSkills()[0], 'SKILL.md')
  writeFileSync(target, '---\nname: from-another-collection\n---\n\nNOT OURS\n')

  const res = cli('install', '--home', home, '--harness', 'opencode', '--force')
  assert.equal(res.code, 0, res.out + res.err)
  assert.equal(readFileSync(target, 'utf8').includes('NOT OURS'), true, 'force must not clobber a skill')
  assert.match(res.out, /your copy is kept/)
})

test('update restores a deleted skill and still keeps a user-modified one', () => {
  install()
  const names = bundledSkills()
  rmSync(join(home, '.config', 'opencode', 'skills', names[0]), { recursive: true, force: true })
  const kept = join(home, '.config', 'opencode', 'skills', names[1], 'SKILL.md')
  writeFileSync(kept, '---\nname: edited\n---\n\nEDITED BY USER\n')

  assert.equal(cli('update', '--home', home).code, 0)
  assert.ok(existsSync(join(home, '.config', 'opencode', 'skills', names[0], 'SKILL.md')), 'deleted skill restored')
  assert.equal(readFileSync(kept, 'utf8').includes('EDITED BY USER'), true, 'edited skill preserved')
})

test('uninstall removes our skills but keeps a user-modified one', () => {
  install()
  const names = bundledSkills()
  const edited = join(home, '.config', 'opencode', 'skills', names[1], 'SKILL.md')
  writeFileSync(edited, `${readFileSync(edited, 'utf8')}\n<!-- my note -->\n`)

  const res = cli('uninstall', '--home', home, '--harness', 'opencode')
  assert.equal(res.code, 0, res.out + res.err)
  assert.equal(
    existsSync(join(home, '.config', 'opencode', 'skills', names[0], 'SKILL.md')),
    false,
    'untouched graphyloop skill removed'
  )
  assert.ok(existsSync(edited), 'user-modified skill kept')
})

test('skillFiles() maps every shipped file for byte-identical matching', () => {
  const map = skillFiles()
  assert.ok(map.size >= bundledSkills().length)
  for (const name of bundledSkills()) {
    assert.ok(map.has(join(name, 'SKILL.md')), `${name}/SKILL.md in the content map`)
  }
})

// ---------------------------------------------------------------------------
// Runtime detection: an agent must be able to ask "is it actually there?"
// ---------------------------------------------------------------------------

test('the engine reports installed vs missing skills, and points at update when bundled ones are absent', () => {
  const project = join(home, 'proj')
  mkdirSync(project, { recursive: true })
  const engineCli = join(REPO_ROOT, 'adapter', 'cli.mjs')
  const run = () => {
    const r = spawnSync(process.execPath, [engineCli, 'skills'], {
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: project, GRAPHYLOOP_HOME: home },
    })
    assert.equal(r.status, 0, `exit ${r.status}: ${r.stdout}${r.stderr}`)
    return JSON.parse(r.stdout)
  }

  // Nothing installed under this fake home yet.
  const before = run()
  assert.equal(before.ok, true)
  assert.deepEqual(before.bundled.missing, bundledSkills(), 'all bundled skills reported missing')
  assert.match(before.note, /graphyloop@latest update/)

  install()

  const after = run()
  assert.deepEqual(after.bundled.missing, [], `still missing: ${after.bundled.missing}`)
  assert.deepEqual(after.bundled.installed.sort(), bundledSkills(), 'bundled skills detected after install')
  assert.match(after.note, /are installed/)
  // Skills the squad routes on but does not ship are reported, not silently assumed.
  assert.ok(Array.isArray(after.referenced.missing))
  assert.ok(after.roots.some((r) => r.harness === 'opencode' && r.present && r.count > 0))
})

function install() {
  const r = cli('install', '--home', home, '--harness', 'opencode')
  assert.equal(r.code, 0, `install failed: ${r.out}${r.err}`)
  return r
}
