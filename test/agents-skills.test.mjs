// agents-skills.test.mjs — Agent Skills standard (~/.agents/skills) for Codex and Cursor.
//
// Codex and Cursor both discover user-level skills in ~/.agents/skills. Installing
// either harness populates ~/.agents/skills with the bundled skills + manifests,
// respects --skip-agents and user edits, and uninstalling one harness keeps the
// shared skills while the other still has graphyloop wired in its MCP config.
//
// Run with: node scripts/run-tests.mjs agents-skills

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
import { bundledSkills, SKILL_MANIFEST } from '../lib/install-skills.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = join(REPO_ROOT, 'bin', 'graphyloop.mjs')
const ADAPTER_CLI = join(REPO_ROOT, 'adapter', 'cli.mjs')
const SKILLS = bundledSkills()

const sandboxes = []
let home

function cli(...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', timeout: 120000 })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'graphyloop-agents-skills-'))
  sandboxes.push(home)
})

after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true })
})

test('codex and cursor install bundled skills + manifests into ~/.agents/skills; user edits survive re-install and update', () => {
  const r1 = cli('install', '--harness', 'codex', '--home', home)
  assert.equal(r1.code, 0, r1.out + r1.err)
  assert.match(r1.out, /Codex:.*~\/\.agents\/skills/)

  const skillsDir = join(home, '.agents', 'skills')
  const wfSkill = join(skillsDir, 'graphyloop-workflow', 'SKILL.md')
  const wfManifest = join(skillsDir, 'graphyloop-workflow', SKILL_MANIFEST)
  assert.ok(existsSync(wfSkill), 'graphyloop-workflow/SKILL.md installed')
  assert.ok(existsSync(wfManifest), 'graphyloop-workflow manifest written')
  const installedDirs = readdirSync(skillsDir).filter((n) => existsSync(join(skillsDir, n, 'SKILL.md')))
  assert.equal(installedDirs.length, SKILLS.length, 'all bundled skills installed')

  // User edits one skill; re-installing cursor and running update both keep the edit.
  const customBody = '---\nname: graphyloop-workflow\ndescription: custom\n---\n\nUSER EDITED SKILL\n'
  writeFileSync(wfSkill, customBody)

  const r2 = cli('install', '--harness', 'cursor', '--home', home)
  assert.equal(r2.code, 0, r2.out + r2.err)
  assert.match(r2.out, /Cursor:.*~\/\.agents\/skills/)
  assert.equal(readFileSync(wfSkill, 'utf8'), customBody, 'user edit kept on cursor install')

  const r3 = cli('update', '--harness', 'codex,cursor', '--home', home)
  assert.equal(r3.code, 0, r3.out + r3.err)
  assert.equal(readFileSync(wfSkill, 'utf8'), customBody, 'user edit kept on update')
})

test('--skip-agents installs neither prompts nor ~/.agents/skills for codex and cursor', () => {
  const r = cli('install', '--harness', 'codex,cursor', '--skip-agents', '--home', home)
  assert.equal(r.code, 0, r.out + r.err)
  assert.ok(existsSync(join(home, '.codex', 'config.toml')), 'codex config installed')
  assert.ok(existsSync(join(home, '.cursor', 'mcp.json')), 'cursor mcp.json installed')
  assert.ok(!existsSync(join(home, '.codex', 'prompts')), 'codex prompts skipped')
  assert.ok(!existsSync(join(home, '.agents', 'skills')), '~/.agents/skills skipped')
})

test('uninstalling codex while cursor is still wired keeps ~/.agents/skills; uninstalling both removes untouched copies and keeps edited ones', () => {
  assert.equal(cli('install', '--harness', 'codex,cursor', '--home', home).code, 0)

  const skillsDir = join(home, '.agents', 'skills')
  const editedSkill = join(skillsDir, 'swarm-memory', 'SKILL.md')
  const untouchedSkill = join(skillsDir, 'graphyloop-workflow', 'SKILL.md')
  writeFileSync(editedSkill, '---\nname: swarm-memory\n---\n\nMY SWARM MEMORY\n')

  // Uninstall only codex while cursor still has mcpServers.graphyloop in ~/.cursor/mcp.json.
  const u1 = cli('uninstall', '--harness', 'codex', '--home', home)
  assert.equal(u1.code, 0, u1.out + u1.err)
  assert.match(u1.out, /keep .*\.agents[\\/]skills: cursor still has graphyloop wired/)
  assert.ok(existsSync(untouchedSkill), 'untouched skill kept while cursor is still wired')
  assert.ok(existsSync(editedSkill), 'edited skill kept while cursor is still wired')

  // Re-install codex, then uninstall both in one run: untouched skills are removed once, edited skill survives.
  assert.equal(cli('install', '--harness', 'codex', '--home', home).code, 0)
  const u2 = cli('uninstall', '--harness', 'codex,cursor', '--home', home)
  assert.equal(u2.code, 0, u2.out + u2.err)
  assert.ok(!/keep .*\.agents[\\/]skills/.test(u2.out), 'no keep message when both harnesses are uninstalled together')
  assert.ok(!existsSync(join(skillsDir, 'graphyloop-workflow')), 'untouched skill directory removed')
  assert.ok(existsSync(editedSkill), 'user-edited skill preserved after uninstall')
  assert.equal(readFileSync(editedSkill, 'utf8'), '---\nname: swarm-memory\n---\n\nMY SWARM MEMORY\n')
})

test('engine skills_status labels ~/.agents/skills as "agents" and honours DSH_AGENTS_HOME', () => {
  const project = join(home, 'proj')
  mkdirSync(project, { recursive: true })
  mkdirSync(join(home, '.agents', 'skills', 'demo-skill'), { recursive: true })
  writeFileSync(join(home, '.agents', 'skills', 'demo-skill', 'SKILL.md'), '---\nname: demo-skill\n---\n')

  const r1 = spawnSync(process.execPath, [ADAPTER_CLI, 'skills'], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: project, GRAPHYLOOP_HOME: home, DSH_AGENTS_HOME: '' },
  })
  assert.equal(r1.status, 0, r1.stdout + r1.stderr)
  const report1 = JSON.parse(r1.stdout)
  const agentsRoot = report1.roots.find((r) => r.harness === 'agents')
  assert.ok(agentsRoot, `expected harness "agents" in roots: ${JSON.stringify(report1.roots)}`)
  assert.equal(resolve(agentsRoot.dir), resolve(home, '.agents', 'skills'))
  assert.equal(agentsRoot.present, true)
  assert.equal(agentsRoot.count, 1)

  const customAgentsHome = join(home, 'custom-agents')
  mkdirSync(join(customAgentsHome, 'skills', 'custom-skill'), { recursive: true })
  writeFileSync(join(customAgentsHome, 'skills', 'custom-skill', 'SKILL.md'), '---\nname: custom-skill\n---\n')
  const r2 = spawnSync(process.execPath, [ADAPTER_CLI, 'skills'], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: project, GRAPHYLOOP_HOME: home, DSH_AGENTS_HOME: customAgentsHome },
  })
  assert.equal(r2.status, 0, r2.stdout + r2.stderr)
  const report2 = JSON.parse(r2.stdout)
  const customRoot = report2.roots.find((r) => r.harness === 'agents')
  assert.equal(resolve(customRoot.dir), resolve(customAgentsHome, 'skills'))
  assert.equal(customRoot.present, true)
})
