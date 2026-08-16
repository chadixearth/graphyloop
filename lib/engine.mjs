/**
 * GraphyLoop engine — swarm coordination + persistent memory over a single
 * JSON state file. Zero dependencies, Node >= 20.
 *
 * Every consumer shares this module rather than reimplementing the rules:
 *   adapter/cli.mjs   thin CLI wrapper (argv in, JSON on stdout)
 *   lib/mcp.mjs       MCP server, in-process (no child process per tool call)
 *
 * Its location is deliberate. Installed, the tree is
 *   ~/.graphyloop/lib/engine.mjs
 *   ~/.graphyloop/lib/mcp.mjs        -> ./engine.mjs
 *   ~/.graphyloop/graphyloop/cli.mjs -> ../lib/engine.mjs
 * which is the same relative shape as the repo, so both entry points resolve
 * the engine with one import specifier and no path juggling.
 *
 * Every method returns a plain object: { ok: true, ... } or { error: '...' }.
 * Nothing here prints, exits, or reads argv.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync, rmdirSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createSecrets, PROVIDER_NAMES } from './secrets.mjs';
import { detectStack, preflight as runPreflight } from './stack.mjs';
import { planFeature as buildPlan } from './planner.mjs';

export const STATE_FILE = '.graphyloop/state.json';
// Pre-0.1.2 location. graphyloop drives four harnesses, so parking state under
// a `.opencode` directory was wrong for three of them; existing files migrate
// on first load.
export const LEGACY_STATE_FILE = '.opencode/graphyloop/state.json';

export const DEFAULT_CAPS = {
  coder: ['code', 'debug', 'implement', 'refactor'],
  tester: ['test', 'validate', 'e2e', 'coverage'],
  reviewer: ['review', 'analyze', 'audit'],
  architect: ['design', 'plan', 'architecture'],
  explorer: ['explore', 'search', 'map', 'analyze'],
  security: ['audit', 'scan', 'harden', 'review'],
  coordinator: ['coordinate', 'route', 'manage', 'orchestrate'],
  frontend: ['ui', 'layout', 'component', 'style'],
  data: ['schema', 'migration', 'query', 'seed'],
};

export const AGENT_TYPES = Object.keys(DEFAULT_CAPS);

export const MEMORY_TYPES = ['decision', 'pattern', 'lesson', 'event', 'task'];

// Re-exported so adapter/cli.mjs keeps resolving everything through one module.
export const SECRET_PROVIDERS = PROVIDER_NAMES;

// Skills graphyloop ships and installs itself (lib/install-skills.mjs). Since
// 0.3.0 the bundle is the full personal library (65 skills). Resolved at module
// load: the repo tree answers from its skills/ directory; the installed core
// (~/.graphyloop) has no skills/ dir, so STATIC_GRAPHYLOOP_SKILLS is the
// fallback there. Keep the static list in sync with skills/ when shipping.
const REPO_SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills');
export const STATIC_GRAPHYLOOP_SKILLS = [
  'ai-video-prompt-engineer',
  'api-contract-design',
  'api-hardening',
  'brainstorming',
  'cavecrew',
  'caveman',
  'caveman-commit',
  'caveman-compress',
  'caveman-help',
  'caveman-review',
  'council',
  'database-migrations',
  'deep-research',
  'dependency-audit',
  'deployment-patterns',
  'e2e-testing',
  'error-handling',
  'exa-search',
  'finishing-a-development-branch',
  'frontend-security',
  'github-ops',
  'graphify',
  'graphyloop-waves',
  'gsap-core',
  'gsap-frameworks',
  'gsap-performance',
  'gsap-plugins',
  'gsap-react',
  'gsap-scrolltrigger',
  'gsap-timeline',
  'gsap-utils',
  'high-end-visual-design',
  'image-to-code',
  'last30days',
  'lifewood-branding',
  'minimalist-ui',
  'postgres-patterns',
  'ppt-master-branding',
  'prisma-patterns',
  'receiving-code-review',
  'redesign-existing-projects',
  'remotion-video-creation',
  'requesting-code-review',
  'search-first',
  'secrets-hygiene',
  'security-review',
  'security-scan',
  'short-video-production',
  'story-engineering',
  'supabase-setup',
  'swarm-memory',
  'systematic-debugging',
  'tdd-workflow',
  'terminal-ops',
  'threejs-animation',
  'threejs-fundamentals',
  'threejs-geometry',
  'threejs-interaction',
  'threejs-lighting',
  'threejs-loaders',
  'threejs-materials',
  'threejs-postprocessing',
  'threejs-shaders',
  'threejs-textures',
  'using-git-worktrees',
  'vercel-deploy',
  'verification-before-completion',
  'video-ai-automation',
  'web-accessibility',
  'web-performance',
  'writing-plans',
];
export const GRAPHYLOOP_SKILLS = existsSync(REPO_SKILLS_DIR)
  ? readdirSync(REPO_SKILLS_DIR)
      .filter((n) => existsSync(resolve(REPO_SKILLS_DIR, n, 'SKILL.md')))
      .sort()
  : STATIC_GRAPHYLOOP_SKILLS;

// Skills the squad's agent files route on but the bundle does not ship — they
// come from the user's own collections. Reported as missing so an agent can
// say so in one line instead of pretending to have loaded one.
//
// This list must stay in sync with the `Primary:` / `Supporting:` lines of
// agents/*.md — test/skills.test.mjs fails the build when an agent routes on a
// name that is neither bundled nor listed here, because a silent gap is exactly
// what makes skills_status report "missing: []" while a subagent is told to load
// something that exists nowhere.
export const REFERENCED_SKILLS = [
  'ai-regression-testing',
  'api-connector-builder',
  'benchmark-optimization-loop',
  'design-taste-frontend',
  'hyperframes',
  'remotion-to-hyperframes',
];

const AGENT_TO_OPENCODE = {
  coder: 'chadi-backend', tester: 'chadi-test', reviewer: 'chadi-reviewer',
  architect: 'chadi-architect', explorer: 'chadi-explorer', security: 'chadi-security',
  coordinator: 'general', frontend: 'chadi-frontend', data: 'chadi-data',
};

const LOCK_STALE_MS = 30000;
const DAY_MS = 86400000;

function freshState() {
  return {
    initialized: false, topology: 'hierarchical', maxAgents: 8,
    agents: [], memories: [], tasksCompleted: 0, tasksFailed: 0, taskQueue: [],
  };
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const MAX_WAVE = 99;

/**
 * Split pending work into what can run now and what is still waiting.
 *
 * A task is ready when every id in its dependsOn is a completed task in the
 * queue. An id that does not exist counts as unsatisfied on purpose: silently
 * treating a typo'd dependency as "nothing to wait for" would dispatch a wave-2
 * integration task before its builders had run, which is the exact failure
 * dependency tracking exists to prevent.
 */
export function taskReadiness(queue) {
  const tasks = Array.isArray(queue) ? queue : [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ready = [];
  const blocked = [];
  for (const t of tasks) {
    if (t.status !== 'pending') continue;
    const deps = Array.isArray(t.dependsOn) ? t.dependsOn : [];
    const waitingOn = [];
    const unknown = [];
    for (const dep of deps) {
      const found = byId.get(dep);
      if (!found) { unknown.push(dep); waitingOn.push(dep); continue; }
      if (found.status !== 'completed') waitingOn.push(dep);
    }
    if (waitingOn.length === 0) ready.push(t);
    else blocked.push({ taskId: t.id, wave: t.wave ?? 0, waitingOn, unknownDeps: unknown });
  }
  const byWave = {};
  for (const t of tasks) {
    const w = String(t.wave ?? 0);
    byWave[w] = byWave[w] || { total: 0, pending: 0, completed: 0, failed: 0 };
    byWave[w].total++;
    if (t.status === 'pending') byWave[w].pending++;
    else if (t.status === 'completed') byWave[w].completed++;
    else if (t.status === 'failed') byWave[w].failed++;
  }
  return { ready, blocked, byWave };
}

/**
 * @param {object} [opts]
 * @param {string} [opts.projectRoot]   defaults to GRAPHYLOOP_PROJECT_ROOT or cwd
 * @param {number} [opts.maxMemories]   memory log cap (oldest dropped first)
 * @param {number} [opts.maxTasks]      task queue cap (only settled tasks dropped)
 * @param {number} [opts.lockTimeoutMs] how long a write waits for the lock
 */
export function createEngine(opts = {}) {
  const projectRoot = opts.projectRoot || process.env.GRAPHYLOOP_PROJECT_ROOT || process.cwd();
  const maxMemories = Math.max(1, Number(opts.maxMemories ?? process.env.GRAPHYLOOP_MAX_MEMORIES) || 2000);
  const maxTasks = Math.max(1, Number(opts.maxTasks ?? process.env.GRAPHYLOOP_MAX_TASKS) || 500);
  const lockTimeoutMs = Math.max(100, Number(opts.lockTimeoutMs ?? process.env.GRAPHYLOOP_LOCK_TIMEOUT_MS) || 10000);

  const statePath = resolve(projectRoot, STATE_FILE);
  const legacyPath = resolve(projectRoot, LEGACY_STATE_FILE);
  const lockPath = `${statePath}.lock`;

  // Move a pre-0.1.2 state file. Renaming rather than copying avoids a split
  // brain where the two files drift apart.
  function migrateLegacyState() {
    if (existsSync(statePath) || !existsSync(legacyPath)) return false;
    mkdirSync(dirname(statePath), { recursive: true });
    try {
      renameSync(legacyPath, statePath);
    } catch {
      // Rename can fail across mount boundaries; fall back to copy + unlink.
      try {
        writeFileSync(statePath, readFileSync(legacyPath));
        unlinkSync(legacyPath);
      } catch {
        return false;
      }
    }
    return true;
  }

  function loadState() {
    migrateLegacyState();
    if (!existsSync(statePath)) return freshState();
    try {
      const parsed = JSON.parse(readFileSync(statePath, 'utf-8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('state is not an object');
      // Spread over the defaults so a state file written by an older version
      // (or missing a key) cannot crash a command that iterates it.
      return { ...freshState(), ...parsed };
    } catch {
      // A truncated or hand-edited state file would otherwise brick every later
      // command. Keep it for forensics and continue from a fresh state.
      try { renameSync(statePath, `${statePath}.corrupt-${stamp()}`); } catch { /* best effort */ }
      return freshState();
    }
  }

  function saveState(s) {
    mkdirSync(dirname(statePath), { recursive: true });
    if (Array.isArray(s.memories) && s.memories.length > maxMemories) {
      s.memories = s.memories.slice(-maxMemories);
    }
    // Unfinished work is never dropped; only the oldest settled tasks are, so
    // pendingTasks and load balancing stay correct at any history length.
    if (Array.isArray(s.taskQueue) && s.taskQueue.length > maxTasks) {
      const isOpen = (t) => t.status === 'pending' || t.status === 'in-progress';
      const open = s.taskQueue.filter(isOpen);
      const settled = s.taskQueue.filter((t) => !isOpen(t));
      const keep = new Set([...open, ...settled.slice(-Math.max(0, maxTasks - open.length))]);
      s.taskQueue = s.taskQueue.filter((t) => keep.has(t));
    }
    // tmp + rename: parallel swarm agents share this file, and a crash mid-write
    // must never leave an unparsable state behind.
    const tmp = `${statePath}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(s, null, 2));
    renameSync(tmp, statePath);
  }

  // mkdir is atomic on every platform, which makes it a dependency-free mutex.
  // Without it two concurrent writers silently drop one of the two updates.
  function acquireLock() {
    mkdirSync(dirname(lockPath), { recursive: true });
    const deadline = Date.now() + lockTimeoutMs;
    for (;;) {
      try {
        mkdirSync(lockPath);
        return lockPath;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        try {
          if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
            rmdirSync(lockPath);
            continue;
          }
        } catch { continue; /* vanished between stat and rmdir — retry */ }
        if (Date.now() >= deadline) return null;
        sleepSync(20);
      }
    }
  }

  function releaseLock(lock) {
    if (!lock) return;
    try { rmdirSync(lock); } catch { /* already gone */ }
  }

  // Serialises a read-modify-write against every other process on this file.
  function withLock(fn) {
    const lock = acquireLock();
    if (!lock) {
      return { error: `timed out after ${lockTimeoutMs}ms waiting for the graphyloop state lock (${lockPath}); a stale lock is cleared automatically after ${LOCK_STALE_MS}ms` };
    }
    try {
      return fn();
    } finally {
      releaseLock(lock);
    }
  }

  const memoryId = () => `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  return {
    projectRoot,
    stateFile: statePath,

    init() {
      return withLock(() => {
        const s = loadState();
        if (s.initialized) return { ok: true, message: 'already initialized', agents: s.agents.length };
        s.initialized = true;
        s.topology = 'hierarchical';
        s.maxAgents = 8;
        s.agents = [{
          id: 'swarm-leader', type: 'coordinator', status: 'active',
          capabilities: ['coordinate', 'route', 'orchestrate'], role: 'leader',
          tasksCompleted: 0, tasksFailed: 0, successRate: 1.0, health: 'healthy',
          createdAt: Date.now(), lastActive: Date.now(),
        }];
        // Append, never replace: re-initializing after a shutdown used to wipe
        // the memory log, destroying the very thing it exists to preserve.
        if (!Array.isArray(s.memories)) s.memories = [];
        s.memories.push({
          id: `evt-${Date.now()}`, agentId: 'system',
          content: 'GraphyLoop adapter initialized', type: 'event',
          timestamp: Date.now(),
          metadata: { eventType: 'init', topology: 'hierarchical', maxAgents: 8 },
        });
        saveState(s);
        return { ok: true, agents: 1, topology: 'hierarchical', memories: s.memories.length };
      });
    },

    status() {
      const s = loadState();
      if (!s.initialized) return { initialized: false, stateFile: statePath };
      // Wave view: after a wave-1 task is recorded, the caller needs to know
      // what that unblocked without re-deriving the DAG itself.
      const { ready, blocked, byWave } = taskReadiness(s.taskQueue);
      return {
        initialized: true, topology: s.topology, stateFile: statePath,
        agents: s.agents.length,
        activeAgents: s.agents.filter((a) => a.status === 'active').length,
        tasksCompleted: s.tasksCompleted, tasksFailed: s.tasksFailed,
        memories: s.memories.length,
        pendingTasks: s.taskQueue.filter((t) => t.status === 'pending').length,
        readyTasks: ready.length,
        blockedTasks: blocked.length,
        nextReady: ready.slice(0, 10).map((t) => ({ id: t.id, wave: t.wave ?? 0, assignedTo: t.assignedTo })),
        blocked: blocked.slice(0, 10),
        waves: byWave,
        agentsList: s.agents.map((a) => ({ id: a.id, type: a.type, status: a.status, role: a.role, health: a.health })),
      };
    },

    spawn({ type, id, capabilities, role } = {}) {
      return withLock(() => {
        const s = loadState();
        if (!s.initialized) return { error: 'not initialized — run init first' };
        if (!AGENT_TYPES.includes(type)) {
          return { error: `unknown agent type "${type}" (expected one of: ${AGENT_TYPES.join(', ')})` };
        }
        if (id && s.agents.some((a) => a.id === id)) return { error: `agent id "${id}" already exists` };
        if (s.agents.length >= s.maxAgents) return { error: `max agents (${s.maxAgents}) reached` };

        const caps = capabilities ? String(capabilities).split(',') : (DEFAULT_CAPS[type] || []);
        const agent = {
          id: id || `${type}-${Date.now()}`,
          type, status: 'active', capabilities: caps,
          role: role || (s.topology === 'hierarchical' ? 'worker' : 'peer'),
          tasksCompleted: 0, tasksFailed: 0, successRate: 1.0, health: 'healthy',
          createdAt: Date.now(), lastActive: Date.now(),
        };
        s.agents.push(agent);
        s.memories.push({
          id: `evt-${Date.now()}`, agentId: 'system',
          content: `Agent ${agent.id} spawned (type: ${type})`, type: 'event',
          timestamp: Date.now(),
          metadata: { eventType: 'agent-spawn', agentId: agent.id, type },
        });
        saveState(s);
        return { ok: true, agent };
      });
    },

    distribute({ tasks } = {}) {
      return withLock(() => {
        const s = loadState();
        if (!s.initialized) return { error: 'not initialized' };
        if (!Array.isArray(tasks)) return { error: 'tasks must be a JSON array' };
        const bad = tasks.findIndex((t) => !t || typeof t !== 'object' || !t.id);
        if (bad >= 0) return { error: `task at index ${bad} is missing an "id"` };
        for (const t of tasks) {
          if (t.wave !== undefined && t.wave !== null
              && (!Number.isInteger(Number(t.wave)) || Number(t.wave) < 0 || Number(t.wave) > MAX_WAVE)) {
            return { error: `task "${t.id}" has an invalid wave (expected an integer 0-${MAX_WAVE})` };
          }
          if (t.dependsOn !== undefined && t.dependsOn !== null && !Array.isArray(t.dependsOn)) {
            return { error: `task "${t.id}" has an invalid dependsOn (expected an array of task ids)` };
          }
          if (Array.isArray(t.dependsOn) && t.dependsOn.some((d) => typeof d !== 'string' || !d.trim())) {
            return { error: `task "${t.id}" has a non-string id in dependsOn` };
          }
          if (Array.isArray(t.dependsOn) && t.dependsOn.includes(t.id)) {
            return { error: `task "${t.id}" depends on itself` };
          }
        }

        const activeAgents = s.agents.filter((a) => a.status === 'active');
        if (activeAgents.length === 0) return { error: 'no active agents' };

        const agentLoads = new Map();
        for (const a of activeAgents) {
          agentLoads.set(a.id, s.taskQueue.filter((t) => t.assignedTo === a.id && t.status === 'in-progress').length);
        }

        const assignments = [];
        for (const task of tasks) {
          // Capability match: the task type matches a capability or the agent type.
          const capable = activeAgents.filter((a) => (a.capabilities || []).includes(task.type) || a.type === task.type);
          const pool = capable.length > 0 ? capable : activeAgents;
          const best = pool.sort((a, b) => (agentLoads.get(a.id) || 0) - (agentLoads.get(b.id) || 0))[0];

          agentLoads.set(best.id, (agentLoads.get(best.id) || 0) + 1);
          const wave = task.wave === undefined || task.wave === null ? 0 : Number(task.wave);
          const dependsOn = Array.isArray(task.dependsOn) ? task.dependsOn : [];
          s.taskQueue.push({ ...task, wave, dependsOn, status: 'pending', assignedTo: best.id });

          const owns = Array.isArray(task.owns) ? task.owns : [];
          assignments.push({
            taskId: task.id,
            agentId: best.id,
            wave,
            dependsOn,
            opencodeAgentType: task.agent || AGENT_TO_OPENCODE[best.type] || 'general',
            prompt: [
              `[Swarm Task: ${task.id}]  wave ${wave}`,
              `Agent: ${best.id} (${best.type})`,
              `Priority: ${task.priority}`,
              `Task: ${task.description}`,
              // Exclusive ownership and a named acceptance check are what keep a
              // parallel wave from turning into two agents editing one file and
              // neither proving the result.
              owns.length ? `Files you own EXCLUSIVELY (touch nothing else): ${owns.join(', ')}` : '',
              task.acceptance ? `Acceptance check: ${task.acceptance}` : '',
              dependsOn.length ? `Depends on: ${dependsOn.join(', ')} (their output is your input — do not re-do their work)` : '',
              task.gate ? `GATE before acting: ${task.gate}` : '',
              '',
              `Execute as a ${best.type}. Return results with file paths.`,
            ].filter(Boolean).join('\n'),
          });
        }

        const { ready, blocked, byWave } = taskReadiness(s.taskQueue);
        const readyIds = new Set(ready.map((t) => t.id));
        for (const a of assignments) a.ready = readyIds.has(a.taskId);

        saveState(s);
        return {
          ok: true,
          assignments,
          waves: byWave,
          // dispatchNow is the whole point of wave support: hand the caller the
          // subset it may fan out immediately instead of the full list.
          dispatchNow: assignments.filter((a) => a.ready).map((a) => a.taskId),
          blocked: blocked.filter((b) => tasks.some((t) => t.id === b.taskId)),
        };
      });
    },

    record({ taskId, status, agentId } = {}) {
      return withLock(() => {
        const s = loadState();
        if (!s.initialized) return { error: 'not initialized' };

        const task = s.taskQueue.find((t) => t.id === taskId);
        const agent = s.agents.find((a) => a.id === (agentId || (task && task.assignedTo)));

        if (task) task.status = status;
        if (agent) {
          agent.status = 'active';
          agent.lastActive = Date.now();
          if (status === 'completed') { agent.tasksCompleted++; s.tasksCompleted++; }
          else { agent.tasksFailed++; s.tasksFailed++; }
          const total = agent.tasksCompleted + agent.tasksFailed;
          agent.successRate = total > 0 ? agent.tasksCompleted / total : 1.0;
          agent.health = agent.successRate < 0.5 ? 'unhealthy' : agent.successRate < 0.8 ? 'degraded' : 'healthy';
        }

        saveState(s);
        // What this result unblocked. Without it the caller has to re-derive the
        // DAG after every record just to find out whether the next wave may go.
        const { ready } = taskReadiness(s.taskQueue);
        const unblocked = ready
          .filter((t) => Array.isArray(t.dependsOn) && t.dependsOn.includes(taskId))
          .map((t) => ({ id: t.id, wave: t.wave ?? 0, assignedTo: t.assignedTo }));
        // taskFound/agentFound: a typo'd id used to look identical to a real
        // record, silently dropping the metrics update.
        return {
          ok: true, taskId, status,
          agentId: agent ? agent.id : undefined,
          taskFound: !!task, agentFound: !!agent,
          unblocked,
          readyTasks: ready.length,
        };
      });
    },

    memoryStore({ agent, content, type, metadata } = {}) {
      return withLock(() => {
        const s = loadState();
        if (!s.initialized) return { error: 'not initialized' };
        if (!content || !String(content).trim()) return { error: 'need --content' };

        let meta = metadata;
        if (typeof meta === 'string' && meta) {
          try { meta = JSON.parse(meta); } catch { meta = undefined; }
        }

        const entry = {
          id: memoryId(),
          agentId: agent || 'system',
          content: String(content),
          type: type || 'event',
          timestamp: Date.now(),
          metadata: meta,
        };
        s.memories.push(entry);
        saveState(s);
        return { ok: true, id: entry.id, totalMemories: s.memories.length };
      });
    },

    /**
     * Keyword search with a recency bias and an optional type filter.
     * Ranking: matched terms, a boost for the whole phrase, and a decay so a
     * fresh lesson outranks a stale one that matched equally well.
     */
    memorySearch({ query, limit, type } = {}) {
      const s = loadState();
      if (!s.initialized) return { error: 'not initialized' };
      // An empty query matches every memory (''.includes is always true), which
      // would dump the whole store into the agent's context.
      if (!query || !String(query).trim()) return { error: 'need --query' };
      if (type && !MEMORY_TYPES.includes(type)) {
        return { error: `unknown memory type "${type}" (expected one of: ${MEMORY_TYPES.join(', ')})` };
      }

      const k = Math.max(1, parseInt(limit, 10) || 10);
      const q = String(query).toLowerCase().trim();
      const terms = q.split(/\s+/).filter(Boolean);
      const now = Date.now();
      const pool = type ? s.memories.filter((m) => m.type === type) : s.memories;

      const scored = pool.map((m) => {
        const text = `${m.content} ${m.metadata ? JSON.stringify(m.metadata) : ''}`.toLowerCase();
        let hits = 0;
        for (const t of terms) if (text.includes(t)) hits++;
        if (hits === 0) return null;
        let score = hits / terms.length;
        if (text.includes(q)) score += 3 / terms.length; // whole-phrase match
        // Recency: full bonus today, ~half after two weeks, never zero.
        const ageDays = Math.max(0, (now - (m.timestamp || 0)) / DAY_MS);
        score *= 1 + 0.5 * Math.exp(-ageDays / 14);
        return { ...m, score: Math.round(score * 1000) / 1000 };
      }).filter(Boolean);

      const results = scored.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp).slice(0, k);
      return { ok: true, total: s.memories.length, searched: pool.length, results };
    },

    /**
     * Delete a memory by id. A store that can only be appended to will repeat a
     * wrong lesson forever; this is the correction path.
     */
    memoryForget({ id } = {}) {
      return withLock(() => {
        const s = loadState();
        if (!s.initialized) return { error: 'not initialized' };
        if (!id || !String(id).trim()) return { error: 'need --id (from memory_search results)' };
        const idx = s.memories.findIndex((m) => m.id === id);
        if (idx < 0) return { error: `no memory with id "${id}"` };
        const [removed] = s.memories.splice(idx, 1);
        saveState(s);
        return { ok: true, removed, totalMemories: s.memories.length };
      });
    },

    shutdown() {
      return withLock(() => {
        const s = loadState();
        s.initialized = false;
        s.agents.forEach((a) => { a.status = 'terminated'; });
        s.memories.push({
          id: `evt-${Date.now()}`, agentId: 'system',
          content: 'GraphyLoop adapter shutdown', type: 'event', timestamp: Date.now(),
        });
        saveState(s);
        return { ok: true, message: 'shutdown complete' };
      });
    },

    // -----------------------------------------------------------------------
    // Planning
    // -----------------------------------------------------------------------

    /**
     * Turn a feature request into a wave plan (see lib/planner.mjs). Pure
     * computation plus one audit memory, so it is safe to call before any agent
     * has been spawned.
     */
    planFeature({ goal, includeDeploy, maxParallel } = {}) {
      let stack = null;
      try { stack = detectStack(projectRoot); } catch { stack = null; }
      const plan = buildPlan({ goal, stack, includeDeploy, maxParallel });
      if (plan.error) return plan;
      plan.stack = stack
        ? {
          framework: stack.frameworkLabel, pkgManager: stack.pkgManager,
          supabase: stack.db.supabase, deployTarget: stack.deploy.target,
          testScript: stack.scripts.test, buildScript: stack.scripts.build,
        }
        : null;
      // Best effort: metrics in Gate 5 are only real if the plan shape was
      // recorded when it was chosen, not remembered afterwards.
      if (plan.tasks.length) {
        try {
          withLock(() => {
            const s = loadState();
            if (!s.initialized) return null;
            s.memories.push({
              id: `evt-${Date.now()}`, agentId: 'system',
              content: `PLAN shape=${plan.shape} lanes=${plan.lanes.join('+')} waves=${plan.waves.length} tasks=${plan.tasks.length} goal="${plan.goal.slice(0, 120)}"`,
              type: 'decision', timestamp: Date.now(),
              metadata: { eventType: 'plan-feature', slug: plan.slug, shape: plan.shape, lanes: plan.lanes },
            });
            saveState(s);
            return null;
          });
        } catch { /* planning must not fail because memory could not be written */ }
      }
      return plan;
    },

    // -----------------------------------------------------------------------
    // Secrets / env / preflight
    //
    // Values never come back out of these methods — status is masked, env_sync
    // moves values file-to-file. See lib/secrets.mjs for the reasoning.
    // -----------------------------------------------------------------------

    secretsStatus({ provider } = {}) {
      return createSecrets({ projectRoot }).status({ provider });
    },

    secretsSet({ key, value, provider } = {}) {
      const secrets = createSecrets({ projectRoot });
      const result = secrets.set({ key, value, provider });
      if (result.error) return result;
      try {
        withLock(() => {
          const s = loadState();
          if (!s.initialized) return null;
          // Key NAME only. Writing the value here would put it in state.json,
          // which is exactly what the store exists to avoid.
          s.memories.push({
            id: `evt-${Date.now()}`, agentId: 'system',
            content: `SECRET ${result.replaced ? 'updated' : 'stored'} ${result.key} (${result.kind}) for ${result.provider || 'unknown provider'}`,
            type: 'event', timestamp: Date.now(),
            metadata: { eventType: 'secret-set', key: result.key, provider: result.provider },
          });
          saveState(s);
          return null;
        });
      } catch { /* audit trail is best effort */ }
      return result;
    },

    secretsForget({ key } = {}) {
      return createSecrets({ projectRoot }).forget({ key });
    },

    envSync({ target, providers, framework, force } = {}) {
      const secrets = createSecrets({ projectRoot });
      let fw = framework;
      if (!fw) {
        try { fw = detectStack(projectRoot).framework; } catch { fw = undefined; }
      }
      return secrets.envSync({ target, providers, framework: fw, force });
    },

    preflight({ target } = {}) {
      return runPreflight({ projectRoot, target });
    },

    stack() {
      try { return { ok: true, ...detectStack(projectRoot) }; } catch (e) {
        return { error: `stack detection failed: ${e instanceof Error ? e.message : String(e)}` };
      }
    },

    /**
     * Which skills are actually installed on this machine.
     *
     * Agents route on skill names, so "is it there?" has to be answerable at
     * runtime — otherwise a subagent either fakes a skill it does not have or
     * skips discipline it does. Reads the harness skill roots directly rather
     * than trusting the installer's report, because a user can add or remove a
     * skill at any time.
     */
    skills() {
      const home = process.env.GRAPHYLOOP_HOME || homedir();
      // dsh discovers skills in <project>/.dsh/skills and <project>/.agents/skills,
      // then $DSH_HOME/skills and $DSH_AGENTS_HOME/skills — so a skill installed
      // for the DeepSeek Harness is reported here instead of looking missing.
      const dshHome = (process.env.DSH_HOME || '').trim() || resolve(home, '.dsh');
      const agentsHome = (process.env.DSH_AGENTS_HOME || '').trim() || resolve(home, '.agents');
      const roots = [
        { harness: 'project', dir: resolve(projectRoot, '.opencode', 'skills') },
        { harness: 'project-dsh', dir: resolve(projectRoot, '.dsh', 'skills') },
        { harness: 'project-agents', dir: resolve(projectRoot, '.agents', 'skills') },
        { harness: 'opencode', dir: resolve(home, '.config', 'opencode', 'skills') },
        { harness: 'claude', dir: resolve(home, '.claude', 'skills') },
        { harness: 'dsh', dir: resolve(dshHome, 'skills') },
        { harness: 'dsh-agents', dir: resolve(agentsHome, 'skills') },
      ];
      const installed = new Set();
      const rootReport = [];
      for (const { harness, dir } of roots) {
        if (!existsSync(dir)) { rootReport.push({ harness, dir, present: false, count: 0 }); continue; }
        let names = [];
        try {
          names = readdirSync(dir).filter((name) => existsSync(resolve(dir, name, 'SKILL.md')));
        } catch { names = []; }
        for (const n of names) installed.add(n);
        rootReport.push({ harness, dir, present: true, count: names.length });
      }
      const missing = (list) => list.filter((n) => !installed.has(n));
      return {
        ok: true,
        roots: rootReport,
        installedCount: installed.size,
        bundled: {
          expected: GRAPHYLOOP_SKILLS,
          installed: GRAPHYLOOP_SKILLS.filter((n) => installed.has(n)),
          missing: missing(GRAPHYLOOP_SKILLS),
        },
        referenced: {
          installed: REFERENCED_SKILLS.filter((n) => installed.has(n)),
          missing: missing(REFERENCED_SKILLS),
        },
        installed: [...installed].sort(),
        note: GRAPHYLOOP_SKILLS.every((n) => installed.has(n))
          ? 'graphyloop skills are installed — load them with the skill tool'
          : 'graphyloop skills are missing from every skill root: run `npx -y graphyloop@latest update`',
      };
    },

    cleanup() {
      return withLock(() => {
        const removed = [];
        for (const [rel, path] of [[STATE_FILE, statePath], [LEGACY_STATE_FILE, legacyPath]]) {
          if (!existsSync(path)) continue;
          try { unlinkSync(path); removed.push(rel); } catch { /* ignore */ }
        }
        return { ok: true, message: 'state file removed', removed };
      });
    },
  };
}
