// graphyloop — MCP + engine latency benchmark (dev tool, not shipped).
//
// Why this exists: "fast" is a claim, and the only claim worth making is one a
// second person can reproduce. This measures the three latencies a harness
// actually feels:
//
//   1. cold start   — process spawn -> initialize response (handshake)
//   2. per-call RTT — request written -> response read, over real stdio
//   3. throughput   — N pipelined requests -> all N responses (no RTT stalls)
//
// plus the in-process engine cost with no transport at all, which is where the
// state-file work shows up.
//
// Usage:
//   node scripts/bench-mcp.mjs                       (default 200 iterations)
//   node scripts/bench-mcp.mjs --iterations 500
//   node scripts/bench-mcp.mjs --memories 2000       seed the state first
//   node scripts/bench-mcp.mjs --json                machine-readable
//   node scripts/bench-mcp.mjs --save baseline.json  write the report
//   node scripts/bench-mcp.mjs --compare baseline.json
//
// Every run works on a fresh temp project, so it never touches a real workspace.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
// The path a harness actually launches (installed as ~/.graphyloop/mcp-server.mjs),
// so cold start includes the entry stub and its compile cache, not just the lib.
const SERVER = join(REPO, 'mcp-server.mjs');

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const ITERATIONS = Number(flag('iterations', 200));
const SEED_MEMORIES = Number(flag('memories', 800));
const AS_JSON = Boolean(flag('json', false));
const SAVE_TO = flag('save', null);
const COMPARE_TO = flag('compare', null);

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return {
    n: s.length,
    mean: round(s.reduce((a, b) => a + b, 0) / s.length),
    p50: round(at(50)),
    p95: round(at(95)),
    p99: round(at(99)),
    max: round(s[s.length - 1]),
  };
}
const round = (n) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------------------
// a minimal newline-delimited JSON-RPC client over stdio
// ---------------------------------------------------------------------------

function client(cwd, env) {
  const child = spawn(process.execPath, [SERVER], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stderr.resume(); // drain: a full stderr pipe would stall the server
  const pending = new Map();
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const done = pending.get(msg.id);
      if (done) { pending.delete(msg.id); done(msg); }
    }
  });
  let nextId = 1;
  return {
    child,
    call(method, params) {
      const id = nextId++;
      return new Promise((done) => {
        pending.set(id, done);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    },
    // Windows holds a handle on the child's cwd until it exits, so removing the
    // temp project before then fails with EPERM. Await the exit.
    close() {
      return new Promise((done) => {
        if (child.exitCode !== null || child.signalCode) return done();
        child.once('exit', () => done());
        try { child.stdin.end(); } catch { /* already gone */ }
        try { child.kill(); } catch { /* already gone */ }
      });
    },
  };
}

function scrub(dir) {
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch { /* temp dir, best effort */ }
}

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function project(memories) {
  const dir = mkdtempSync(join(tmpdir(), 'graphyloop-bench-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'bench', version: '1.0.0' }));
  if (memories > 0) {
    mkdirSync(join(dir, '.graphyloop'), { recursive: true });
    const now = Date.now();
    const state = {
      initialized: true,
      topology: 'hierarchical',
      maxAgents: 8,
      agents: [{
        id: 'swarm-leader', type: 'coordinator', status: 'active',
        capabilities: ['coordinate', 'route', 'orchestrate'], role: 'leader',
        tasksCompleted: 0, tasksFailed: 0, successRate: 1, health: 'healthy',
        createdAt: now, lastActive: now,
      }],
      memories: Array.from({ length: memories }, (_, i) => ({
        id: `mem-${now - i}-seed`,
        agentId: 'system',
        type: ['decision', 'pattern', 'lesson', 'event', 'task'][i % 5],
        content: `seeded memory ${i}: the swarm recorded a decision about module ${i % 37} and the lock path under contention`,
        timestamp: now - i * 60000,
        metadata: { eventType: 'seed', index: i, tags: ['bench', `mod-${i % 37}`] },
      })),
      tasksCompleted: 0,
      tasksFailed: 0,
      taskQueue: [],
    };
    writeFileSync(join(dir, '.graphyloop', 'state.json'), JSON.stringify(state));
  }
  return dir;
}

// ---------------------------------------------------------------------------
// benchmarks
// ---------------------------------------------------------------------------

async function coldStart(rounds, memories) {
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    const dir = project(memories);
    const t0 = performance.now();
    const home = mkdtempSync(join(tmpdir(), 'graphyloop-benchhome-'));
    const c = client(dir, { GRAPHYLOOP_HOME: home });
    await c.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bench', version: '0' } });
    samples.push(performance.now() - t0);
    await c.close();
    scrub(dir);
  }
  return stats(samples);
}

async function firstToolCall(rounds, memories) {
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    const dir = project(memories);
    const home = mkdtempSync(join(tmpdir(), 'graphyloop-benchhome-'));
    const c = client(dir, { GRAPHYLOOP_HOME: home });
    await c.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bench', version: '0' } });
    const t0 = performance.now();
    assertReal('tools/call', { name: 'swarm_state' }, await c.call('tools/call', { name: 'swarm_state', arguments: {} }));
    samples.push(performance.now() - t0);
    await c.close();
    scrub(dir);
  }
  return stats(samples);
}

// A tool that fails argument validation or the project-root guard answers in
// microseconds, which reads as spectacular throughput and measures nothing. Every
// benchmarked call is checked once before it is timed.
function assertReal(method, params, msg) {
  if (msg.error) throw new Error(`${method} returned a JSON-RPC error: ${JSON.stringify(msg.error)}`);
  const r = msg.result;
  if (method === 'tools/call') {
    if (r?.isError) throw new Error(`${params.name} answered isError: ${r.content?.[0]?.text?.slice(0, 300)}`);
    const text = r?.content?.[0]?.text || ''; // every tool answers with JSON in content[0].text
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error(`${params.name} answered non-JSON: ${text.slice(0, 200)}`); }
    if (parsed.error) throw new Error(`${params.name} answered an engine error: ${parsed.error}`);
  }
  return msg;
}

async function rtt(c, method, params, iterations) {
  // warmup — the first call pays init + module load, which cold start covers
  for (let i = 0; i < 5; i++) assertReal(method, params, await c.call(method, params));
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await c.call(method, params);
    samples.push(performance.now() - t0);
  }
  return stats(samples);
}

async function pipelined(c, method, params, count) {
  const t0 = performance.now();
  await Promise.all(Array.from({ length: count }, () => c.call(method, params)));
  const ms = performance.now() - t0;
  return { count, totalMs: round(ms), perCallMs: round(ms / count), callsPerSec: Math.round((count / ms) * 1000) };
}

async function run() {
  const report = { node: process.version, platform: process.platform, iterations: ITERATIONS, seededMemories: SEED_MEMORIES, at: new Date().toISOString(), transport: {}, engine: {} };

  report.coldStartHandshakeMs = await coldStart(15, 0);
  report.firstToolCallMs = await firstToolCall(15, SEED_MEMORIES);

  const dir = project(SEED_MEMORIES);
  const home = mkdtempSync(join(tmpdir(), 'graphyloop-benchhome-'));
  const c = client(dir, { GRAPHYLOOP_HOME: home });
  await c.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bench', version: '0' } });

  report.transport.ping = await rtt(c, 'ping', {}, ITERATIONS);
  report.transport.toolsList = await rtt(c, 'tools/list', {}, Math.min(ITERATIONS, 50));
  report.transport.swarm_state = await rtt(c, 'tools/call', { name: 'swarm_state', arguments: {} }, ITERATIONS);
  report.transport.memory_search = await rtt(c, 'tools/call', { name: 'memory_search', arguments: { query: 'lock path under contention', limit: '10' } }, ITERATIONS);
  report.transport.memory_store = await rtt(c, 'tools/call', { name: 'memory_store', arguments: { content: 'bench write path', type: 'event' } }, ITERATIONS);
  report.transport.plan_feature = await rtt(c, 'tools/call', { name: 'plan_feature', arguments: { goal: 'inventory system with stock levels, a dashboard and deploy to vercel' } }, Math.min(ITERATIONS, 50));
  report.throughput = {
    ping: await pipelined(c, 'ping', {}, 500),
    swarm_state: await pipelined(c, 'tools/call', { name: 'swarm_state', arguments: {} }, 200),
    memory_search: await pipelined(c, 'tools/call', { name: 'memory_search', arguments: { query: 'decision module', limit: '10' } }, 200),
  };
  await c.close();
  scrub(dir);

  // In-process engine: transport removed, so this is the state-file cost alone.
  const { createEngine } = await import(`../lib/engine.mjs?bench=${Date.now()}`);
  const edir = project(SEED_MEMORIES);
  const engine = createEngine({ projectRoot: edir });
  engine.init();
  const call = async (label, fn, iterations = ITERATIONS) => {
    for (let i = 0; i < 5; i++) fn(i);
    const samples = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      fn(i);
      samples.push(performance.now() - t0);
    }
    report.engine[label] = stats(samples);
  };
  await call('status', () => engine.status());
  await call('memorySearch', () => engine.memorySearch({ query: 'lock path under contention', limit: '10' }));
  await call('memoryStore', (i) => engine.memoryStore({ content: `bench ${i}`, type: 'event' }));
  await call('spawnAndList', (i) => { engine.spawn({ type: 'coder', id: `c-${i}` }); engine.status(); }, Math.min(ITERATIONS, 7));
  scrub(edir);

  return report;
}

function line(label, s) {
  return `${label.padEnd(24)} p50 ${String(s.p50).padStart(8)} ms   mean ${String(s.mean).padStart(8)} ms   p95 ${String(s.p95).padStart(8)} ms   max ${String(s.max).padStart(8)} ms`;
}

function print(report, baseline) {
  const out = [];
  out.push(`graphyloop MCP benchmark — node ${report.node} on ${report.platform}, ${report.iterations} iterations, ${report.seededMemories} seeded memories`);
  out.push('');
  out.push('cold start / first call');
  out.push(line('  spawn->initialize', report.coldStartHandshakeMs));
  out.push(line('  first tool call', report.firstToolCallMs));
  out.push('');
  out.push('per-call round trip (over real stdio)');
  for (const [k, v] of Object.entries(report.transport)) out.push(line(`  ${k}`, v));
  out.push('');
  out.push('in-process engine (no transport)');
  for (const [k, v] of Object.entries(report.engine)) out.push(line(`  ${k}`, v));
  out.push('');
  out.push('throughput (pipelined)');
  for (const [k, v] of Object.entries(report.throughput)) {
    out.push(`  ${k.padEnd(22)} ${v.count} calls in ${v.totalMs} ms  =  ${v.perCallMs} ms/call, ${v.callsPerSec} calls/sec`);
  }
  if (baseline) {
    out.push('');
    out.push('vs baseline (p50)');
    const rows = [
      ['spawn->initialize', baseline.coldStartHandshakeMs, report.coldStartHandshakeMs],
      ['first tool call', baseline.firstToolCallMs, report.firstToolCallMs],
      ...Object.keys(report.transport).map((k) => [k, baseline.transport?.[k], report.transport[k]]),
      ...Object.keys(report.engine).map((k) => [`engine.${k}`, baseline.engine?.[k], report.engine[k]]),
    ];
    for (const [label, before, after] of rows) {
      if (!before || !after) continue;
      const factor = before.p50 / after.p50;
      const delta = factor >= 1 ? `${round(factor)}x faster` : `${round(1 / factor)}x SLOWER`;
      out.push(`  ${label.padEnd(24)} ${String(before.p50).padStart(8)} -> ${String(after.p50).padStart(8)} ms   ${delta}`);
    }
  }
  return out.join('\n');
}

const report = await run();
const baseline = COMPARE_TO && existsSync(resolve(COMPARE_TO)) ? JSON.parse(readFileSync(resolve(COMPARE_TO), 'utf8')) : null;
if (SAVE_TO) writeFileSync(resolve(String(SAVE_TO)), `${JSON.stringify(report, null, 2)}\n`);
console.log(AS_JSON ? JSON.stringify(report, null, 2) : print(report, baseline));
void homedir;
