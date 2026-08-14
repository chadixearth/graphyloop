// GraphyLoop swarm + memory plugin for OpenCode.
//
// Gives agent-chadi (and any agent) direct tools to drive the graphyloop
// meta-harness CLI (swarm coordination + persistent memory) without
// remembering shell commands. Also auto-initializes the swarm on
// session start.
//
// No API keys. All state lives in <project>/.opencode/graphyloop/state.json.
// LLM work is still done by OpenCode task subagents; this only coordinates.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { tool } from '@opencode-ai/plugin';

const HOME = os.homedir();
// CLI location: env override, else the graphyloop core install target.
const GRAPHYLOOP_CLI = process.env.GRAPHYLOOP_CLI
  || path.join(HOME, '.graphyloop', 'graphyloop', 'cli.mjs');
const OPENCODE_ROOT = path.join(HOME, '.config', 'opencode');
const NODE_CANDIDATES = [
  process.env.GRAPHYLOOP_NODE,
  path.join('C:', 'Program Files', 'nodejs', 'node.exe'),
  'node',
].filter(Boolean);

// Resolved once per process — probing `node --version` on every CLI call adds
// ~100ms per graphyloop tool use for a path that never changes mid-session.
let cachedNode = null;
function findNode() {
  if (cachedNode) return cachedNode;
  for (const candidate of NODE_CANDIDATES) {
    try {
      const check = spawnSync(candidate, ['--version'], { timeout: 3000, stdio: 'ignore', windowsHide: true });
      if (check.status === 0) { cachedNode = candidate; return cachedNode; }
    } catch { /* try next */ }
  }
  cachedNode = 'node';
  return cachedNode;
}

function samePath(left, right) {
  const normalize = (value) => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
  return normalize(left) === normalize(right);
}

function isInside(root, parent) {
  const normalizedRoot = path.resolve(root).toLowerCase();
  const normalizedParent = path.resolve(parent).replace(/[\\/]+$/, '').toLowerCase();
  return normalizedRoot === normalizedParent || normalizedRoot.startsWith(`${normalizedParent}${path.sep}`);
}

// Mirrors repo-index-init's guard. The CLI writes <root>/.opencode/graphyloop/state.json,
// so an unguarded auto-init litters the home directory and the opencode config tree,
// and fails silently under Windows system dirs where the write is denied.
function isBlockedRoot(root) {
  if (!root) return true;
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (systemRoot && isInside(root, systemRoot)) return true;
  return samePath(root, HOME) || samePath(root, OPENCODE_ROOT);
}

// Runs a graphyloop CLI command with the project dir set, returns parsed JSON.
function runCli(args, projectDir) {
  if (isBlockedRoot(projectDir)) {
    return { error: `graphyloop skipped: ${projectDir} is not a project root (system dir, home, or opencode config)` };
  }
  const node = findNode();
  const res = spawnSync(node, [GRAPHYLOOP_CLI, ...args], {
    encoding: 'utf-8',
    timeout: 30000,
    windowsHide: true,
    env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: projectDir },
  });
  if (res.error) return { error: `spawn failed: ${res.error.message}` };
  try {
    return JSON.parse(res.stdout);
  } catch {
    return { error: `bad CLI output: ${(res.stdout || res.stderr || '').slice(0, 300)}` };
  }
}

// Ensure swarm initialized before any tool use (idempotent).
// Successful init is cached per root — without this every graphyloop tool call pays
// an extra `node cli.mjs init` spawn (~200ms) for a no-op re-init.
const initOk = new Map();
function ensureInit(projectDir) {
  if (!existsSync(GRAPHYLOOP_CLI)) return { error: `graphyloop CLI not found at ${GRAPHYLOOP_CLI}` };
  const cached = initOk.get(projectDir);
  if (cached) return cached;
  const res = runCli(['init'], projectDir);
  if (res.error) return res;
  const ok = { ok: true, alreadyInitialized: !!res.message, swarm: res };
  initOk.set(projectDir, ok);
  return ok;
}

// The CLI init is idempotent but costs a node spawn; only pay it once per root
// per process.
const autoInitDone = new Set();
function autoInit(projectDir) {
  if (!projectDir || autoInitDone.has(projectDir)) return;
  autoInitDone.add(projectDir);
  try { ensureInit(projectDir); } catch { /* non-fatal */ }
}

export default async (input) => {
  const projectDir = input?.directory || process.env.GRAPHYLOOP_PROJECT_ROOT || process.cwd();

  return {
    // Auto-init the swarm on session start. opencode dispatches lifecycle
    // events through the single `event` handler keyed on event.type — matching
    // the sibling caveman / repo-index-init plugins.
    event: async ({ event } = {}) => {
      if (event?.type !== 'session.created') return;
      autoInit(event?.properties?.directory || event?.properties?.worktree || projectDir);
    },

    // Backstop for one-shot `opencode run` and sessions where session.created
    // publishes before plugin event dispatch is wired. Signature is
    // (input, output) — input carries sessionID/agent/model, NOT the message,
    // so there is nothing to match on; the Set guard makes the repeat calls free.
    'chat.message': async () => {
      autoInit(projectDir);
    },

    tool: {
      graphyloop_init: tool({
        description: 'Initialize the graphyloop swarm (leader agent + memory store). Idempotent — safe to call anytime. Call this first if unsure.',
        args: {},
        async execute() { return JSON.stringify(ensureInit(projectDir)); },
      }),

      graphyloop_status: tool({
        description: 'Show graphyloop swarm status: agents (type/role/health), tasks completed/failed, memory entries, pending tasks.',
        args: {},
        async execute() {
          const init = ensureInit(projectDir);
          const status = runCli(['status'], projectDir);
          return JSON.stringify({ init, status }, null, 2);
        },
      }),

      graphyloop_spawn: tool({
        description: 'Spawn a swarm agent. type: coder|tester|reviewer|architect|explorer|security|coordinator|frontend|data. Max 8 agents.',
        args: {
          type: tool.schema.string().describe('Agent type: coder, tester, reviewer, architect, explorer, security, coordinator, frontend, data'),
          id: tool.schema.string().optional().describe('Custom agent id (default: auto-generated)'),
          capabilities: tool.schema.string().optional().describe('Comma-separated capability overrides'),
          role: tool.schema.string().optional().describe('leader|worker|peer (default: worker)'),
        },
        async execute(args) {
          const a = [
            'spawn', '--type', args.type,
            ...(args.id ? ['--id', args.id] : []),
            ...(args.capabilities ? ['--capabilities', args.capabilities] : []),
            ...(args.role ? ['--role', args.role] : []),
          ];
          const res = ensureInit(projectDir);
          const spawn = runCli(a, projectDir);
          return JSON.stringify({ init: res, spawn }, null, 2);
        },
      }),

      graphyloop_distribute: tool({
        description: 'Distribute tasks across swarm agents. tasks = JSON string array of {id, type, description, priority}. Returns assignments with opencodeAgentType + prompt per task — dispatch those as task subagents.',
        args: {
          tasks: tool.schema.string().describe('JSON array of {id, type, description, priority}. type: code|test|review|security|data|ui|explore|design|coordinate'),
        },
        async execute(args) {
          let parsed;
          try { parsed = JSON.parse(args.tasks); }
          catch { return JSON.stringify({ error: 'tasks must be valid JSON array string' }); }
          const res = ensureInit(projectDir);
          const dist = runCli(['distribute', '--tasks', args.tasks], projectDir);
          return JSON.stringify({ init: res, assignments: dist.assignments || dist }, null, 2);
        },
      }),

      graphyloop_record: tool({
        description: 'Record a swarm task result (completed|failed) after dispatching. Updates agent metrics + success rate.',
        args: {
          taskId: tool.schema.string(),
          status: tool.schema.string().describe('completed|failed'),
          agentId: tool.schema.string().optional(),
          error: tool.schema.string().optional(),
        },
        async execute(args) {
          const a = ['record', '--taskId', args.taskId, '--status', args.status];
          if (args.agentId) a.push('--agentId', args.agentId);
          if (args.error) a.push('--error', args.error);
          const res = runCli(a, projectDir);
          return JSON.stringify(res);
        },
      }),

      graphyloop_memory_store: tool({
        description: 'Store a persistent memory entry (decision, pattern, lesson, event). Searchable in future sessions.',
        args: {
          content: tool.schema.string().describe('Text to remember'),
          agent: tool.schema.string().optional().describe('Agent id (default: system)'),
          type: tool.schema.string().optional().describe('decision|pattern|lesson|event|task (default: event)'),
          metadata: tool.schema.string().optional().describe('Optional JSON metadata object'),
        },
        async execute(args) {
          const a = ['memory-store',
            '--agent', args.agent || 'system',
            '--content', args.content,
            '--type', args.type || 'event'];
          if (args.metadata) a.push('--metadata', args.metadata);
          const res = ensureInit(projectDir);
          const store = runCli(a, projectDir);
          return JSON.stringify({ init: res, store }, null, 2);
        },
      }),

      graphyloop_memory_search: tool({
        description: 'Keyword-search stored graphyloop memories (decisions, patterns, lessons from past tasks). Supplements PMB recall.',
        args: {
          query: tool.schema.string(),
          limit: tool.schema.string().optional().describe('Max results (default 10)'),
        },
        async execute(args) {
          const a = ['memory-search', '--query', args.query];
          if (args.limit) a.push('--limit', args.limit);
          const res = ensureInit(projectDir);
          const search = runCli(a, projectDir);
          return JSON.stringify({ init: res, search }, null, 2);
        },
      }),

      graphyloop_shutdown: tool({
        description: 'Shut down the swarm (terminates agents, keeps memory). Call at session end.',
        args: {},
        async execute() { return JSON.stringify(runCli(['shutdown'], projectDir)); },
      }),
    },
  };
};
