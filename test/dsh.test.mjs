// dsh.test.mjs — DeepSeek Harness (`dsh`) support.
//
// dsh composes its plugin tree from patch layers and throws at boot on a patch
// file it cannot parse, so the two failure modes that matter are: writing an
// invalid patch list (breaks the harness entirely), and clobbering the user's own
// layer (their rows, comments and `!!js` expressions live in the same file).
// Every test here is about one of those, or about the uninstall staying
// content-matched.
//
// No network, no npm deps, no dsh installation required — the patch layer is a
// plain file contract. Run with: node scripts/run-tests.mjs dsh

import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { detectHarnesses, dshHome } from '../lib/detect.mjs'
import { patchBlock, legacyPatchBlocks, patchFileHeader, hasPatchRow, isEmptyPatchList, PATCH_ROW_ID } from '../lib/install-dsh.mjs'
import { bundledSkills, DSH_SKILLS_SRC } from '../lib/install-skills.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = join(REPO_ROOT, 'bin', 'graphyloop.mjs')

const sandboxes = []
let home

function cli(...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', timeout: 120000 })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}

function install(...extra) {
  const r = cli('install', '--home', home, '--harness', 'dsh', ...extra)
  assert.equal(r.code, 0, `install failed: ${r.out}${r.err}`)
  return r
}

const patchPath = () => join(home, '.dsh', 'cordis.patch.yml')
const patchText = () => readFileSync(patchPath(), 'utf8')
const mcpPath = () => join(home, '.graphyloop', 'mcp-server.mjs')
const count = (haystack, needle) => haystack.split(needle).length - 1
const backups = (dir, name) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`${name}.bak-`)) : []

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'graphyloop-dsh-'))
  sandboxes.push(home)
})

after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

test('dsh is a detected harness whose config file is the home patch layer', () => {
  const found = detectHarnesses(home).find((h) => h.name === 'dsh')
  assert.ok(found, 'dsh missing from detectHarnesses')
  assert.equal(found.rootDir, join(home, '.dsh'))
  assert.equal(found.configPath, join(home, '.dsh', 'cordis.patch.yml'))
  assert.equal(found.present, false, 'absent before ~/.dsh exists')

  mkdirSync(join(home, '.dsh'), { recursive: true })
  assert.equal(detectHarnesses(home).find((h) => h.name === 'dsh').present, true)
})

test('--home wins over $DSH_HOME so a sandboxed run can never touch the real harness', () => {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = join(home, 'elsewhere')
  try {
    // homeDir is a sandbox, not os.homedir(): stay inside it.
    assert.equal(dshHome(home), join(home, '.dsh'))
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

test('install --harness dsh wires the MCP client, the rules, the skills and the squad library', () => {
  const res = install()
  assert.match(res.out, /GRAPH_LOOP_INSTALLED/)

  // 1. the patch layer: one insert mounting the MCP client at our server
  const text = patchText()
  assert.match(text, /^- insert:$/m, 'a top-level insert entry')
  assert.match(text, new RegExp(`^ {4}- id: ${PATCH_ROW_ID}$`, 'm'))
  assert.match(text, /^ {6}name: '@deepseek-ai\/dsh-mcp-client'$/m)
  assert.match(text, /^ {8}transport: stdio$/m)
  assert.match(text, /^ {8}serverName: graphyloop$/m)
  assert.match(text, /^ {8}command: node$/m)
  // Windows paths are backslash-heavy: single quotes keep them literal.
  assert.ok(text.includes(`          - '${mcpPath()}'`), `server path not quoted verbatim:\n${text}`)
  assert.ok(!text.includes('\t'), 'tabs are invalid YAML indentation')
  // dsh's cwd is the launch directory, not the open project, and its mcp-client
  // strips every DSH_* name from the child env — without this row the server
  // cannot find the workspace and every tool call fails the project-root guard.
  assert.match(text, /^ {8}env:$/m, 'the row carries an env block')
  assert.ok(
    text.includes(`          GRAPHYLOOP_DSH_HOME: '${join(home, '.dsh')}'`),
    `the dsh home is not stated for the server:\n${text}`
  )

  // 2. user-global instructions dsh loads for every session
  assert.equal(
    readFileSync(join(home, '.dsh', 'AGENTS.md'), 'utf8'),
    readFileSync(join(REPO_ROOT, 'workflow', 'AGENTS.md'), 'utf8'),
    'dsh AGENTS.md must be the shipped 5-gate rules'
  )

  // 3. skills: the shared bundle plus the dsh-only squad skill
  for (const name of bundledSkills()) {
    assert.ok(existsSync(join(home, '.dsh', 'skills', name, 'SKILL.md')), `skill ${name} missing`)
  }
  const squad = join(home, '.dsh', 'skills', 'graphyloop-squad', 'SKILL.md')
  assert.ok(existsSync(squad), 'the dsh-only graphyloop-squad skill is installed')
  const squadText = readFileSync(squad, 'utf8')
  // The bridge namespaces tools; a skill naming the bare tools would send the
  // model looking for tools this harness does not expose.
  assert.match(squadText, /mcp__graphyloop__memory_search/)
  assert.match(squadText, /subagent/)
  assert.ok(!existsSync(join(home, '.config', 'opencode', 'skills', 'graphyloop-squad')), 'dsh-only skill stays out of other harnesses')

  // 4. the squad prompt library + the workflow bodies
  assert.ok(existsSync(join(home, '.dsh', 'graphyloop', 'agents', 'agent-chadi.md')), 'conductor prompt installed')
  assert.ok(existsSync(join(home, '.dsh', 'graphyloop', 'commands', 'chadi-init.md')), 'workflow bodies installed')
  const agentCount = readdirSync(join(home, '.dsh', 'graphyloop', 'agents')).filter((f) => f.endsWith('.md')).length
  assert.equal(
    agentCount,
    readdirSync(join(REPO_ROOT, 'agents')).filter((f) => f.endsWith('.md')).length,
    'every squad role prompt is installed'
  )
})

test('re-installing dsh is idempotent: one graphyloop row, no duplicate insert', () => {
  install()
  const first = patchText()
  const res = install('--force')
  assert.equal(res.code, 0)
  const second = patchText()
  assert.equal(count(second, `id: ${PATCH_ROW_ID}`), 1, `duplicated row:\n${second}`)
  assert.equal(count(second, '- insert:'), 1)
  assert.equal(second, first, 'an already-wired patch layer is left byte-identical')
  assert.match(res.out, /already current/)
})

test('a row from an older graphyloop is upgraded in place, keeping the rest of the layer', () => {
  // 0.3.0 wrote the row without an env block, so the server read its cwd — the
  // dsh host's launch directory — and refused every tool call. An update has to
  // repair that row instead of skipping it because the id is already there.
  const userLayer = ['# keep me', '- id: hmr', '  disabled: true', ''].join('\n')
  mkdirSync(join(home, '.dsh'), { recursive: true })
  const stale = legacyPatchBlocks(mcpPath())[0]
  writeFileSync(patchPath(), `${userLayer}\n${stale}`)

  const res = install()

  const text = patchText()
  assert.match(res.out, /upgraded id: graphyloop-mcp/, res.out)
  assert.equal(count(text, `id: ${PATCH_ROW_ID}`), 1, `row duplicated instead of upgraded:\n${text}`)
  assert.ok(
    text.includes(`          GRAPHYLOOP_DSH_HOME: '${join(home, '.dsh')}'`),
    `env marker not added:\n${text}`
  )
  assert.ok(text.startsWith('# keep me'), 'user comment kept')
  assert.match(text, /^- id: hmr$/m, 'user row kept')
  assert.equal(backups(join(home, '.dsh'), 'cordis.patch.yml').length, 1, 'backed up before the upgrade')
  assert.equal(patchText(), `${userLayer}\n${patchBlock(mcpPath(), join(home, '.dsh'))}`, 'block swapped exactly')
})

test('a graphyloop row the user edited is left alone, with the missing env stated', () => {
  install()
  // Stripping the env block alone would just be the older graphyloop shape (and
  // is upgraded); this is a real user edit, so the row stays theirs.
  const edited = patchText()
    .replace(/^ {8}env:$[\s\S]*$/m, '')
    .replace('command: node', "command: 'C:\\tools\\node.exe'")
  writeFileSync(patchPath(), edited)
  const res = install('--force')
  assert.match(res.out, /user-modified/, res.out)
  assert.match(res.out, /GRAPHYLOOP_DSH_HOME/, 'the warning names the key the row needs')
  assert.equal(count(patchText(), `id: ${PATCH_ROW_ID}`), 1, 'no second row appended next to theirs')
  assert.ok(patchText().includes("command: 'C:\\tools\\node.exe'"), 'the user edit survives')
  assert.ok(!patchText().includes('GRAPHYLOOP_DSH_HOME'), 'the edited row is the user\'s and stays as-is')
})

test('an existing user patch layer keeps its rows and comments, and is backed up first', () => {
  const userLayer = [
    '# my machine-local dsh preferences',
    '- id: session-query-sqlite',
    '  config:',
    '    openAt: first-search',
    '    path: !!js dshHomePath("sessions.db")',
    '',
  ].join('\n')
  mkdirSync(join(home, '.dsh'), { recursive: true })
  writeFileSync(patchPath(), userLayer)

  install()

  const text = patchText()
  assert.ok(text.startsWith('# my machine-local dsh preferences'), 'user comment kept at the top')
  assert.match(text, /^- id: session-query-sqlite$/m, 'user row kept')
  assert.match(text, /openAt: first-search/, 'user config kept')
  assert.match(text, /!!js dshHomePath\("sessions\.db"\)/, '!!js expression kept verbatim')
  assert.ok(hasPatchRow(text), 'graphyloop row appended')
  assert.ok(text.indexOf('session-query-sqlite') < text.indexOf(PATCH_ROW_ID), 'appended after the user rows')
  assert.equal(backups(join(home, '.dsh'), 'cordis.patch.yml').length, 1, 'timestamped backup written')
})

test('the shipped [] template is replaced rather than appended to (an append would be invalid YAML)', () => {
  const template = [
    '# Your patch layer for this dsh profile, applied after every bundle layer:',
    '# a top-level YAML array of loader patch entries.',
    '[]',
    '',
  ].join('\n')
  mkdirSync(join(home, '.dsh'), { recursive: true })
  writeFileSync(patchPath(), template)

  install()

  const text = patchText()
  assert.ok(text.startsWith('# Your patch layer'), 'template comments kept')
  assert.equal(count(text, '[]'), 0, `the empty flow list must be gone:\n${text}`)
  assert.ok(hasPatchRow(text))
  assert.ok(!isEmptyPatchList(text), 'the list now holds an entry')
})

test('--no-config-merge, --skip-workflow and --skip-agents are honoured', () => {
  const res = install('--no-config-merge', '--skip-workflow', '--skip-agents')
  assert.equal(res.code, 0)
  assert.ok(!existsSync(patchPath()), 'no patch file written with --no-config-merge')
  assert.ok(!existsSync(join(home, '.dsh', 'AGENTS.md')), 'no AGENTS.md with --skip-workflow')
  assert.ok(!existsSync(join(home, '.dsh', 'graphyloop', 'agents')), 'no squad library with --skip-agents')
  // Skills are not agents or rules: they still install.
  assert.ok(existsSync(join(home, '.dsh', 'skills', 'graphyloop-waves', 'SKILL.md')))
})

test('a skill the user already has under one of our names is never replaced', () => {
  const mine = join(home, '.dsh', 'skills', 'graphyloop-squad')
  mkdirSync(mine, { recursive: true })
  writeFileSync(join(mine, 'SKILL.md'), '---\nname: graphyloop-squad\ndescription: mine\n---\n\nMine.\n')

  install('--force')

  assert.equal(readFileSync(join(mine, 'SKILL.md'), 'utf8'), '---\nname: graphyloop-squad\ndescription: mine\n---\n\nMine.\n')
})

// ---------------------------------------------------------------------------
// Uninstall
// ---------------------------------------------------------------------------

test('uninstall removes the graphyloop row, the rules and the library, keeping user content', () => {
  const userLayer = ['# keep me', '- id: hmr', '  disabled: true', ''].join('\n')
  mkdirSync(join(home, '.dsh'), { recursive: true })
  writeFileSync(patchPath(), userLayer)
  install()

  // A prompt the user edited must survive the uninstall.
  const editedPrompt = join(home, '.dsh', 'graphyloop', 'agents', 'chadi-backend.md')
  writeFileSync(editedPrompt, '# my own backend role\n')

  const res = cli('uninstall', '--home', home, '--harness', 'dsh')
  assert.equal(res.code, 0, res.out + res.err)
  assert.match(res.out, /GRAPH_LOOP_UNINSTALLED/)

  const text = patchText()
  assert.ok(!hasPatchRow(text), `graphyloop row still present:\n${text}`)
  assert.match(text, /^- id: hmr$/m, 'user row kept')
  assert.ok(text.startsWith('# keep me'), 'user comment kept')
  assert.ok(!isEmptyPatchList(text), 'user entry still parses as a list')

  assert.ok(!existsSync(join(home, '.dsh', 'AGENTS.md')), 'shipped AGENTS.md removed')
  assert.ok(!existsSync(join(home, '.dsh', 'skills', 'graphyloop-waves')), 'bundled skill removed')
  assert.ok(!existsSync(join(home, '.dsh', 'skills', 'graphyloop-squad')), 'dsh-only skill removed')
  assert.equal(readFileSync(editedPrompt, 'utf8'), '# my own backend role\n', 'user-edited prompt kept')
  assert.ok(!existsSync(join(home, '.dsh', 'graphyloop', 'commands', 'chadi-init.md')), 'shipped workflow body removed')
})

test('uninstall deletes a patch file graphyloop created, and leaves a valid list when it did not', () => {
  install()
  assert.ok(existsSync(patchPath()))
  const res = cli('uninstall', '--home', home, '--harness', 'dsh')
  assert.equal(res.code, 0, res.out + res.err)
  assert.ok(!existsSync(patchPath()), 'a file graphyloop created is removed outright')

  // Same again, but the user added a comment of their own to our file: the file
  // stays, and must still parse as an array for dsh to boot.
  install()
  writeFileSync(patchPath(), `# a note I added\n${patchText()}`)
  const second = cli('uninstall', '--home', home, '--harness', 'dsh')
  assert.equal(second.code, 0, second.out + second.err)
  const text = patchText()
  assert.ok(text.includes('# a note I added'), 'user comment kept')
  assert.ok(!hasPatchRow(text))
  assert.match(text, /^\[\]$/m, 'an entry-less patch file keeps a parsable empty list')
})

test('uninstall keeps a graphyloop row the user edited', () => {
  install()
  const edited = patchText().replace('serverName: graphyloop', 'serverName: graphyloop_custom')
  writeFileSync(patchPath(), edited)

  const res = cli('uninstall', '--home', home, '--harness', 'dsh')
  assert.equal(res.code, 0, res.out + res.err)
  assert.match(res.out, /user-modified/)
  assert.ok(hasPatchRow(patchText()), 'an edited row is the user\'s now, and is kept')
})

test('uninstall still recognises a row written by an older graphyloop', () => {
  const userLayer = ['# keep me', '- id: hmr', '  disabled: true', ''].join('\n')
  mkdirSync(join(home, '.dsh'), { recursive: true })
  writeFileSync(patchPath(), `${userLayer}\n${legacyPatchBlocks(mcpPath())[0]}`)

  const res = cli('uninstall', '--home', home, '--harness', 'dsh')
  assert.equal(res.code, 0, res.out + res.err)
  assert.ok(!hasPatchRow(patchText()), `legacy row not removed:\n${patchText()}`)
  assert.match(patchText(), /^- id: hmr$/m, 'user row kept')
})

// ---------------------------------------------------------------------------
// Runtime reporting
// ---------------------------------------------------------------------------

test('the engine reports the dsh skill roots, so a dsh-installed skill is not called missing', () => {
  const project = join(home, 'proj')
  mkdirSync(project, { recursive: true })
  install()

  const r = spawnSync(process.execPath, [join(REPO_ROOT, 'adapter', 'cli.mjs'), 'skills'], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: project, GRAPHYLOOP_HOME: home, DSH_HOME: '', DSH_AGENTS_HOME: '' },
  })
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`)
  const report = JSON.parse(r.stdout)
  const dshRoot = report.roots.find((root) => root.harness === 'dsh')
  assert.ok(dshRoot, `no dsh skill root reported: ${JSON.stringify(report.roots)}`)
  assert.equal(dshRoot.dir, join(home, '.dsh', 'skills'))
  assert.ok(dshRoot.present && dshRoot.count > 0, 'dsh skills detected after install')
  assert.deepEqual(report.bundled.missing, [], 'bundled skills found through the dsh root alone')
  assert.ok(report.roots.some((root) => root.harness === 'project-dsh'), 'project .dsh/skills root reported')
})

test('doctor lists dsh with its patch-layer config path', () => {
  const res = cli('doctor', '--home', home)
  assert.equal(res.code, 0, res.out + res.err)
  assert.match(res.out, /\bdsh\b/)
  assert.ok(res.out.includes(join('.dsh', 'cordis.patch.yml')), res.out)
})

// ---------------------------------------------------------------------------
// The block builder itself (pure, so it is cheap to pin)
// ---------------------------------------------------------------------------

test('the patch block is a valid single insert and quotes a quote-bearing path', () => {
  const block = patchBlock("C:\\it's\\mcp-server.mjs", "C:\\it's\\.dsh")
  assert.ok(block.includes("- 'C:\\it''s\\mcp-server.mjs'"), `bad quoting: ${block}`)
  assert.ok(block.includes("GRAPHYLOOP_DSH_HOME: 'C:\\it''s\\.dsh'"), `bad env quoting: ${block}`)
  assert.ok(hasPatchRow(block))
  assert.ok(!isEmptyPatchList(block))
  assert.ok(isEmptyPatchList(patchFileHeader()), 'the bare header holds no entries')
  assert.ok(existsSync(join(DSH_SKILLS_SRC, 'graphyloop-squad', 'SKILL.md')), 'the dsh skill ships in the package')

  // Every legacy shape must still be a recognisable graphyloop row, or an
  // upgrade would append a second one next to it.
  for (const legacy of legacyPatchBlocks("C:\\it's\\mcp-server.mjs")) {
    assert.ok(hasPatchRow(legacy), `legacy block unrecognised:\n${legacy}`)
    assert.ok(!legacy.includes('GRAPHYLOOP_DSH_HOME'), 'a legacy block predates the env marker')
  }
})
