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
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve, isAbsolute, sep } from 'path'
import { pathToFileURL } from 'url'
import { createInterface } from 'readline'
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
      'Which skills are actually installed on this machine (project .opencode/skills, .dsh/skills, .agents/skills; ~/.config/opencode/skills, ~/.claude/skills, ~/.dsh/skills, ~/.agents/skills). Reports the 11 graphyloop-bundled skills (graphyloop-waves, api-contract-design, api-hardening, frontend-security, web-accessibility, web-performance, dependency-audit, supabase-setup, vercel-deploy, secrets-hygiene, swarm-memory) and which skills the squad routes on but are missing. Call it before claiming a skill was used — a missing skill is stated in one line, never faked.',
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

function samePath(left, right) {
  const normalize = (value) => resolve(value).replace(/[\\/]+$/, '').toLowerCase()
  return normalize(left) === normalize(right)
}

function isInside(child, parent) {
  const c = resolve(child).toLowerCase()
  const p = resolve(parent).replace(/[\\/]+$/, '').toLowerCase()
  return c === p || c.startsWith(`${p}${sep}`)
}

function isBlockedRoot(root, homeDir) {
  if (!root) return true
  const systemRoot = process.env.SystemRoot || process.env.WINDIR
  if (systemRoot && isInside(root, systemRoot)) return true
  return samePath(root, homeDir) || samePath(root, join(homeDir, '.config', 'opencode'))
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
function runEngine(ctx, tool, input) {
  if (ctx.engine) {
    try {
      const result = ENGINE_CALLS[tool](ctx.engine, input)
      if (result && typeof result === 'object' && result.error) {
        return { ok: false, error: JSON.stringify(result) }
      }
      return { ok: true, result }
    } catch (e) {
      return { ok: false, error: `graphyloop engine error: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  const spec = TOOL_SPECS[tool]
  const r = spawnCli(ctx.cliPath, spec.cli, buildArgs(spec, input), spawnEnv(spec, input, ctx.env))
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
// cached per process; a failure is not, so a transient error can recover on the
// next call.
function ensureInit(ctx) {
  if (ctx.initialized) return null
  if (ctx.engine) {
    const r = ctx.engine.init()
    if (r && r.error) return JSON.stringify(r)
    ctx.initialized = true
    return null
  }
  const r = spawnCli(ctx.cliPath, 'init', [], ctx.env)
  if (!r.ok) return r.error
  ctx.initialized = true
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
  if (!ctx.engine && !ctx.cliExists) {
    return {
      content: [{ type: 'text', text: `graphyloop engine not found (no in-process engine, no CLI at ${ctx.cliPath}). Run: npx graphyloop install` }],
      isError: true,
    }
  }
  if (ctx.blockedRoot) {
    return {
      content: [{
        type: 'text',
        text: `graphyloop skipped: ${ctx.projectRoot} is not a project root (home, system, or harness config directory). Open a real project directory and retry.`,
      }],
      isError: true,
    }
  }
  if (name !== 'shutdown') {
    const initError = ensureInit(ctx)
    if (initError) {
      return { content: [{ type: 'text', text: `graphyloop init failed: ${initError}` }], isError: true }
    }
  }
  let argsInput = input
  if (name === 'memory_store' && (input.agent === undefined || input.agent === null)) {
    argsInput = { ...input, agent: 'system' }
  }
  const r = runEngine(ctx, name, argsInput)
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
  const params = msg.params && typeof msg.params === 'object' ? msg.params : {}
  if (!isRequest) return // notification — no response

  if (msg.method === 'tools/call' && params.name === 'shutdown') {
    const resp = buildResponse(msg.id, dispatch('tools/call', params, ctx))
    // flush response before exiting so the client sees it
    ctx.stdout.write(JSON.stringify(resp) + '\n', () => process.exit(0))
    return
  }
  send(ctx, buildResponse(msg.id, dispatch(msg.method, params, ctx)))
}

// ============================================================================
// Server entry — testable with any streams
// ============================================================================

/**
 * Run the MCP server over the given streams.
 * @param {{stdin: NodeJS.ReadableStream, stdout: NodeJS.WritableStream, homeDir?: string}} opts
 */
export function runMcpServer({ stdin, stdout, homeDir } = {}) {
  const home = homeDir || process.env.GRAPHYLOOP_HOME || homedir()
  const cliPath = resolveCliPath(home)
  const projectRoot = process.env.GRAPHYLOOP_PROJECT_ROOT || process.cwd()
  // GRAPHYLOOP_CLI pins the server to a specific engine build (the tests use it),
  // so honour it by staying on the spawn path rather than silently running a
  // different engine in-process.
  const pinnedCli = Boolean(process.env.GRAPHYLOOP_CLI)
  const ctx = {
    stdin,
    stdout,
    homeDir: home,
    cliPath,
    cliExists: existsSync(cliPath),
    projectRoot,
    blockedRoot: isBlockedRoot(projectRoot, home),
    initialized: false,
    engine: null,
    env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: projectRoot },
  }
  if (!pinnedCli) {
    try {
      ctx.engine = createEngine({ projectRoot })
    } catch {
      ctx.engine = null // fall back to spawning the CLI
    }
  }
  const rl = createInterface({ input: stdin, crlfDelay: Infinity })
  rl.on('line', (line) => {
    try {
      handleLine(line, ctx)
    } catch (e) {
      send(ctx, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: e instanceof Error ? e.message : String(e) },
      })
    }
  })
  rl.on('close', () => process.exit(0)) // stdin EOF → exit
  return rl
}

/** Default entry: run over process stdio. */
export default function main() {
  runMcpServer({ stdin: process.stdin, stdout: process.stdout })
}

// Allow `node lib/mcp.mjs` to work directly as well.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
}
