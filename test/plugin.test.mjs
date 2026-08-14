// plugin.test.mjs — OpenCode plugin tests (plugin/graphyloop/plugin.js).
//
// The plugin imports `@opencode-ai/plugin`, which is provided by the OpenCode
// host and is not a dependency of this package, so it cannot be imported
// directly here. Instead the plugin is copied into a temp directory next to a
// stub `node_modules/@opencode-ai/plugin`: Node resolves bare specifiers by
// walking up from the importing file, so the copy loads against the stub with
// no loader hooks or Node-version-specific APIs.
//
// HOME/USERPROFILE are overridden before the import because the plugin captures
// os.homedir() at module load to decide which roots are off limits.
//
// No network, no npm deps. Run with: node scripts/run-tests.mjs

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_SRC = join(REPO_ROOT, 'plugin', 'graphyloop', 'plugin.js')
const ADAPTER_CLI = join(REPO_ROOT, 'adapter', 'cli.mjs')

// Minimal stand-in for @opencode-ai/plugin: `tool(def)` returns the definition
// and `tool.schema.string()` is a chainable no-op descriptor.
const STUB = `
const chain = () => {
  const o = {}
  o.describe = () => o
  o.optional = () => o
  return o
}
export const tool = (def) => def
tool.schema = { string: chain }
export default { tool }
`

let sandbox
let project
let makePlugin

before(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'graphyloop-plugin-'))
  project = join(sandbox, 'project')
  mkdirSync(project, { recursive: true })

  const stubDir = join(sandbox, 'node_modules', '@opencode-ai', 'plugin')
  mkdirSync(stubDir, { recursive: true })
  writeFileSync(join(stubDir, 'index.js'), STUB)
  writeFileSync(join(stubDir, 'package.json'), JSON.stringify({ name: '@opencode-ai/plugin', version: '0.0.0-stub', type: 'module', main: 'index.js' }))

  const pluginCopy = join(sandbox, 'plugin.js')
  copyFileSync(PLUGIN_SRC, pluginCopy)
  writeFileSync(join(sandbox, 'package.json'), JSON.stringify({ name: 'graphyloop-plugin-sandbox', private: true, type: 'module' }))

  // Fake home so the blocked-root logic is deterministic, and pin the engine to
  // the repo copy rather than whatever is installed on this machine.
  const fakeHome = join(sandbox, 'home')
  mkdirSync(fakeHome, { recursive: true })
  process.env.HOME = fakeHome
  process.env.USERPROFILE = fakeHome
  process.env.GRAPHYLOOP_CLI = ADAPTER_CLI

  makePlugin = (await import(pathToFileURL(pluginCopy).href)).default
})

after(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true })
})

function parse(json) {
  return JSON.parse(json)
}

test('exposes the graphyloop_* tool set', async () => {
  const api = await makePlugin({ directory: project })
  const names = Object.keys(api.tool).sort()
  assert.deepEqual(names, [
    'graphyloop_distribute',
    'graphyloop_init',
    'graphyloop_memory_forget',
    'graphyloop_memory_search',
    'graphyloop_memory_store',
    'graphyloop_record',
    'graphyloop_shutdown',
    'graphyloop_spawn',
    'graphyloop_status',
  ])
  for (const [name, def] of Object.entries(api.tool)) {
    assert.equal(typeof def.description, 'string', `${name}: description`)
    assert.equal(typeof def.execute, 'function', `${name}: execute`)
  }
})

test('init and memory round-trip through the engine', async () => {
  const api = await makePlugin({ directory: project })
  const init = parse(await api.tool.graphyloop_init.execute())
  assert.equal(init.ok, true, JSON.stringify(init))
  assert.ok(existsSync(join(project, '.graphyloop', 'state.json')), 'state written under the project')

  const stored = parse(await api.tool.graphyloop_memory_store.execute({ content: 'plugin round trip', type: 'lesson' }))
  assert.equal(stored.store.ok, true, JSON.stringify(stored))

  const found = parse(await api.tool.graphyloop_memory_search.execute({ query: 'round trip' }))
  assert.ok(
    found.search.results.some((m) => m.content === 'plugin round trip'),
    JSON.stringify(found.search)
  )
})

// Regression: shutdown flips the engine back to uninitialized, but the plugin
// cached a successful init per project — every later call in the session then
// reported "not initialized" instead of restarting the swarm.
test('shutdown drops the cached init so the swarm restarts', async () => {
  const api = await makePlugin({ directory: project })
  await api.tool.graphyloop_init.execute()

  const down = parse(await api.tool.graphyloop_shutdown.execute())
  assert.equal(down.ok, true, JSON.stringify(down))

  const after = parse(await api.tool.graphyloop_memory_store.execute({ content: 'after shutdown' }))
  assert.equal(after.store.ok, true, `store after shutdown should re-init: ${JSON.stringify(after)}`)
})

test('a memory can be corrected, not just appended', async () => {
  const api = await makePlugin({ directory: project })
  await api.tool.graphyloop_memory_store.execute({ content: 'wrong lesson to retract', type: 'lesson' })
  const found = parse(await api.tool.graphyloop_memory_search.execute({ query: 'retract', type: 'lesson' }))
  const hit = found.search.results.find((m) => m.content === 'wrong lesson to retract')
  assert.ok(hit, JSON.stringify(found.search))

  const forgotten = parse(await api.tool.graphyloop_memory_forget.execute({ id: hit.id }))
  assert.equal(forgotten.forget.ok, true, JSON.stringify(forgotten))

  const after = parse(await api.tool.graphyloop_memory_search.execute({ query: 'retract' }))
  assert.ok(
    !after.search.results.some((m) => m.id === hit.id),
    'the retracted memory is gone from later recalls'
  )
})

test('refuses to run in the home directory', async () => {
  const api = await makePlugin({ directory: process.env.HOME })
  const res = parse(await api.tool.graphyloop_status.execute())
  assert.match(JSON.stringify(res), /not a project root/)
  assert.ok(!existsSync(join(process.env.HOME, '.graphyloop')), 'home left untouched')
})

test('malformed distribute payloads are rejected before spawning the engine', async () => {
  const api = await makePlugin({ directory: project })
  assert.match(parse(await api.tool.graphyloop_distribute.execute({ tasks: 'not json' })).error, /valid JSON array/)
  assert.match(parse(await api.tool.graphyloop_distribute.execute({ tasks: '{"id":"t1"}' })).error, /must be a JSON array/)
  assert.match(parse(await api.tool.graphyloop_distribute.execute({ tasks: '[]' })).error, /empty/)
})

// A crashing engine used to surface as an empty "bad CLI output:" string.
test('an engine crash is reported with its exit code', async () => {
  const crashingCli = join(sandbox, 'crash.mjs')
  writeFileSync(crashingCli, 'process.stderr.write("boom\\n"); process.exit(3)\n')

  const isolated = mkdtempSync(join(tmpdir(), 'graphyloop-plugin-crash-'))
  const pluginCopy = join(isolated, 'plugin.js')
  mkdirSync(join(isolated, 'node_modules', '@opencode-ai', 'plugin'), { recursive: true })
  writeFileSync(join(isolated, 'node_modules', '@opencode-ai', 'plugin', 'index.js'), STUB)
  writeFileSync(join(isolated, 'node_modules', '@opencode-ai', 'plugin', 'package.json'), JSON.stringify({ name: '@opencode-ai/plugin', version: '0.0.0-stub', type: 'module', main: 'index.js' }))
  writeFileSync(join(isolated, 'package.json'), JSON.stringify({ name: 'x', private: true, type: 'module' }))
  copyFileSync(PLUGIN_SRC, pluginCopy)

  process.env.GRAPHYLOOP_CLI = crashingCli
  try {
    const factory = (await import(`${pathToFileURL(pluginCopy).href}?crash`)).default
    const api = await factory({ directory: project })
    const res = parse(await api.tool.graphyloop_status.execute())
    assert.match(JSON.stringify(res), /exited with code 3/, JSON.stringify(res))
  } finally {
    process.env.GRAPHYLOOP_CLI = ADAPTER_CLI
    rmSync(isolated, { recursive: true, force: true })
  }
})
