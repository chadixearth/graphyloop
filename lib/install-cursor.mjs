// graphyloop — Cursor installer (B4).
//
// Installs into the Cursor config root (~/.cursor by default, overridable via
// ctx.homeDir):
//   1. mcp.json         — merge `mcpServers.graphyloop` ({command:'node',
//                         args:[~/.graphyloop/mcp-server.mjs], enabled:true})
//                         into the existing file, preserving every other key.
//                         Creates the file when missing. Skipped when
//                         mcpServers.graphyloop already exists (idempotent).
//   2. AGENTS.md        — copied from workflow/AGENTS.md to rules/AGENTS.md,
//                         skip unless --force.
//
// Rules (CONTRACTS.md): never overwrite user config keys; timestamped backups
// (*.bak-YYYYMMDD-HHmmss); idempotent re-runs; log via ctx.log; throw Error
// with an `ERROR:` prefix on fatal.
//
// Zero dependencies: node:fs, node:path, node:url only. Node >= 20, ESM.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupFileAsync, matchesFileAsync } from './fsutil.mjs';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MCP_SERVER_FILE = 'mcp-server.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Copy src -> dest with the force gate. Returns 'copied' | 'skipped'.
async function copyWithForce(src, dest, force, log) {
  if (await exists(dest)) {
    if (!force) {
      log(`    skip  ${path.basename(dest)} (exists; use --force to overwrite)`);
      return 'skipped';
    }
    // Already byte-identical: rewriting it would only mint a dead backup.
    if (await matchesFileAsync(dest, src)) {
      log(`    same  ${path.basename(dest)} (unchanged)`);
      return 'skipped';
    }
    await backupFileAsync(dest, log);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
  log(`    copy  ${path.basename(dest)} -> ${dest}`);
  return 'copied';
}

// Cursor mcp.json entry for the graphyloop MCP server.
function graphyloopEntry(mcpPath) {
  return { command: 'node', args: [mcpPath], enabled: true };
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
  const skipWorkflow = !!ctx.skipWorkflow;
  const noConfigMerge = !!ctx.noConfigMerge;

  const report = { harness: 'cursor', copied: 0, skipped: 0, merged: 0, warnings: [] };

  if (!homeDir || typeof homeDir !== 'string') {
    throw new Error('ERROR: install-cursor requires ctx.homeDir');
  }

  const cursorDir = path.join(homeDir, '.cursor');
  const mcpFile = path.join(cursorDir, 'mcp.json');
  const mcpPath = path.join(homeDir, '.graphyloop', MCP_SERVER_FILE);

  log(`[cursor] installing into ${cursorDir}`);

  // 1. mcp.json — merge mcpServers.graphyloop, preserve every other key.
  if (noConfigMerge) {
    log('    SKIP mcp.json merge (--no-config-merge)');
  } else if (await exists(mcpFile)) {
    let config;
    try {
      config = JSON.parse(await fs.readFile(mcpFile, 'utf8'));
    } catch (err) {
      throw new Error(`ERROR: cannot parse ${mcpFile}: ${err.message}`);
    }
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`ERROR: ${mcpFile} is not a JSON object; refusing to merge`);
    }
    if (config.mcpServers !== undefined && (config.mcpServers === null || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers))) {
      throw new Error(`ERROR: ${mcpFile} "mcpServers" is not an object; refusing to merge`);
    }
    const existingServers = config.mcpServers || {};
    if (existingServers.graphyloop) {
      log('    skip  mcp.json (mcpServers.graphyloop already present)');
      report.skipped++;
    } else {
      await backupFileAsync(mcpFile, log);
      const next = { ...config, mcpServers: { ...existingServers, graphyloop: graphyloopEntry(mcpPath) } };
      await fs.writeFile(mcpFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      log(`    merged mcpServers.graphyloop into ${mcpFile}`);
      report.merged++;
    }
  } else {
    await fs.mkdir(cursorDir, { recursive: true });
    const created = { mcpServers: { graphyloop: graphyloopEntry(mcpPath) } };
    await fs.writeFile(mcpFile, `${JSON.stringify(created, null, 2)}\n`, 'utf8');
    log(`    create ${mcpFile} (missing)`);
    report.merged++;
  }

  // 2. AGENTS.md — global workflow rules.
  const agentsSrc = path.join(REPO_ROOT, 'workflow', 'AGENTS.md');
  const agentsDest = path.join(cursorDir, 'rules', 'AGENTS.md');
  if (skipWorkflow) {
    log('    SKIP AGENTS.md (--skip-workflow)');
  } else if (await exists(agentsSrc)) {
    const status = await copyWithForce(agentsSrc, agentsDest, force, log);
    if (status === 'copied') report.copied++; else report.skipped++;
  } else {
    report.warnings.push('workflow/AGENTS.md not found in package; AGENTS.md skipped');
  }

  log(
    `[cursor] done: copied=${report.copied} skipped=${report.skipped} merged=${report.merged} warnings=${report.warnings.length}`
  );
  return report;
}
