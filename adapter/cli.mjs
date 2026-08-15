#!/usr/bin/env node
/**
 * GraphyLoop CLI — shell-callable entry for agent-chadi and any harness that
 * prefers a command over an MCP tool.
 *
 * All swarm and memory rules live in lib/engine.mjs; this file only maps argv
 * onto that engine and prints one JSON object per invocation. State persists in
 * <project>/.graphyloop/state.json.
 *
 * Commands (all return JSON):
 *   init | status | spawn | distribute | record
 *   memory-store | memory-search | memory-forget
 *   plan | secrets-status | secrets-set | secrets-forget | env-sync | preflight | stack
 *   shutdown | cleanup | ask
 */

import { readFileSync } from 'node:fs';
import { createEngine, AGENT_TYPES, SECRET_PROVIDERS } from '../lib/engine.mjs';

const engine = createEngine();

function output(obj) { console.log(JSON.stringify(obj)); }

const args = process.argv.slice(2);
const command = args[0];

// Accepts both `--flag value` and `--flag=value`. A missing value reads as ''
// rather than swallowing the next flag, so `--content --type event` reports a
// missing content instead of storing the literal "--type".
function getArg(name) {
  const flag = `--${name}`;
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
    if (args[i] === flag) {
      const next = args[i + 1];
      return next === undefined || next.startsWith('--') ? '' : next;
    }
  }
  return '';
}

/** Presence-only flag (`--force`), which getArg cannot express. */
function hasFlag(name) {
  return args.includes(`--${name}`) || args.some((a) => a === `--${name}=true`);
}

// System prompts for direct DeepSeek API calls (bypasses the harness).
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
};

/**
 * One-shot direct DeepSeek API call — headless, bypasses the harness.
 * Requires DEEPSEEK_API_KEY. Model: --model or DEEPSEEK_MODEL, default
 * deepseek-v4-flash (deepseek-v4-pro is the other current id).
 */
function cmdAsk(prompt, type, model) {
  if (!prompt) { output({ error: 'need --prompt' }); return; }
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    output({ error: 'DEEPSEEK_API_KEY not set. Set it to call DeepSeek directly (bypasses the harness), or use harness task subagents for routed LLM work.' });
    return;
  }
  const role = type || 'assistant';
  const system = AGENT_SYSTEM_PROMPTS[role] || 'You are a helpful assistant.';
  const modelId = model || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

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
        const errText = await res.text().catch(() => '');
        throw new Error(`DeepSeek API ${res.status}: ${errText.slice(0, 300)}`);
      }
      const data = await res.json();
      output({
        ok: true,
        model: data?.model || modelId,
        agent: role,
        content: data?.choices?.[0]?.message?.content,
        usage: data?.usage || undefined,
      });
    })
    .catch((err) => output({ error: err instanceof Error ? err.message : String(err) }));
}

// `distribute` takes its tasks inline or from a file; parsing stays here so the
// engine only ever sees a real array.
function readTasks() {
  const file = getArg('file');
  const inline = getArg('tasks');
  if (file) {
    try { return { tasks: JSON.parse(readFileSync(file, 'utf-8')) }; }
    catch { return { error: `invalid JSON file: ${file}` }; }
  }
  if (inline) {
    try { return { tasks: JSON.parse(inline) }; }
    catch { return { error: 'invalid tasks JSON' }; }
  }
  return { error: 'need --tasks or --file' };
}

const USAGE_CLI = 'node ~/.graphyloop/graphyloop/cli.mjs';

try {
  switch (command) {
    case 'init':
      output(engine.init());
      break;
    case 'status':
      output(engine.status());
      break;
    case 'spawn':
      output(engine.spawn({
        type: getArg('type'), id: getArg('id'),
        capabilities: getArg('capabilities'), role: getArg('role'),
      }));
      break;
    case 'distribute': {
      const parsed = readTasks();
      output(parsed.error ? { error: parsed.error } : engine.distribute({ tasks: parsed.tasks }));
      break;
    }
    case 'record':
      output(engine.record({
        taskId: getArg('taskId'), status: getArg('status'), agentId: getArg('agentId'),
      }));
      break;
    case 'memory-store':
      output(engine.memoryStore({
        agent: getArg('agent'), content: getArg('content'),
        type: getArg('type'), metadata: getArg('metadata'),
      }));
      break;
    case 'memory-search':
      output(engine.memorySearch({
        query: getArg('query'), limit: getArg('limit'), type: getArg('type'),
      }));
      break;
    case 'memory-forget':
      output(engine.memoryForget({ id: getArg('id') }));
      break;
    case 'plan':
      output(engine.planFeature({
        goal: getArg('goal'),
        includeDeploy: hasFlag('deploy'),
        maxParallel: getArg('maxParallel') || getArg('max-parallel'),
      }));
      break;
    case 'secrets-status':
      output(engine.secretsStatus({ provider: getArg('provider') || undefined }));
      break;
    case 'secrets-set':
      // The value is read from the environment first on purpose: an argv value is
      // visible in `ps`/Task Manager and in any shell history the harness keeps.
      output(engine.secretsSet({
        key: getArg('key'),
        value: process.env.GRAPHYLOOP_SECRET_VALUE || getArg('value'),
        provider: getArg('provider') || undefined,
      }));
      break;
    case 'secrets-forget':
      output(engine.secretsForget({ key: getArg('key') }));
      break;
    case 'env-sync':
      output(engine.envSync({
        target: getArg('target') || undefined,
        providers: getArg('providers') || undefined,
        framework: getArg('framework') || undefined,
        force: hasFlag('force'),
      }));
      break;
    case 'preflight':
      output(engine.preflight({ target: getArg('target') || 'all' }));
      break;
    case 'stack':
      output(engine.stack());
      break;
    case 'shutdown':
      output(engine.shutdown());
      break;
    case 'cleanup':
      output(engine.cleanup());
      break;
    case 'ask':
      cmdAsk(getArg('prompt'), getArg('type'), getArg('model'));
      break;
    default:
      output({
        error: 'unknown command',
        usage: {
          init: `${USAGE_CLI} init`,
          status: `${USAGE_CLI} status`,
          spawn: `${USAGE_CLI} spawn --type coder --id my-agent`,
          distribute: `${USAGE_CLI} distribute --tasks '[json]'`,
          record: `${USAGE_CLI} record --taskId t1 --status completed`,
          ask: `${USAGE_CLI} ask --prompt "summarize" --type coder --model deepseek-v4-flash|deepseek-v4-pro`,
          'memory-store': `${USAGE_CLI} memory-store --agent sys --content "text" --type event`,
          'memory-search': `${USAGE_CLI} memory-search --query "text" --limit 10 --type lesson`,
          'memory-forget': `${USAGE_CLI} memory-forget --id mem-123`,
          plan: `${USAGE_CLI} plan --goal "inventory system with a dashboard" [--deploy]`,
          'secrets-status': `${USAGE_CLI} secrets-status [--provider supabase|vercel|all]`,
          'secrets-set': `GRAPHYLOOP_SECRET_VALUE=... ${USAGE_CLI} secrets-set --key SUPABASE_URL`,
          'secrets-forget': `${USAGE_CLI} secrets-forget --key SUPABASE_URL`,
          'env-sync': `${USAGE_CLI} env-sync [--target .env.local] [--providers supabase,vercel] [--force]`,
          preflight: `${USAGE_CLI} preflight --target db|deploy|all`,
          stack: `${USAGE_CLI} stack`,
          shutdown: `${USAGE_CLI} shutdown`,
        },
        agentTypes: AGENT_TYPES,
        secretProviders: SECRET_PROVIDERS,
      });
  }
} catch (e) {
  output({ error: e instanceof Error ? e.message : String(e) });
}
