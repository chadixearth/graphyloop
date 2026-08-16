// GraphyLoop swarm + memory plugin for OpenCode.
//
// Gives agent-chadi (and any agent) direct tools to drive the graphyloop
// meta-harness CLI (swarm coordination + persistent memory) without
// remembering shell commands. Also auto-initializes the swarm on
// session start.
//
// No API keys. All state lives in <project>/.graphyloop/state.json.
// LLM work is still done by OpenCode task subagents; this only coordinates.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { tool } from '@opencode-ai/plugin';

const HOME = os.homedir();
const DEFAULT_CLI = path.join(HOME, '.graphyloop', 'graphyloop', 'cli.mjs');
// CLI location: env override, else the graphyloop core install target. The
// override is only trusted when it is absolute, existing, and a .mjs file — a
// poisoned env (a project .env loaded by the harness) must not be able to make
// us execute an arbitrary path. Same policy as lib/mcp.mjs.
function resolveCli() {
  const env = process.env.GRAPHYLOOP_CLI;
  if (env && path.isAbsolute(env) && env.endsWith('.mjs') && existsSync(env)) return env;
  return DEFAULT_CLI;
}
const GRAPHYLOOP_CLI = resolveCli();
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

// Mirrors repo-index-init's guard. The CLI writes <root>/.graphyloop/state.json,
// so an unguarded auto-init litters the home directory and the opencode config tree,
// and fails silently under Windows system dirs where the write is denied.
function isBlockedRoot(root) {
  if (!root) return true;
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (systemRoot && isInside(root, systemRoot)) return true;
  return samePath(root, HOME) || samePath(root, OPENCODE_ROOT);
}

// Runs a graphyloop CLI command with the project dir set, returns parsed JSON.
// extraEnv carries values that must not appear on argv (credentials).
function runCli(args, projectDir, extraEnv) {
  if (isBlockedRoot(projectDir)) {
    return { error: `graphyloop skipped: ${projectDir} is not a project root (system dir, home, or opencode config)` };
  }
  const node = findNode();
  const res = spawnSync(node, [GRAPHYLOOP_CLI, ...args], {
    encoding: 'utf-8',
    timeout: 30000,
    windowsHide: true,
    env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: projectDir, ...(extraEnv || {}) },
  });
  if (res.error) return { error: `spawn failed: ${res.error.message}` };
  // The CLI reports its own failures as {error} on stdout with exit 0, so a
  // signal or non-zero status means it crashed or hit the 30s timeout — without
  // these two checks that surfaced as a confusing empty "bad CLI output:".
  if (res.signal) return { error: `graphyloop CLI killed by signal ${res.signal} (timeout is 30s)` };
  const out = (res.stdout || '').trim();
  if (res.status !== 0) {
    return { error: `graphyloop CLI exited with code ${res.status}: ${out || (res.stderr || '').trim()}` };
  }
  try {
    return JSON.parse(out);
  } catch {
    return { error: `bad CLI output: ${(out || res.stderr || '').slice(0, 300)}` };
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
        description: 'Distribute tasks across swarm agents. tasks = JSON string array of {id, type, description, priority} plus optional {wave, dependsOn, owns, acceptance, gate} (graphyloop_plan_feature emits exactly this shape). Returns assignments with opencodeAgentType + prompt, plus dispatchNow (deps satisfied — fan these out in ONE block) and blocked (still waiting, with waitingOn ids).',
        args: {
          tasks: tool.schema.string().describe('JSON array of {id, type, description, priority[, wave, dependsOn, owns, acceptance]}. type: code|test|review|security|data|ui|explore|design|coordinate|schema|implement|validate|scan|analyze'),
        },
        async execute(args) {
          let parsed;
          try { parsed = JSON.parse(args.tasks); }
          catch { return JSON.stringify({ error: 'tasks must be valid JSON array string' }); }
          if (!Array.isArray(parsed)) return JSON.stringify({ error: 'tasks must be a JSON array' });
          if (parsed.length === 0) return JSON.stringify({ error: 'tasks array is empty' });
          const res = ensureInit(projectDir);
          const dist = runCli(['distribute', '--tasks', args.tasks], projectDir);
          return JSON.stringify({
            init: res,
            assignments: dist.assignments || dist,
            dispatchNow: dist.dispatchNow,
            blocked: dist.blocked,
            waves: dist.waves,
          }, null, 2);
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
        description: 'Keyword-search stored graphyloop memories (decisions, patterns, lessons from past tasks), ranked by match quality with a recency bias.',
        args: {
          query: tool.schema.string(),
          limit: tool.schema.string().optional().describe('Max results (default 10)'),
          type: tool.schema.string().optional().describe('Only search this type: decision|pattern|lesson|event|task'),
        },
        async execute(args) {
          const a = ['memory-search', '--query', args.query];
          if (args.limit) a.push('--limit', args.limit);
          if (args.type) a.push('--type', args.type);
          const res = ensureInit(projectDir);
          const search = runCli(a, projectDir);
          return JSON.stringify({ init: res, search }, null, 2);
        },
      }),

      graphyloop_memory_forget: tool({
        description: 'Delete one memory by id (ids come from graphyloop_memory_search). Use it to correct a wrong or outdated memory instead of letting it be recalled forever.',
        args: {
          id: tool.schema.string().describe('Memory id, e.g. mem-1700000000000-ab12'),
        },
        async execute(args) {
          if (!args.id || !args.id.trim()) return JSON.stringify({ error: 'id is required (take it from graphyloop_memory_search)' });
          const res = ensureInit(projectDir);
          const forget = runCli(['memory-forget', '--id', args.id], projectDir);
          return JSON.stringify({ init: res, forget }, null, 2);
        },
      }),

      graphyloop_plan_feature: tool({
        description: 'Plan a multi-layer feature as parallel waves BEFORE coding. Returns wave 0 contract (one agent freezes schema + API + props + test scenarios) -> wave 1 parallel builders (data ∥ backend ∥ frontend ∥ tests) -> wave 2 integration -> wave 3 parallel verifiers (test ∥ typecheck ∥ security ∥ performance ∥ review) -> wave 4 gated deploy. Each task carries its owned files, acceptance check and dependsOn. Feed plan.tasks to graphyloop_distribute.',
        args: {
          goal: tool.schema.string().describe('The feature request in plain words, e.g. "inventory system with stock levels and a dashboard"'),
          includeDeploy: tool.schema.string().optional().describe('"true" to force the deploy wave on'),
          maxParallel: tool.schema.string().optional().describe('Local builder concurrency cap (default 4)'),
        },
        async execute(args) {
          if (!args.goal || !args.goal.trim()) return JSON.stringify({ error: 'goal is required' });
          const a = ['plan', '--goal', args.goal];
          if (args.includeDeploy === 'true' || args.includeDeploy === true) a.push('--deploy');
          if (args.maxParallel) a.push('--maxParallel', String(args.maxParallel));
          const init = ensureInit(projectDir);
          const plan = runCli(a, projectDir);
          return JSON.stringify({ init, plan }, null, 2);
        },
      }),

      graphyloop_secrets_status: tool({
        description: 'Masked readiness report for project credentials (Supabase, Vercel): which keys are set, where each comes from (env / graphyloop store / .env file), what is missing. Values are never returned. Call this before database or deploy work instead of asking the user to paste keys into chat.',
        args: {
          provider: tool.schema.string().optional().describe('supabase | vercel | all (default all)'),
        },
        async execute(args) {
          const a = ['secrets-status'];
          if (args.provider) a.push('--provider', args.provider);
          return JSON.stringify(runCli(a, projectDir), null, 2);
        },
      }),

      graphyloop_secrets_set: tool({
        description: 'Store one credential in the project-local secret store (.graphyloop/secrets.json, chmod 600, git-ignored before the first write). Keys: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL, SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN, VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID. The value is written to disk and echoed back masked only.',
        args: {
          key: tool.schema.string().describe('UPPER_SNAKE_CASE key name, e.g. SUPABASE_URL'),
          value: tool.schema.string().describe('The credential value (stored on disk, never echoed back)'),
          provider: tool.schema.string().optional().describe('supabase | vercel (optional, inferred from the key)'),
        },
        async execute(args) {
          if (!args.key || !args.key.trim()) return JSON.stringify({ error: 'key is required' });
          if (!args.value || !args.value.trim()) return JSON.stringify({ error: 'value is required' });
          const a = ['secrets-set', '--key', args.key];
          if (args.provider) a.push('--provider', args.provider);
          const init = ensureInit(projectDir);
          // Passed through the env, not argv: an argv credential is visible in the
          // process list to every other user on the machine.
          const set = runCli(a, projectDir, { GRAPHYLOOP_SECRET_VALUE: args.value });
          return JSON.stringify({ init, set }, null, 2);
        },
      }),

      graphyloop_env_sync: tool({
        description: 'Write stored credentials into the env file the framework reads (default .env.local), add public aliases for public keys only (NEXT_PUBLIC_*/VITE_*, never a service-role key), refresh a values-free .env.example, and ensure .gitignore covers the env files. Values move file-to-file; the result lists key names only.',
        args: {
          target: tool.schema.string().optional().describe('Env file name (default .env.local)'),
          providers: tool.schema.string().optional().describe('Comma-separated provider filter, e.g. "supabase"'),
          force: tool.schema.string().optional().describe('"true" to overwrite a key that already has a different value (backup kept)'),
        },
        async execute(args) {
          const a = ['env-sync'];
          if (args.target) a.push('--target', args.target);
          if (args.providers) a.push('--providers', args.providers);
          if (args.force === 'true' || args.force === true) a.push('--force');
          return JSON.stringify(runCli(a, projectDir), null, 2);
        },
      }),

      graphyloop_preflight: tool({
        description: 'Readiness check + ordered command plan for database setup and/or deploy. Returns the detected stack, blockers (missing credentials, no build script, env file not git-ignored), warnings, and the exact commands — destructive steps (supabase db push, vercel --prod) carry the approval gate they need. Executes nothing.',
        args: {
          target: tool.schema.string().optional().describe('db | deploy | all (default all)'),
        },
        async execute(args) {
          const target = args.target || 'all';
          if (!['db', 'deploy', 'all'].includes(target)) {
            return JSON.stringify({ error: 'target must be one of: db, deploy, all' });
          }
          return JSON.stringify(runCli(['preflight', '--target', target], projectDir), null, 2);
        },
      }),

      graphyloop_skills: tool({
        description: 'Which skills are installed on this machine (project .opencode/skills, .dsh/skills, .agents/skills; ~/.config/opencode/skills, ~/.claude/skills, ~/.dsh/skills, ~/.agents/skills), which graphyloop-bundled skills are present (71, of which 11 are graphyloop-authored: graphyloop-waves, api-contract-design, api-hardening, frontend-security, web-accessibility, web-performance, dependency-audit, supabase-setup, vercel-deploy, secrets-hygiene, swarm-memory), and which skills the squad routes on but are missing. Check here instead of guessing — a missing skill is reported in one line, never faked.',
        args: {},
        async execute() {
          return JSON.stringify(runCli(['skills'], projectDir), null, 2);
        },
      }),

      graphyloop_shutdown: tool({
        description: 'Shut down the swarm (terminates agents, keeps memory). Call at session end.',
        args: {},
        async execute() {
          const res = runCli(['shutdown'], projectDir);
          // Shutdown flips the state back to uninitialized. Without dropping the
          // cached init, every later tool call in this session would keep
          // reporting "not initialized" instead of restarting the swarm.
          initOk.delete(projectDir);
          autoInitDone.delete(projectDir);
          return JSON.stringify(res);
        },
      }),
    },
  };
};
