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
    name: 'shutdown',
    description: 'Shut down the swarm (terminates agents, keeps memory) and exit the MCP server.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
]

// Tool name → CLI command + flags passed through to the graphyloop CLI.
const TOOL_SPECS = {
  agent_spawn: { cli: 'spawn', flags: ['type', 'id', 'capabilities', 'role'] },
  agent_list: { cli: 'status', flags: [] },
  task_distribute: { cli: 'distribute', flags: ['tasks'] },
  swarm_state: { cli: 'status', flags: [] },
  task_record: { cli: 'record', flags: ['taskId', 'status', 'agentId', 'error'] },
  memory_store: { cli: 'memory-store', flags: ['agent', 'content', 'type', 'metadata'] },
  memory_search: { cli: 'memory-search', flags: ['query', 'limit', 'type'] },
  memory_forget: { cli: 'memory-forget', flags: ['id'] },
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
    else if (flag === 'limit' && typeof v === 'number') str = String(v)
    else str = String(v)
    out.push(`--${flag}`, str)
  }
  return out
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
  return spawnCli(ctx.cliPath, spec.cli, buildArgs(spec, input), ctx.env)
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
