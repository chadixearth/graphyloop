#!/usr/bin/env node
/**
 * GraphyLoop MCP stdio server — zero dependencies.
 *
 * Newline-delimited JSON-RPC 2.0 over stdin/stdout (one JSON object per line,
 * NOT content-length framing). Wraps the graphyloop CLI (adapter/cli.mjs) via
 * child_process.spawnSync with GRAPHYLOOP_PROJECT_ROOT env set.
 *
 * Export: runMcpServer({ stdin, stdout, homeDir }) + default main().
 */

import { spawnSync } from 'child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'fs'
import { homedir } from 'os'
import { join, resolve, isAbsolute, sep } from 'path'
import { pathToFileURL } from 'url'
import { createEngine } from './engine.mjs'

const PROTOCOL_VERSION = '2024-11-05'
// Wire format is identical across these revisions for the surface this server
// implements (initialize / ping / tools), so a client asking for a newer one
// gets it back rather than being forced down to ours.
const SUPPORTED_PROTOCOLS = ['2024-11-05', '2025-03-26', '2025-06-18']
const SERVER_NAME = 'graphyloop-mcp'
const SERVER_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version // test/mcp.test.mjs enforces serverInfo.version === package.json
const SPAWN_TIMEOUT_MS = 30000

// ============================================================================
// Tool registry
// ============================================================================

const TOOLS = [
  {
    name: 'agent_spawn',
    description:
      'Spawn a swarm agent. type (required): coder|tester|reviewer|architect|explorer|security|coordinator|frontend|data. Optional: id (default auto-generated), capabilities (comma-separated overrides), role (worker|peer|leader).',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Agent type: coder, tester, reviewer, architect, explorer, security, coordinator, frontend, data' },
        id: { type: 'string', description: 'Custom agent id (default auto-generated)' },
        capabilities: { type: 'string', description: 'Comma-separated capability overrides' },
        role: { type: 'string', description: 'worker | peer | leader (default: worker)' },
      },
      required: ['type'],
    },
  },
  {
    name: 'agent_list',
    description: 'List all swarm agents with type, status, role, and health.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'task_distribute',
    description:
      'Distribute tasks across swarm agents. tasks (required): JSON string array of {id, type, description, priority}. Returns per-task assignments with opencodeAgentType and prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        tasks: { type: 'string', description: 'JSON array of {id, type, description, priority} task objects' },
      },
      required: ['tasks'],
    },
  },
  {
    name: 'swarm_state',
    description: 'Swarm status: agents, active agents, tasks completed/failed, pending tasks, memory count.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'task_record',
    description:
      'Record a task result and update agent metrics. taskId + status (required; status: completed|failed). Optional: agentId, error.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task id' },
        status: { type: 'string', description: 'completed | failed' },
        agentId: { type: 'string', description: 'Agent id (default: task assigned agent)' },
        error: { type: 'string', description: 'Error message when failed' },
      },
      required: ['taskId', 'status'],
    },
  },
  {
    name: 'memory_store',
    description:
      'Store a memory entry. content (required). Optional: agent (default system), type (decision|pattern|lesson|event|task, default event), metadata (object or JSON string).',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Memory text' },
        agent: { type: 'string', description: 'Agent id (default: system)' },
        type: { type: 'string', description: 'decision | pattern | lesson | event | task (default: event)' },
        metadata: { type: 'object', description: 'Optional metadata object' },
      },
      required: ['content'],
    },
  },
  {
    name: 'memory_search',
    description:
      'Keyword-search stored memories, ranked by match quality with a recency bias. query (required), limit (optional, default 10), type (optional: decision|pattern|lesson|event|task).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'string', description: 'Max results (default 10)' },
        type: { type: 'string', description: 'Only search this memory type: decision | pattern | lesson | event | task' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_forget',
    description:
      'Delete one memory entry by id (ids come from memory_search results). Use this to correct a wrong or outdated memory instead of letting it be recalled forever.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory id to delete, e.g. mem-1700000000000-ab12' },
      },
      required: ['id'],
    },
  },
  {
    name: 'plan_feature',
    description:
      'Plan a multi-layer feature as parallel waves before writing any code. goal (required): the request in plain words, e.g. "inventory system with stock levels, a dashboard and deploy to vercel". Returns wave 0 contract (schema + API + props + test scenarios frozen by ONE agent) -> wave 1 parallel builders (data, backend, frontend, tests) -> wave 2 integration -> wave 3 parallel verifiers (test, typecheck, security, performance, review) -> wave 4 gated deploy, with per-task file ownership, acceptance checks and dependsOn. Pass the returned tasks array (JSON) straight to task_distribute.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'The feature request, verbatim' },
        includeDeploy: { type: 'boolean', description: 'Force the deploy wave on even if the goal does not mention shipping' },
        maxParallel: { type: 'string', description: 'Local builder concurrency cap (default 4, RAM-bound)' },
      },
      required: ['goal'],
    },
  },
  {
    name: 'secrets_status',
    description:
      'Masked readiness report for the project credentials (Supabase, Vercel): which keys are set, where each one comes from (process env, graphyloop store, .env file), and what is still missing. Values are NEVER returned — only a mask. Call this before database or deploy work instead of asking the user to paste keys.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'supabase | vercel | all (default all)' },
      },
      required: [],
    },
  },
  {
    name: 'secrets_set',
    description:
      'Store one credential in the project-local secret store (<project>/.graphyloop/secrets.json, chmod 600, git-ignored before the first write). key (required) e.g. SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, VERCEL_TOKEN. value (required) is written to disk and echoed back masked only. Use this once per key, then env_sync.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'UPPER_SNAKE_CASE key name' },
        value: { type: 'string', description: 'The credential value (stored, never echoed back)' },
        provider: { type: 'string', description: 'supabase | vercel (optional; inferred from the key)' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'env_sync',
    description:
      'Write the stored credentials into the env file the framework actually reads (default .env.local), add the framework public aliases for public keys only (NEXT_PUBLIC_*/VITE_*, never for a service-role key), refresh a values-free .env.example, and make sure .gitignore covers the env files. Values move file-to-file: the result lists key NAMES, never values.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Env file name inside the project (default .env.local)' },
        providers: { type: 'string', description: 'Comma-separated provider filter, e.g. "supabase"' },
        force: { type: 'boolean', description: 'Overwrite a key that already has a different value (a timestamped backup is kept)' },
      },
      required: [],
    },
  },
  {
    name: 'preflight',
    description:
      'Readiness check + ordered command plan for database setup and/or deploy. target: db | deploy | all (default all). Returns the detected stack, blockers (missing credentials, no build script, env file not git-ignored), warnings, and the exact commands to run — every destructive step (db push, --prod deploy) carries the approval gate it needs. Executes nothing itself.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'db | deploy | all (default all)' },
      },
      required: [],
    },
  },
  {
    name: 'skills_status',
    description:
      'Which skills are actually installed on this machine (project .opencode/skills, .dsh/skills, .agents/skills; ~/.config/opencode/skills, ~/.claude/skills, ~/.dsh/skills, ~/.agents/skills). Reports the graphyloop-bundled skills (71, of which 11 are graphyloop-authored: graphyloop-waves, api-contract-design, api-hardening, frontend-security, web-accessibility, web-performance, dependency-audit, supabase-setup, vercel-deploy, secrets-hygiene, swarm-memory) and which skills the squad routes on but are missing. Call it before claiming a skill was used — a missing skill is stated in one line, never faked.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'shutdown',
    description: 'Shut down the swarm (terminates agents, keeps memory) and exit the MCP server.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
]

// Tool name → CLI command + flags passed through to the graphyloop CLI.

/**
 * Exported so tests assert against the real surface instead of a hardcoded
 * number — a stale count in a test that spawns a server was hanging the suite.
 */
export const TOOL_NAMES = TOOLS.map((t) => t.name)

const TOOL_SPECS = {
  agent_spawn: { cli: 'spawn', flags: ['type', 'id', 'capabilities', 'role'] },
  agent_list: { cli: 'status', flags: [] },
  task_distribute: { cli: 'distribute', flags: ['tasks'] },
  swarm_state: { cli: 'status', flags: [] },
  task_record: { cli: 'record', flags: ['taskId', 'status', 'agentId', 'error'] },
  memory_store: { cli: 'memory-store', flags: ['agent', 'content', 'type', 'metadata'] },
  memory_search: { cli: 'memory-search', flags: ['query', 'limit', 'type'] },
  memory_forget: { cli: 'memory-forget', flags: ['id'] },
  plan_feature: { cli: 'plan', flags: ['goal', 'maxParallel'], boolFlags: ['includeDeploy'] },
  secrets_status: { cli: 'secrets-status', flags: ['provider'] },
  // `value` is deliberately absent from flags: a credential passed on argv shows
  // up in the process list. The spawn path hands it over through the env instead.
  secrets_set: { cli: 'secrets-set', flags: ['key', 'provider'], secretEnv: { GRAPHYLOOP_SECRET_VALUE: 'value' } },
  env_sync: { cli: 'env-sync', flags: ['target', 'providers'], boolFlags: ['force'] },
  preflight: { cli: 'preflight', flags: ['target'] },
  skills_status: { cli: 'skills', flags: [] },
  shutdown: { cli: 'shutdown', flags: [] },
}

// ============================================================================
// Argument validation (before spawn — bad input → isError, never crash)
// ============================================================================

function isMissing(v) { return v === undefined || v === null || v === '' }

function validateArgs(tool, input) {
  const args = input && typeof input === 'object' ? input : {}
  const SPAWN_TYPES = ['coder', 'tester', 'reviewer', 'architect', 'explorer', 'security', 'coordinator', 'frontend', 'data']
  switch (tool) {
    case 'agent_spawn':
      if (typeof args.type !== 'string' || isMissing(args.type.trim())) {
        return 'agent_spawn: "type" is required (string)'
      }
      if (!SPAWN_TYPES.includes(args.type.trim())) {
        return `agent_spawn: "type" must be one of: ${SPAWN_TYPES.join(', ')}`
      }
      for (const f of ['id', 'capabilities', 'role']) {
        if (args[f] !== undefined && args[f] !== null && typeof args[f] !== 'string') {
          return `agent_spawn: "${f}" must be a string`
        }
      }
      return null
    case 'task_distribute':
      if (typeof args.tasks !== 'string' || isMissing(args.tasks.trim())) {
        return 'task_distribute: "tasks" is required (JSON string array)'
      }
      if (args.tasks.length > 1_000_000) {
        return 'task_distribute: "tasks" exceeds 1 MB limit'
      }
      try {
        if (!Array.isArray(JSON.parse(args.tasks))) return 'task_distribute: "tasks" must be a JSON array'
      } catch {
        return 'task_distribute: "tasks" is not valid JSON'
      }
      return null
    case 'task_record':
      for (const f of ['taskId', 'status']) {
        if (typeof args[f] !== 'string' || isMissing(args[f].trim())) {
          return `task_record: "${f}" is required (string)`
        }
      }
      for (const f of ['agentId', 'error']) {
        if (args[f] !== undefined && args[f] !== null && typeof args[f] !== 'string') {
          return `task_record: "${f}" must be a string`
        }
      }
      return null
    case 'memory_store':
      if (typeof args.content !== 'string' || isMissing(args.content.trim())) {
        return 'memory_store: "content" is required (string)'
      }
      if (args.content.length > 100_000) {
        return 'memory_store: "content" exceeds 100 KB limit'
      }
      for (const f of ['agent', 'type']) {
        if (args[f] !== undefined && args[f] !== null && typeof args[f] !== 'string') {
          return `memory_store: "${f}" must be a string`
        }
      }
      if (args.metadata !== undefined && args.metadata !== null && typeof args.metadata !== 'object' && typeof args.metadata !== 'string') {
        return 'memory_store: "metadata" must be an object or JSON string'
      }
      if (args.metadata !== undefined && args.metadata !== null && JSON.stringify(args.metadata).length > 10_000) {
        return 'memory_store: "metadata" exceeds 10 KB limit'
      }
      return null
    case 'memory_forget':
      if (typeof args.id !== 'string' || isMissing(args.id.trim())) {
        return 'memory_forget: "id" is required (string; take it from memory_search results)'
      }
      return null
    case 'plan_feature':
      if (typeof args.goal !== 'string' || isMissing(args.goal.trim())) {
        return 'plan_feature: "goal" is required (string), e.g. "inventory system with stock levels and a dashboard"'
      }
      if (args.goal.length > 4_000) {
        return 'plan_feature: "goal" exceeds 4 KB — summarize the request first'
      }
      if (args.maxParallel !== undefined && args.maxParallel !== null) {
        const ok = (typeof args.maxParallel === 'string' && /^\d+$/.test(args.maxParallel.trim()))
          || (typeof args.maxParallel === 'number' && Number.isInteger(args.maxParallel))
        if (!ok || Number(args.maxParallel) < 1 || Number(args.maxParallel) > 16) {
          return 'plan_feature: "maxParallel" must be an integer between 1 and 16'
        }
      }
      return null
    case 'secrets_status':
      if (args.provider !== undefined && args.provider !== null && typeof args.provider !== 'string') {
        return 'secrets_status: "provider" must be a string (supabase | vercel | all)'
      }
      return null
    case 'secrets_set':
      if (typeof args.key !== 'string' || isMissing(args.key.trim())) {
        return 'secrets_set: "key" is required (string), e.g. SUPABASE_URL'
      }
      if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(args.key.trim())) {
        return `secrets_set: "${args.key}" is not a valid key name — use UPPER_SNAKE_CASE (A-Z, 0-9, _), 2-64 chars`
      }
      if (typeof args.value !== 'string' || isMissing(args.value)) {
        return 'secrets_set: "value" is required (string). It is stored on disk and echoed back masked only.'
      }
      if (args.value.length > 8_192) {
        return 'secrets_set: "value" exceeds 8 KB — that is not a credential'
      }
      return null
    case 'env_sync':
      for (const f of ['target', 'providers']) {
        if (args[f] !== undefined && args[f] !== null && typeof args[f] !== 'string') {
          return `env_sync: "${f}" must be a string`
        }
      }
      if (typeof args.target === 'string' && args.target.trim() && !args.target.trim().startsWith('.env')) {
        return 'env_sync: "target" must be an .env* file name inside the project'
      }
      return null
    case 'preflight':
      if (args.target !== undefined && args.target !== null) {
        if (typeof args.target !== 'string') return 'preflight: "target" must be a string'
        if (!['db', 'deploy', 'all'].includes(args.target.trim())) {
          return 'preflight: "target" must be one of: db, deploy, all'
        }
      }
      return null
    case 'memory_search':
      if (typeof args.query !== 'string' || isMissing(args.query.trim())) {
        return 'memory_search: "query" is required (string)'
      }
      if (args.type !== undefined && args.type !== null && typeof args.type !== 'string') {
        return 'memory_search: "type" must be a string'
      }
      if (args.query.length > 2_000) {
        return 'memory_search: "query" exceeds 2 KB limit'
      }
      if (args.limit !== undefined && args.limit !== null) {
        const ok = (typeof args.limit === 'string' && /^\d+$/.test(args.limit.trim()))
          || (typeof args.limit === 'number' && Number.isInteger(args.limit))
        if (!ok) {
          return 'memory_search: "limit" must be a positive integer'
        }
        const n = Number(args.limit)
        if (n < 1 || n > 1000) {
          return 'memory_search: "limit" must be between 1 and 1000'
        }
      }
      return null
    default:
      return null
  }
}

function buildArgs(spec, input) {
  const args = input && typeof input === 'object' ? input : {}
  const out = []
  for (const flag of spec.flags) {
    const v = args[flag]
    if (v === undefined || v === null) continue
    let str
    if (flag === 'metadata' && typeof v === 'object') str = JSON.stringify(v)
    else if ((flag === 'limit' || flag === 'maxParallel') && typeof v === 'number') str = String(v)
    else str = String(v)
    out.push(`--${flag}`, str)
  }
  // Presence-only flags, keyed MCP-arg-name -> CLI-flag-name.
  for (const [arg, cliFlag] of Object.entries(spec.boolFlags || {})) {
    if (args[arg] === true || args[arg] === 'true') out.push(`--${cliFlag}`)
  }
  return out
}

// A credential must not travel on argv (visible in `ps` / Task Manager), so the
// spawn path hands it to the CLI through the environment instead.
function spawnEnv(spec, input, baseEnv) {
  if (!spec.secretEnv) return baseEnv
  const args = input && typeof input === 'object' ? input : {}
  const env = { ...baseEnv }
  for (const [envName, field] of Object.entries(spec.secretEnv)) {
    if (args[field] !== undefined && args[field] !== null) env[envName] = String(args[field])
  }
  return env
}

// ============================================================================
// CLI invocation
// ============================================================================

// ---------------------------------------------------------------------------
// Project-root guard (mirrors plugin/graphyloop/plugin.js)
//
// The CLI writes <root>/.graphyloop/state.json. An MCP client launched
// with its cwd in the home or a system directory would otherwise litter those
// trees on the first tool call — and the write is denied outright under Windows
// system dirs.
// ---------------------------------------------------------------------------

/**
 * Canonical form of a path: symlinks resolved, or plain resolve() when the path
 * does not exist yet.
 *
 * Textual comparison is not enough for the guard. On macOS `process.cwd()` hands
 * back the resolved path (`/private/var/...`) while an env-provided home is the
 * symlink (`/var/...`), so a cwd that IS the home directory compared as a
 * different directory and the guard waved it through. The verdict is cached per
 * root, so this costs one realpath per root rather than one per tool call.
 */
function canonical(value) {
  const full = resolve(value)
  try {
    return realpathSync.native(full)
  } catch {
    return full
  }
}

function samePath(left, right) {
  const normalize = (value) => canonical(value).replace(/[\\/]+$/, '').toLowerCase()
  return normalize(left) === normalize(right)
}

function isInside(child, parent) {
  const c = canonical(child).toLowerCase()
  const p = canonical(parent).replace(/[\\/]+$/, '').toLowerCase()
  return c === p || c.startsWith(`${p}${sep}`)
}

function isBlockedRoot(root, homeDir) {
  if (!root) return true
  const systemRoot = process.env.SystemRoot || process.env.WINDIR
  if (systemRoot && isInside(root, systemRoot)) return true
  return samePath(root, homeDir) || samePath(root, join(homeDir, '.config', 'opencode'))
}

// ---------------------------------------------------------------------------
// Project-root resolution
//
// Most harnesses spawn an MCP server with its cwd at the project the user has
// open, so cwd IS the project root. The DeepSeek Harness (`dsh`) does not: it is
// a long-lived host whose cwd is wherever it was launched — typically the home
// directory — while the project is the *workspace* picked in the UI and recorded
// in dsh's own storage. Reading cwd there makes every tool call fail the guard
// above ("... is not a project root"), no matter which project is open.
//
// So resolve per tool call, in this order:
//   1. GRAPHYLOOP_PROJECT_ROOT — an explicit pin always wins (and is still
//      guarded, so pinning the home directory is refused rather than obeyed).
//   2. the dsh workspace store — only when the dsh home is known, which the
//      installer states as GRAPHYLOOP_DSH_HOME in the cordis patch row.
//   3. cwd — every other harness.
// Per call rather than per process, so switching workspaces mid-session lands in
// the right project without restarting the harness.
// ---------------------------------------------------------------------------

const DSH_WORKSPACE_STORE = ['storages', 'workspace.json']
const DSH_SESSION_STORE = ['storages', 'session_projcache.json']
/** Engines kept per project root — a long-lived dsh host can visit several. */
const MAX_ROOT_STATES = 8

function isDirectory(p) {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Parse a JSON store, cached until its mtime/size changes. */
function readStore(cache, file) {
  let stamp
  try {
    const st = statSync(file)
    stamp = `${st.mtimeMs}:${st.size}`
  } catch {
    cache.delete(file)
    return null
  }
  const hit = cache.get(file)
  if (hit && hit.stamp === stamp) return hit.data
  let data = null
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    data = null // a half-written store must not break the tool call
  }
  cache.set(file, { stamp, data })
  return data
}

/**
 * Project-root candidates from the dsh stores, most recently touched first.
 *
 * workspace.json is the list of folders opened in dsh (`tables.workspaces[].path`
 * + `updatedAt`); session_projcache.json carries each session's own cwd
 * (`tables.sessions[].identity.cwd`) and covers a host that has a live session
 * but no workspace row yet.
 */
function dshCandidateRoots(dshDir, cache) {
  const found = []
  const push = (value, when) => {
    if (typeof value !== 'string' || !value.trim()) return
    found.push({ path: value, when: Number.isFinite(when) ? when : 0 })
  }
  const ws = readStore(cache, join(dshDir, ...DSH_WORKSPACE_STORE))
  const workspaces = ws && ws.tables && ws.tables.workspaces
  if (workspaces && typeof workspaces === 'object') {
    for (const w of Object.values(workspaces)) {
      if (!w || typeof w !== 'object') continue
      push(w.path, Date.parse(w.updatedAt || w.createdAt || ''))
    }
  }
  const cached = readStore(cache, join(dshDir, ...DSH_SESSION_STORE))
  const sessions = cached && cached.tables && cached.tables.sessions
  if (sessions && typeof sessions === 'object') {
    for (const s of Object.values(sessions)) {
      const identity = s && s.identity
      if (!identity || typeof identity !== 'object') continue
      push(identity.cwd, Number(identity.updatedAt ?? identity.createdAt))
    }
  }
  found.sort((a, b) => b.when - a.when)
  const seen = new Set()
  const ordered = []
  for (const entry of found) {
    const full = resolve(entry.path)
    const key = full.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    ordered.push(full)
  }
  return ordered
}

/**
 * The dsh home this server should read workspaces from, or null when it is not
 * running under dsh. GRAPHYLOOP_DSH_HOME is what the installer writes into the
 * patch row; GRAPHYLOOP_HARNESS=dsh is the hand-written equivalent.
 */
function resolveDshDir(homeDir) {
  const pinned = (process.env.GRAPHYLOOP_DSH_HOME || '').trim()
  if (pinned) {
    const dir = resolve(pinned)
    return isDirectory(dir) ? dir : null
  }
  if ((process.env.GRAPHYLOOP_HARNESS || '').trim().toLowerCase() === 'dsh') {
    const fallback = join(homeDir, '.dsh')
    if (isDirectory(fallback)) return fallback
  }
  return null
}

/** @returns {{root: string, source: string}} */
function resolveProjectRoot(ctx) {
  const pinned = (process.env.GRAPHYLOOP_PROJECT_ROOT || '').trim()
  if (pinned) {
    // Same string on every call in practice, so resolve() runs once.
    if (ctx.pinnedRoot?.raw !== pinned) ctx.pinnedRoot = { raw: pinned, root: resolve(pinned) }
    return { root: ctx.pinnedRoot.root, source: 'GRAPHYLOOP_PROJECT_ROOT' }
  }
  if (ctx.dshDir) {
    for (const candidate of dshCandidateRoots(ctx.dshDir, ctx.storeCache)) {
      if (isDirectory(candidate) && !isBlockedRoot(candidate, ctx.homeDir)) {
        return { root: candidate, source: 'dsh workspace' }
      }
    }
  }
  // cwd cannot change under us: nothing in the server calls process.chdir, and a
  // stdio MCP server is spawned with the cwd it keeps for its whole life.
  return { root: ctx.cwdRoot, source: 'cwd' }
}

function blockedRootMessage(ctx, root) {
  const base = `graphyloop skipped: ${root} is not a project root (home, system, or harness config directory). Open a real project directory and retry.`
  if (!ctx.dshDir) return base
  // Under dsh that advice is not actionable on its own: the host's cwd is not
  // the project, so say where the project is looked up and how to pin it.
  return `${base} dsh keeps the open project in its workspace store, not in the host's working directory — no usable workspace was found in ${join(ctx.dshDir, ...DSH_WORKSPACE_STORE)}. Open a project folder in dsh, or pin one by adding "env: { GRAPHYLOOP_PROJECT_ROOT: <path> }" to the graphyloop-mcp row in ${join(ctx.dshDir, 'cordis.patch.yml')}.`
}

/**
 * Per-root engine + init state. Keyed by root so a workspace switch gets its own
 * engine (each writes its own <root>/.graphyloop/state.json) instead of the
 * first root winning for the life of the process.
 *
 * The guard verdict lives here too: isBlockedRoot() resolves and lowercases
 * several paths, and the answer for a given root never changes, so it is decided
 * once per root instead of on every tool call.
 */
function rootState(ctx, root) {
  const key = root.toLowerCase()
  const hit = ctx.roots.get(key)
  if (hit) return hit
  const state = {
    root,
    cliPath: ctx.cliPath,
    engine: null,
    initialized: false,
    blocked: isBlockedRoot(root, ctx.homeDir),
    env: null, // built on demand — only the spawn fallback needs a full env copy
  }
  // GRAPHYLOOP_CLI pins the server to a specific engine build (the tests use
  // it), so honour it by staying on the spawn path rather than silently running
  // a different engine in-process.
  if (!ctx.pinnedCli && !state.blocked) {
    try {
      state.engine = createEngine({ projectRoot: root })
    } catch {
      state.engine = null // fall back to spawning the CLI
    }
  }
  ctx.roots.set(key, state)
  while (ctx.roots.size > MAX_ROOT_STATES) {
    ctx.roots.delete(ctx.roots.keys().next().value)
  }
  return state
}

/** Env for the spawn fallback. Built lazily: the in-process path never needs it. */
function spawnBaseEnv(st) {
  if (!st.env) st.env = { ...process.env, GRAPHYLOOP_PROJECT_ROOT: st.root }
  return st.env
}

function resolveCliPath(homeDir) {
  // Only trust an env-provided CLI path when it is absolute, existing, and a
  // .mjs file — a poisoned env (project .env loaded by a harness) must not be
  // able to make us execute an arbitrary path.
  const env = process.env.GRAPHYLOOP_CLI
  if (env && isAbsolute(env) && existsSync(env) && env.endsWith('.mjs')) return env
  return join(homeDir, '.graphyloop', 'graphyloop', 'cli.mjs')
}

function spawnCli(cliPath, command, args, env) {
  try {
    const r = spawnSync(process.execPath, [cliPath, command, ...args], {
      encoding: 'utf8',
      env,
      timeout: SPAWN_TIMEOUT_MS,
      windowsHide: true,
    })
    if (r.error) {
      return { ok: false, error: `failed to spawn graphyloop CLI: ${r.error.message}` }
    }
    const out = (r.stdout || '').trim()
    if (r.status !== 0) {
      return { ok: false, error: `graphyloop CLI exited with code ${r.status}: ${out || (r.stderr || '').trim()}` }
    }
    let parsed
    try {
      parsed = JSON.parse(out)
    } catch {
      return { ok: false, error: `graphyloop CLI returned non-JSON output: ${out.slice(0, 500)}` }
    }
    if (parsed && typeof parsed === 'object' && parsed.error) {
      return { ok: false, error: JSON.stringify(parsed) }
    }
    return { ok: true, result: parsed }
  } catch (e) {
    return { ok: false, error: `graphyloop CLI error: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// Engine calls, in order of preference:
//   1. in-process  — no child process, no JSON round trip (~50-100ms saved per
//                    call, and a slow call no longer blocks the whole server)
//   2. spawned CLI — fallback for an older install whose ~/.graphyloop has no
//                    lib/engine.mjs yet
// `st` is the per-root state from rootState(): engine, cliPath and an env whose
// GRAPHYLOOP_PROJECT_ROOT is that root.
function runEngine(st, tool, input) {
  if (st.engine) {
    try {
      const result = ENGINE_CALLS[tool](st.engine, input)
      if (result && typeof result === 'object' && result.error) {
        return { ok: false, error: JSON.stringify(result) }
      }
      return { ok: true, result }
    } catch (e) {
      return { ok: false, error: `graphyloop engine error: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  const spec = TOOL_SPECS[tool]
  const r = spawnCli(st.cliPath, spec.cli, buildArgs(spec, input), spawnEnv(spec, input, spawnBaseEnv(st)))
  // An install from before these commands existed answers "unknown command".
  // Say what to do about it instead of leaking the CLI usage blob.
  if (!r.ok && /unknown command/.test(r.error || '')) {
    return { ok: false, error: `the installed graphyloop core does not support "${spec.cli}" yet — run: npx -y graphyloop@latest update` }
  }
  return r
}

// tool name -> engine method. `tasks` arrives as a JSON string over MCP and is
// already validated, so it is safe to parse here.
const ENGINE_CALLS = {
  agent_spawn: (e, a) => e.spawn(a),
  agent_list: (e) => e.status(),
  swarm_state: (e) => e.status(),
  task_distribute: (e, a) => e.distribute({ tasks: JSON.parse(a.tasks) }),
  task_record: (e, a) => e.record(a),
  memory_store: (e, a) => e.memoryStore(a),
  memory_search: (e, a) => e.memorySearch(a),
  memory_forget: (e, a) => e.memoryForget(a),
  plan_feature: (e, a) => e.planFeature({
    goal: a.goal,
    includeDeploy: a.includeDeploy === true || a.includeDeploy === 'true',
    maxParallel: a.maxParallel,
  }),
  secrets_status: (e, a) => e.secretsStatus({ provider: a.provider }),
  secrets_set: (e, a) => e.secretsSet({ key: a.key, value: a.value, provider: a.provider }),
  env_sync: (e, a) => e.envSync({
    target: a.target,
    providers: a.providers,
    force: a.force === true || a.force === 'true',
  }),
  preflight: (e, a) => e.preflight({ target: a.target }),
  skills_status: (e) => e.skills(),
  shutdown: (e) => e.shutdown(),
}

// The engine refuses every state-touching command until `init` has run, and the
// contracted tool set has no init tool — an MCP client could never start the
// swarm on its own. Initialize lazily on the first tool call instead. Success is
// cached per project root; a failure is not, so a transient error can recover on
// the next call.
function ensureInit(st) {
  if (st.initialized) return null
  if (st.engine) {
    const r = st.engine.init()
    if (r && r.error) return JSON.stringify(r)
    st.initialized = true
    return null
  }
  const r = spawnCli(st.cliPath, 'init', [], spawnBaseEnv(st))
  if (!r.ok) return r.error
  st.initialized = true
  return null
}

// ============================================================================
// JSON-RPC dispatch
// ============================================================================

function callTool(params, ctx) {
  const name = params && params.name
  if (typeof name !== 'string' || !TOOL_SPECS[name]) {
    return { content: [{ type: 'text', text: `unknown tool: ${String(name)}` }], isError: true }
  }
  const input = (params && params.arguments) || {}
  const invalid = validateArgs(name, input)
  if (invalid) {
    return { content: [{ type: 'text', text: invalid }], isError: true }
  }
  const { root, source } = resolveProjectRoot(ctx)
  const target = rootState(ctx, root)
  if (target.blocked) {
    return { content: [{ type: 'text', text: blockedRootMessage(ctx, root) }], isError: true }
  }
  if (!target.engine && !ctx.cliExists) {
    return {
      content: [{ type: 'text', text: `graphyloop engine not found (no in-process engine, no CLI at ${ctx.cliPath}). Run: npx graphyloop install` }],
      isError: true,
    }
  }
  if (ctx.lastRoot !== root) {
    ctx.lastRoot = root
    // stderr is the log channel for a stdio MCP server; stdout carries JSON-RPC.
    try {
      process.stderr.write(`graphyloop: project root ${root} (from ${source})\n`)
    } catch { /* a closed stderr must not fail the call */ }
  }
  if (name !== 'shutdown') {
    const initError = ensureInit(target)
    if (initError) {
      return { content: [{ type: 'text', text: `graphyloop init failed: ${initError}` }], isError: true }
    }
  }
  let argsInput = input
  if (name === 'memory_store' && (input.agent === undefined || input.agent === null)) {
    argsInput = { ...input, agent: 'system' }
  }
  const r = runEngine(target, name, argsInput)
  if (!r.ok) {
    return { content: [{ type: 'text', text: r.error }], isError: true }
  }
  return { content: [{ type: 'text', text: JSON.stringify(r.result) }], isError: false }
}

function dispatch(method, params, ctx) {
  switch (method) {
    case 'initialize': {
      // Echo the client's protocol version when we can speak it, per the MCP
      // spec, instead of always asserting our own.
      const asked = params && typeof params.protocolVersion === 'string' ? params.protocolVersion : null
      return {
        protocolVersion: asked && SUPPORTED_PROTOCOLS.includes(asked) ? asked : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      }
    }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: TOOLS }
    case 'tools/call':
      return callTool(params, ctx)
    default:
      return { __rpcError: { code: -32601, message: `Method not found: ${method}` } }
  }
}

function buildResponse(id, result) {
  if (result && result.__rpcError) {
    return { jsonrpc: '2.0', id, error: result.__rpcError }
  }
  return { jsonrpc: '2.0', id, result }
}

function send(ctx, obj) {
  ctx.stdout.write(JSON.stringify(obj) + '\n')
}

// The two hot methods with a constant payload. tools/list re-serialized ~9 KB of
// schema on every call and ping allocated three objects to say nothing at all, so
// both answer from a template with the id spliced in.
const TOOLS_RESULT_JSON = JSON.stringify({ tools: TOOLS })
const PING_RESULT_JSON = '{}'

function sendPrebuilt(ctx, id, resultJson) {
  ctx.stdout.write(`{"jsonrpc":"2.0","id":${JSON.stringify(id)},"result":${resultJson}}\n`)
}

function handleLine(raw, ctx) {
  const line = raw.trim()
  if (!line) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    send(ctx, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }
  if (!msg || typeof msg !== 'object' || typeof msg.method !== 'string') {
    send(ctx, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } })
    return
  }
  const isRequest = msg.id !== undefined && msg.id !== null
  if (!isRequest) return // notification — no response
  const method = msg.method
  if (method === 'ping') return sendPrebuilt(ctx, msg.id, PING_RESULT_JSON)
  if (method === 'tools/list') return sendPrebuilt(ctx, msg.id, TOOLS_RESULT_JSON)
  const params = msg.params && typeof msg.params === 'object' ? msg.params : {}

  if (method === 'tools/call' && params.name === 'shutdown') {
    const resp = buildResponse(msg.id, dispatch('tools/call', params, ctx))
    // flush response before exiting so the client sees it
    ctx.stdout.write(JSON.stringify(resp) + '\n', () => process.exit(0))
    return
  }
  send(ctx, buildResponse(msg.id, dispatch(method, params, ctx)))
}

// ============================================================================
// Server entry — testable with any streams
// ============================================================================

/**
 * Read newline-delimited JSON from a stream.
 *
 * readline's Interface carries history, key decoding and pause/resume machinery
 * this protocol has no use for; a stdio MCP server only ever needs "split on \n".
 * setEncoding keeps multi-byte characters intact across chunk boundaries, and
 * handleLine already trims, so a \r\n client needs no special case.
 */
function readLines(stdin, onLine, onEnd) {
  let buf = ''
  let scanned = 0 // bytes already searched for a newline
  stdin.setEncoding('utf8')
  stdin.on('data', (chunk) => {
    buf += chunk
    // task_distribute accepts up to 1 MB, which arrives as many chunks. Resuming
    // the search where the last one stopped keeps reassembly linear instead of
    // rescanning the whole buffer per chunk.
    let nl = buf.indexOf('\n', scanned)
    if (nl < 0) {
      scanned = buf.length
      return // partial message — wait for the rest
    }
    let start = 0
    while (nl >= 0) {
      onLine(buf.slice(start, nl))
      start = nl + 1
      nl = buf.indexOf('\n', start)
    }
    buf = start === buf.length ? '' : buf.slice(start)
    scanned = buf.length
  })
  const end = () => {
    // A client that wrote a request without a trailing newline and closed stdin
    // still gets an answer — readline behaved that way and clients rely on it.
    if (buf.trim()) {
      const tail = buf
      buf = ''
      scanned = 0
      onLine(tail)
    }
    onEnd()
  }
  stdin.on('end', end)
  stdin.on('close', end)
}

/**
 * Run the MCP server over the given streams.
 * @param {{stdin: NodeJS.ReadableStream, stdout: NodeJS.WritableStream, homeDir?: string}} opts
 */
export function runMcpServer({ stdin, stdout, homeDir } = {}) {
  const home = homeDir || process.env.GRAPHYLOOP_HOME || homedir()
  const cliPath = resolveCliPath(home)
  const ctx = {
    stdin,
    stdout,
    homeDir: home,
    cliPath,
    cliExists: existsSync(cliPath),
    pinnedCli: Boolean(process.env.GRAPHYLOOP_CLI),
    dshDir: resolveDshDir(home),
    storeCache: new Map(), // dsh store path -> {stamp, data}
    roots: new Map(),      // project root (lowercased) -> engine + guard + init state
    lastRoot: null,
    pinnedRoot: null,      // memoized resolve() of GRAPHYLOOP_PROJECT_ROOT
    cwdRoot: resolve(process.cwd()),
  }
  let ended = false
  const finish = () => {
    if (ended) return
    ended = true
    process.exit(0) // stdin EOF → exit
  }
  readLines(stdin, (line) => {
    try {
      handleLine(line, ctx)
    } catch (e) {
      send(ctx, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: e instanceof Error ? e.message : String(e) },
      })
    }
  }, finish)
  return ctx
}

/** Default entry: run over process stdio. */
export default function main() {
  runMcpServer({ stdin: process.stdin, stdout: process.stdout })
}

// Allow `node lib/mcp.mjs` to work directly as well.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
}
