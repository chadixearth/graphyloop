#!/usr/bin/env node
/**
 * GraphyLoop CLI — bash-callable entry for agent-chadi
 * 
 * Each call loads/saves state from <project>/.graphyloop/state.json
 * so swarm and memory survive across shell invocations.
 * 
 * Commands (all return JSON):
 *   init | status | spawn | distribute | record | memory-store | memory-search | shutdown | cleanup
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync, rmdirSync, statSync } from 'fs'
import { resolve, dirname } from 'path'

// ============================================================================
// State persistence
// ============================================================================

const CONFIG_DIR = '.graphyloop'
const STATE_FILE = `${CONFIG_DIR}/state.json`
// Pre-0.1.2 location. graphyloop drives four harnesses, so parking state under
// a `.opencode` directory was wrong for three of them; existing files are
// migrated on first load.
const LEGACY_STATE_FILE = '.opencode/graphyloop/state.json'
const PROJECT_ROOT = process.env.GRAPHYLOOP_PROJECT_ROOT || process.cwd()

// Memories are append-only and every command rewrites the whole state file, so
// an uncapped log turns each tool call into a growing read + write.
const MAX_MEMORIES = Math.max(1, Number(process.env.GRAPHYLOOP_MAX_MEMORIES) || 2000)

const DEFAULT_CAPS = {
  coder: ['code', 'debug', 'implement', 'refactor'],
  tester: ['test', 'validate', 'e2e', 'coverage'],
  reviewer: ['review', 'analyze', 'audit'],
  architect: ['design', 'plan', 'architecture'],
  explorer: ['explore', 'search', 'map', 'analyze'],
  security: ['audit', 'scan', 'harden', 'review'],
  coordinator: ['coordinate', 'route', 'manage', 'orchestrate'],
  frontend: ['ui', 'layout', 'component', 'style'],
  data: ['schema', 'migration', 'query', 'seed'],
}

const AGENT_TYPES = Object.keys(DEFAULT_CAPS)

const AGENT_TO_OPENCODE = {
  coder: 'chadi-backend', tester: 'chadi-test', reviewer: 'chadi-reviewer',
  architect: 'chadi-architect', explorer: 'chadi-explorer', security: 'chadi-security',
  coordinator: 'general', frontend: 'chadi-frontend', data: 'chadi-data',
}

// System prompts for direct DeepSeek API calls (bypasses OpenCode harness).
const AGENT_SYSTEM_PROMPTS = {
  coder: 'You are a senior software engineer. Implement code precisely, verify assumptions, and return file paths with your results.',
  tester: 'You are a senior QA engineer. Design tests, run them, and report pass/fail with evidence.',
  reviewer: 'You are a strict code reviewer. Report findings as path:line: severity: problem. Fix.',
  security: 'You are a security auditor. Check auth, input validation, secrets, and injection risks. Report findings with severity.',
  architect: 'You are a software architect. Design solutions with tradeoffs and rollback plans.',
  explorer: 'You are a codebase explorer. Locate definitions, callers, and call paths; return file:line references.',
  coordinator: 'You are a task coordinator. Plan and sequence work; return a concise plan.',
  frontend: 'You are a frontend engineer. Build UI with clean layout and accessibility.',
  data: 'You are a database engineer. Design schemas, migrations, and queries with indexes.',
}

function freshState() {
  return {
    initialized: false, topology: 'hierarchical', maxAgents: 8,
    agents: [], memories: [], tasksCompleted: 0, tasksFailed: 0, taskQueue: [],
  }
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

// Move a pre-0.1.2 state file to the new location. Renaming rather than copying
// avoids a split brain where the two files drift apart.
function migrateLegacyState() {
  const target = resolve(PROJECT_ROOT, STATE_FILE)
  const legacy = resolve(PROJECT_ROOT, LEGACY_STATE_FILE)
  if (existsSync(target) || !existsSync(legacy)) return false
  mkdirSync(dirname(target), { recursive: true })
  try {
    renameSync(legacy, target)
  } catch {
    // Rename can fail across mount boundaries; fall back to copy + unlink.
    try {
      writeFileSync(target, readFileSync(legacy))
      unlinkSync(legacy)
    } catch {
      return false
    }
  }
  return true
}

function loadState() {
  migrateLegacyState()
  const path = resolve(PROJECT_ROOT, STATE_FILE)
  if (!existsSync(path)) return freshState()
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('state is not an object')
    // Spread over the defaults so a state file written by an older version (or
    // missing a key) cannot crash a command that iterates it.
    return { ...freshState(), ...parsed }
  } catch {
    // A truncated or hand-edited state file would otherwise brick every later
    // command. Keep it for forensics and continue from a fresh state.
    try { renameSync(path, `${path}.corrupt-${stamp()}`) } catch { /* best effort */ }
    return freshState()
  }
}

function saveState(s) {
  const path = resolve(PROJECT_ROOT, STATE_FILE)
  mkdirSync(dirname(path), { recursive: true })
  if (Array.isArray(s.memories) && s.memories.length > MAX_MEMORIES) {
    s.memories = s.memories.slice(-MAX_MEMORIES)
  }
  // tmp + rename: parallel swarm agents share this file, and a crash mid-write
  // must never leave an unparsable state behind.
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(s, null, 2))
  renameSync(tmp, path)
}

// ============================================================================
// Write lock
//
// A swarm runs agents in parallel and every command is load → mutate → save, so
// two concurrent writers would silently drop one of the two updates. mkdir is
// atomic on every platform, which makes it a dependency-free mutex.
// ============================================================================

const LOCK_DIR = `${STATE_FILE}.lock`
const LOCK_TIMEOUT_MS = Math.max(100, Number(process.env.GRAPHYLOOP_LOCK_TIMEOUT_MS) || 10000)
const LOCK_STALE_MS = 30000

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function acquireLock() {
  const lock = resolve(PROJECT_ROOT, LOCK_DIR)
  mkdirSync(dirname(lock), { recursive: true })
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  for (;;) {
    try {
      mkdirSync(lock)
      return lock
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      // Break a lock orphaned by a killed process.
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
          rmdirSync(lock)
          continue
        }
      } catch { continue /* vanished between stat and rmdir — retry */ }
      if (Date.now() >= deadline) return null
      sleepSync(20)
    }
  }
}

function releaseLock(lock) {
  if (!lock) return
  try { rmdirSync(lock) } catch { /* already gone */ }
}

function output(obj) { console.log(JSON.stringify(obj)) }

function defaultCaps(type) { return DEFAULT_CAPS[type] || [] }

// ============================================================================
// Commands
// ============================================================================

function cmdInit() {
  let s = loadState()
  if (s.initialized) {
    output({ ok: true, message: 'already initialized', agents: s.agents.length })
    return
  }
  s.initialized = true
  s.topology = 'hierarchical'
  s.maxAgents = 8
  s.agents = [{
    id: 'swarm-leader', type: 'coordinator', status: 'active',
    capabilities: ['coordinate', 'route', 'orchestrate'], role: 'leader',
    tasksCompleted: 0, tasksFailed: 0, successRate: 1.0, health: 'healthy',
    createdAt: Date.now(), lastActive: Date.now(),
  }]
  // Append, never replace: re-initializing after a shutdown used to overwrite
  // the whole memory log, silently destroying every stored decision/lesson —
  // the exact thing the store exists to survive.
  if (!Array.isArray(s.memories)) s.memories = []
  s.memories.push({
    id: `evt-${Date.now()}`, agentId: 'system',
    content: 'GraphyLoop adapter initialized', type: 'event',
    timestamp: Date.now(),
    metadata: { eventType: 'init', topology: 'hierarchical', maxAgents: 8 },
  })
  saveState(s)
  output({ ok: true, agents: 1, topology: 'hierarchical', memories: s.memories.length })
}

function cmdStatus() {
  const s = loadState()
  const stateFile = resolve(PROJECT_ROOT, STATE_FILE)
  if (!s.initialized) { output({ initialized: false, stateFile }); return }
  output({
    initialized: true, topology: s.topology, stateFile,
    agents: s.agents.length,
    activeAgents: s.agents.filter(a => a.status === 'active').length,
    tasksCompleted: s.tasksCompleted, tasksFailed: s.tasksFailed,
    memories: s.memories.length,
    pendingTasks: s.taskQueue.filter(t => t.status === 'pending').length,
    agentsList: s.agents.map(a => ({ id: a.id, type: a.type, status: a.status, role: a.role, health: a.health })),
  })
}

function cmdSpawn(type, id, capabilities, role) {
  const s = loadState()
  if (!s.initialized) { output({ error: 'not initialized — run init first' }); return }
  if (!AGENT_TYPES.includes(type)) {
    output({ error: `unknown agent type "${type}" (expected one of: ${AGENT_TYPES.join(', ')})` })
    return
  }
  if (id && s.agents.some(a => a.id === id)) { output({ error: `agent id "${id}" already exists` }); return }
  if (s.agents.length >= s.maxAgents) { output({ error: `max agents (${s.maxAgents}) reached` }); return }

  const caps = capabilities ? capabilities.split(',') : defaultCaps(type)
  const agent = {
    id: id || `${type}-${Date.now()}`,
    type, status: 'active', capabilities: caps,
    role: role || (s.topology === 'hierarchical' ? 'worker' : 'peer'),
    tasksCompleted: 0, tasksFailed: 0, successRate: 1.0, health: 'healthy',
    createdAt: Date.now(), lastActive: Date.now(),
  }
  s.agents.push(agent)
  s.memories.push({
    id: `evt-${Date.now()}`, agentId: 'system',
    content: `Agent ${agent.id} spawned (type: ${type})`, type: 'event',
    timestamp: Date.now(),
    metadata: { eventType: 'agent-spawn', agentId: agent.id, type },
  })
  saveState(s)
  output({ ok: true, agent })
}

function cmdDistribute(tasksJson, filePath) {
  const s = loadState()
  if (!s.initialized) { output({ error: 'not initialized' }); return }
  
  let tasks
  if (filePath) {
    try { tasks = JSON.parse(readFileSync(filePath, 'utf-8')) } 
    catch { output({ error: `invalid JSON file: ${filePath}` }); return }
  } else if (tasksJson) {
    try { tasks = JSON.parse(tasksJson) } 
    catch { output({ error: 'invalid tasks JSON' }); return }
  } else {
    output({ error: 'need --tasks or --file' }); return
  }

  if (!Array.isArray(tasks)) { output({ error: 'tasks must be a JSON array' }); return }
  const bad = tasks.findIndex(t => !t || typeof t !== 'object' || !t.id)
  if (bad >= 0) { output({ error: `task at index ${bad} is missing an "id"` }); return }

  const activeAgents = s.agents.filter(a => a.status === 'active')
  if (activeAgents.length === 0) { output({ error: 'no active agents' }); return }
  
  const agentLoads = new Map()
  for (const a of activeAgents) {
    agentLoads.set(a.id, s.taskQueue.filter(t => t.assignedTo === a.id && t.status === 'in-progress').length)
  }
  
  const assignments = []
  
  for (const task of tasks) {
    // Capability match: task type should match agent capability OR agent type
    const capable = activeAgents.filter(a => {
      const aCaps = a.capabilities || []
      // Direct match: agent has this capability (e.g., task type "code" → agent with "code" cap)
      if (aCaps.includes(task.type)) return true
      // Type match: agent type matches task type (e.g., task "code" → coder agent)
      if (a.type === task.type) return true
      return false
    })
    const pool = capable.length > 0 ? capable : activeAgents
    const best = pool.sort((a, b) => (agentLoads.get(a.id) || 0) - (agentLoads.get(b.id) || 0))[0]
    
    agentLoads.set(best.id, (agentLoads.get(best.id) || 0) + 1)
    s.taskQueue.push({ ...task, status: 'pending', assignedTo: best.id })
    
    assignments.push({
      taskId: task.id,
      agentId: best.id,
      opencodeAgentType: AGENT_TO_OPENCODE[best.type] || 'general',
      prompt: [
        `[Swarm Task: ${task.id}]`,
        `Agent: ${best.id} (${best.type})`,
        `Priority: ${task.priority}`,
        `Task: ${task.description}`,
        '',
        `Execute as a ${best.type}. Return results with file paths.`,
      ].join('\n'),
    })
  }
  
  saveState(s)
  output({ ok: true, assignments })
}

function cmdMemoryStore(agentId, content, type, metadataJson) {
  const s = loadState()
  if (!s.initialized) { output({ error: 'not initialized' }); return }
  if (!content || !content.trim()) { output({ error: 'need --content' }); return }

  let metadata
  if (metadataJson) { try { metadata = JSON.parse(metadataJson) } catch { /* ignore */ } }
  
  s.memories.push({
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    agentId: agentId || 'system', content, type: type || 'event',
    timestamp: Date.now(), metadata,
  })
  saveState(s)
  output({ ok: true, totalMemories: s.memories.length })
}

function cmdMemorySearch(query, limit) {
  const s = loadState()
  if (!s.initialized) { output({ error: 'not initialized' }); return }
  // An empty query matches every memory (''.includes is always true), which
  // would dump the whole store into the agent's context.
  if (!query || !query.trim()) { output({ error: 'need --query' }); return }

  const k = parseInt(limit) || 10
  const terms = query.toLowerCase().split(/\s+/)
  
  const scored = s.memories.map(m => {
    const text = (m.content + ' ' + (m.metadata ? JSON.stringify(m.metadata) : '')).toLowerCase()
    let score = 0
    for (const t of terms) if (text.includes(t)) score++
    if (text.includes(query.toLowerCase())) score += 3
    return { ...m, score: score / terms.length }
  })
  
  const results = scored.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, k)
  output({ ok: true, total: s.memories.length, results })
}

function cmdRecordResult(taskId, status, agentId, error) {
  const s = loadState()
  if (!s.initialized) { output({ error: 'not initialized' }); return }
  
  const task = s.taskQueue.find(t => t.id === taskId)
  const agent = s.agents.find(a => a.id === (agentId || (task && task.assignedTo)))
  
  if (task) task.status = status
  if (agent) {
    agent.status = 'active'
    agent.lastActive = Date.now()
    if (status === 'completed') { agent.tasksCompleted++; s.tasksCompleted++ }
    else { agent.tasksFailed++; s.tasksFailed++ }
    const total = agent.tasksCompleted + agent.tasksFailed
    agent.successRate = total > 0 ? agent.tasksCompleted / total : 1.0
    agent.health = agent.successRate < 0.5 ? 'unhealthy' : agent.successRate < 0.8 ? 'degraded' : 'healthy'
  }
  
  saveState(s)
  // taskFound/agentFound: a typo'd id used to look identical to a real record,
  // silently dropping the metrics update.
  output({
    ok: true, taskId, status,
    agentId: agent ? agent.id : undefined,
    taskFound: !!task, agentFound: !!agent,
  })
}

function cmdShutdown() {
  const s = loadState()
  s.initialized = false
  s.agents.forEach(a => { a.status = 'terminated' })
  s.memories.push({
    id: `evt-${Date.now()}`, agentId: 'system',
    content: 'GraphyLoop adapter shutdown', type: 'event', timestamp: Date.now(),
  })
  saveState(s)
  output({ ok: true, message: 'shutdown complete' })
}

function cmdCleanup() {
  const removed = []
  for (const rel of [STATE_FILE, LEGACY_STATE_FILE]) {
    const path = resolve(PROJECT_ROOT, rel)
    if (!existsSync(path)) continue
    try { unlinkSync(path); removed.push(rel) } catch { /* ignore */ }
  }
  output({ ok: true, message: 'state file removed', removed })
}

/**
 * One-shot direct DeepSeek API call — headless, bypasses the OpenCode harness.
 * Requires DEEPSEEK_API_KEY. Model: --model or DEEPSEEK_MODEL, default deepseek-v4-flash.
 */
function cmdAsk(prompt, type, model) {
  if (!prompt) { output({ error: 'need --prompt' }); return }
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) {
    output({ error: 'DEEPSEEK_API_KEY not set. Set it to call DeepSeek directly (bypasses OpenCode), or use OpenCode task subagents for harness-routed LLM work.' })
    return
  }
  const role = type || 'assistant'
  const system = AGENT_SYSTEM_PROMPTS[role] || 'You are a helpful assistant.'
  const modelId = model || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'

  fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.1,
      stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  })
    .then(async (res) => {
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`DeepSeek API ${res.status}: ${errText.slice(0, 300)}`)
      }
      const data = await res.json()
      output({
        ok: true,
        model: data?.model || modelId,
        agent: role,
        content: data?.choices?.[0]?.message?.content,
        usage: data?.usage || undefined,
      })
    })
    .catch((err) => output({ error: err instanceof Error ? err.message : String(err) }))
}

// ============================================================================
// CLI router
// ============================================================================

const args = process.argv.slice(2)
const command = args[0]

// Accepts both `--flag value` and `--flag=value`. A missing value reads as ''
// rather than swallowing the next flag, so `--content --type event` reports a
// missing content instead of storing the literal "--type".
function getArg(name) {
  const flag = `--${name}`
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1)
    if (args[i] === flag) {
      const next = args[i + 1]
      return next === undefined || next.startsWith('--') ? '' : next
    }
  }
  return ''
}

// Commands that read-modify-write the state file. Readers need no lock: writes
// land via an atomic rename, so a reader always sees one complete state.
const MUTATING_COMMANDS = new Set(['init', 'spawn', 'distribute', 'record', 'memory-store', 'shutdown', 'cleanup'])

function dispatch() {
  switch (command) {
    case 'init':      cmdInit(); break
    case 'status':    cmdStatus(); break
    case 'spawn':
      cmdSpawn(getArg('type'), getArg('id'), getArg('capabilities'), getArg('role'))
      break
    case 'distribute':
      cmdDistribute(getArg('tasks'), getArg('file'))
      break
    case 'record':
      cmdRecordResult(getArg('taskId'), getArg('status'), getArg('agentId'), getArg('error'))
      break
    case 'memory-store':
      cmdMemoryStore(getArg('agent'), getArg('content'), getArg('type'), getArg('metadata'))
      break
    case 'memory-search':
      cmdMemorySearch(getArg('query'), getArg('limit'))
      break
    case 'shutdown':  cmdShutdown(); break
    case 'cleanup':   cmdCleanup(); break
    case 'ask':       cmdAsk(getArg('prompt'), getArg('type'), getArg('model')); break
    default: {
      const cli = 'node ~/.graphyloop/graphyloop/cli.mjs'
      output({
        error: 'unknown command',
        usage: {
          init: `${cli} init`,
          status: `${cli} status`,
          spawn: `${cli} spawn --type coder --id my-agent`,
          distribute: `${cli} distribute --tasks '[json]'`,
          record: `${cli} record --taskId t1 --status completed`,
          ask: `${cli} ask --prompt "summarize" --type coder --model deepseek-v4-flash|deepseek-v4-pro`,
          'memory-store': `${cli} memory-store --agent sys --content "text" --type event`,
          'memory-search': `${cli} memory-search --query "text" --limit 10`,
          shutdown: `${cli} shutdown`,
        },
        agentTypes: AGENT_TYPES,
      })
    }
  }
}

try {
  if (!MUTATING_COMMANDS.has(command)) {
    dispatch()
  } else {
    const lock = acquireLock()
    if (!lock) {
      output({ error: `timed out after ${LOCK_TIMEOUT_MS}ms waiting for the graphyloop state lock (${LOCK_DIR}); a stale lock is cleared automatically after ${LOCK_STALE_MS}ms` })
    } else {
      try { dispatch() } finally { releaseLock(lock) }
    }
  }
} catch (e) {
  output({ error: e instanceof Error ? e.message : String(e) })
}
