// graphyloop — Codex (OpenAI CLI) installer (B4).
//
// Installs into the Codex config root (~/.codex by default, overridable via
// ctx.homeDir):
//   1. config.toml      — append the `[mcp_servers.graphyloop]` section pointing at
//                         ~/.graphyloop/mcp-server.mjs (backslash-escaped TOML
//                         basic string). Never touches other sections. Skipped
//                         when the section already exists (idempotent).
//   2. AGENTS.md        — copied from workflow/AGENTS.md, skip unless --force.
//   3. prompts/         — 12 chadi-*.md body-only prompts from
//                         templates/codex/prompts/, skip unless --force.
//
// Rules (CONTRACTS.md): never overwrite user config keys; timestamped backups
// (*.bak-YYYYMMDD-HHmmss); idempotent re-runs; log via ctx.log; throw Error
// with an `ERROR:` prefix on fatal.
//
// Zero dependencies: node:fs, node:path, node:url only. Node >= 20, ESM.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MCP_SERVER_FILE = 'mcp-server.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function backupFile(file, log) {
  const bak = `${file}.bak-${timestamp()}`;
  await fs.copyFile(file, bak);
  log(`    backup ${path.basename(file)} -> ${path.basename(bak)}`);
  return bak;
}

// Copy src -> dest with the force gate. Returns 'copied' | 'skipped'.
async function copyWithForce(src, dest, force, log) {
  if (await exists(dest)) {
    if (!force) {
      log(`    skip  ${path.basename(dest)} (exists; use --force to overwrite)`);
      return 'skipped';
    }
    await backupFile(dest, log);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
  log(`    copy  ${path.basename(dest)} -> ${dest}`);
  return 'copied';
}

// TOML basic-string escaping: backslash, double-quote, tab, and control chars.
function tomlBasicString(value) {
  const s = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\t/g, '\\t')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, (c) =>
      '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
    );
  return `"${s}"`;
}

// The `[mcp_servers.graphyloop]` section appended to ~/.codex/config.toml.
function graphyloopSection(mcpPath) {
  return [
    '# graphyloop MCP server (graphyloop) — managed entry; remove via `npx graphyloop uninstall`',
    '[mcp_servers.graphyloop]',
    'command = "node"',
    `args = [${tomlBasicString(mcpPath)}]`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Installer
// ---------------------------------------------------------------------------

/**
 * @param {{homeDir: string, force?: boolean, skipAgents?: boolean,
 *          skipWorkflow?: boolean, noConfigMerge?: boolean,
 *          configDir?: string, graphyloopDir?: string, log?: (msg: string) => void}} ctx
 * @returns {Promise<{harness: string, copied: number, skipped: number,
 *                    merged: number, warnings: string[]}>}
 */
export async function install(ctx) {
  const log = ctx.log || console.log;
  const homeDir = ctx.homeDir;
  const force = !!ctx.force;
  const skipAgents = !!ctx.skipAgents;
  const skipWorkflow = !!ctx.skipWorkflow;
  const noConfigMerge = !!ctx.noConfigMerge;

  const report = { harness: 'codex', copied: 0, skipped: 0, merged: 0, warnings: [] };

  if (!homeDir || typeof homeDir !== 'string') {
    throw new Error('ERROR: install-codex requires ctx.homeDir');
  }

  const codexDir = path.join(homeDir, '.codex');
  const configFile = path.join(codexDir, 'config.toml');
  const mcpPath = path.join(homeDir, '.graphyloop', MCP_SERVER_FILE);

  log(`[codex] installing into ${codexDir}`);

  // 1. config.toml — append [mcp_servers.graphyloop], never touch other sections.
  if (noConfigMerge) {
    log('    SKIP config.toml merge (--no-config-merge)');
  } else if (await exists(configFile)) {
    let content;
    try {
      content = await fs.readFile(configFile, 'utf8');
    } catch (err) {
      throw new Error(`ERROR: cannot read ${configFile}: ${err.message}`);
    }
    if (/^\s*\[mcp_servers\.graphyloop\]\s*$/m.test(content)) {
      log('    skip  config.toml (mcp_servers.graphyloop section already present)');
      report.skipped++;
    } else {
      await backupFile(configFile, log);
      const separator = content.endsWith('\n') ? '' : '\n';
      await fs.writeFile(configFile, content + separator + graphyloopSection(mcpPath), 'utf8');
      log(`    merged [mcp_servers.graphyloop] into ${configFile}`);
      report.merged++;
    }
  } else {
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(configFile, graphyloopSection(mcpPath), 'utf8');
    log(`    create ${configFile} (missing)`);
    report.merged++;
  }

  // 2. AGENTS.md — global workflow rules.
  const agentsSrc = path.join(REPO_ROOT, 'workflow', 'AGENTS.md');
  const agentsDest = path.join(codexDir, 'AGENTS.md');
  if (skipWorkflow) {
    log('    SKIP AGENTS.md (--skip-workflow)');
  } else if (await exists(agentsSrc)) {
    const status = await copyWithForce(agentsSrc, agentsDest, force, log);
    if (status === 'copied') report.copied++; else report.skipped++;
  } else {
    report.warnings.push('workflow/AGENTS.md not found in package; AGENTS.md skipped');
  }

  // 3. prompts/ — 12 chadi-*.md, body-only (no frontmatter).
  if (skipAgents) {
    log('    SKIP prompts (--skip-agents)');
  } else {
    const promptsSrc = path.join(REPO_ROOT, 'templates', 'codex', 'prompts');
    const promptsDest = path.join(codexDir, 'prompts');
    let entries = [];
    try {
      entries = await fs.readdir(promptsSrc);
    } catch {
      entries = [];
    }
    const promptFiles = entries.filter((name) => name.endsWith('.md')).sort();
    if (promptFiles.length === 0) {
      report.warnings.push('templates/codex/prompts empty or missing; no prompts installed');
    }
    for (const entry of promptFiles) {
      const dest = path.join(promptsDest, entry);
      const status = await copyWithForce(path.join(promptsSrc, entry), dest, force, log);
      if (status === 'copied') report.copied++; else report.skipped++;
    }
  }

  log(
    `[codex] done: copied=${report.copied} skipped=${report.skipped} merged=${report.merged} warnings=${report.warnings.length}`
  );
  return report;
}
