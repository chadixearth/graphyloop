// CI smoke: verify the MCP server installed into a sandbox home actually
// answers the protocol handshake. Usage:
//   node scripts/ci-mcp-smoke.mjs --home <sandbox-home> --proj <project-dir>
// Exit 0 on success, 1 on failure. Works on Node 20/22/24, all platforms.
import { spawn } from 'node:child_process';
import path from 'node:path';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const home = arg('--home');
const proj = arg('--proj');
if (!home || !proj) {
  console.error('usage: node scripts/ci-mcp-smoke.mjs --home <dir> --proj <dir>');
  process.exit(1);
}

const serverPath = path.join(home, '.graphyloop', 'mcp-server.mjs');
const server = spawn(process.execPath, [serverPath], {
  env: { ...process.env, GRAPHYLOOP_PROJECT_ROOT: proj },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let out = '';
server.stdout.setEncoding('utf8');
server.stdout.on('data', (d) => { out += d; });
server.stderr.on('data', (d) => { console.error('server stderr:', String(d)); });

server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);

setTimeout(() => {
  const lines = out.trim().split('\n').filter(Boolean);
  if (lines.length !== 2) {
    console.error(`expected 2 responses, got ${lines.length}: ${out}`);
    process.exit(1);
  }
  let list;
  try {
    list = JSON.parse(lines[1]);
  } catch {
    console.error(`tools/list response not JSON: ${lines[1]}`);
    process.exit(1);
  }
  if (!list.result || !Array.isArray(list.result.tools) || list.result.tools.length !== 9) {
    console.error(`expected 9 tools, got: ${JSON.stringify(list.result).slice(0, 200)}`);
    process.exit(1);
  }
  console.log('MCP_SERVER_OK');
  server.stdin.end();
  process.exit(0);
}, 3000);
