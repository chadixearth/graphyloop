// graphyloop — Cursor installer (B4).
//
// Installs into the Cursor config root (~/.cursor by default, overridable via
// ctx.homeDir):
//   1. mcp.json         — merge `mcpServers.graphyloop` ({command:'node',
//                         args:[~/.graphyloop/mcp-server.mjs], enabled:true})
//                         into the existing file, preserving every other key.
//                         Creates the file when missing. Skipped when
//                         mcpServers.graphyloop already exists (idempotent).
//   2. rules            — none: Cursor has no file-based global rules (see step 2);
//                         an untouched ~/.cursor/rules/AGENTS.md from <= 0.6.1 is removed.
//   3. ~/.agents/skills — bundled skills (Agent Skills standard; Cursor user skills dir).
//
// Rules (CONTRACTS.md): never overwrite user config keys; timestamped backups
// (*.bak-YYYYMMDD-HHmmss); idempotent re-runs; log via ctx.log; throw Error
// with an `ERROR:` prefix on fatal.
//
// Zero dependencies: node:fs, node:path, node:url only. Node >= 20, ESM.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupFileAsync, classifyMcpEntry, matchesFileAsync, repairedMcpEntry } from './fsutil.mjs';
import { installSkills } from './install-skills.mjs';

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
  const skipAgents = !!ctx.skipAgents;
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
    const current = existingServers.graphyloop;
    const state = current === undefined || current === null ? 'missing' : classifyMcpEntry(current, mcpPath);
    if (state === 'same') {
      log('    skip  mcp.json (mcpServers.graphyloop already installed)');
      report.skipped++;
    } else if (state === 'custom') {
      log('    skip  mcp.json (mcpServers.graphyloop already configured differently; user config preserved)');
      report.warnings.push('mcpServers.graphyloop already configured differently in mcp.json; kept your config');
      report.skipped++;
    } else {
      await backupFileAsync(mcpFile, log);
      const entry = state === 'stale' ? repairedMcpEntry(current, mcpPath) : graphyloopEntry(mcpPath);
      const next = { ...config, mcpServers: { ...existingServers, graphyloop: entry } };
      await fs.writeFile(mcpFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      log(state === 'stale'
        ? `    repaired mcpServers.graphyloop in ${mcpFile} (pointed at ${current.args[0]})`
        : `    merged mcpServers.graphyloop into ${mcpFile}`);
      report.merged++;
    }
  } else {
    await fs.mkdir(cursorDir, { recursive: true });
    const created = { mcpServers: { graphyloop: graphyloopEntry(mcpPath) } };
    await fs.writeFile(mcpFile, `${JSON.stringify(created, null, 2)}\n`, 'utf8');
    log(`    create ${mcpFile} (missing)`);
    report.merged++;
  }

  // 2. Workflow rules. Cursor has no file-based global rules: project rules must
  // be .mdc files, User Rules live in Customize → Rules, and a plain .md in
  // .cursor/rules is ignored. The workflow loads from the graphyloop-workflow
  // skill instead, and a project's own AGENTS.md is read from its root.
  // Versions <= 0.6.1 wrote ~/.cursor/rules/AGENTS.md, which Cursor never loaded;
  // remove it while it is still the untouched shipped copy.
  const agentsSrc = path.join(REPO_ROOT, 'workflow', 'AGENTS.md');
  const legacyRules = path.join(cursorDir, 'rules', 'AGENTS.md');
  if (!skipWorkflow && await exists(legacyRules) && await exists(agentsSrc) && await matchesFileAsync(legacyRules, agentsSrc)) {
    await fs.rm(legacyRules);
    log(`    remove ${legacyRules} (Cursor ignores plain .md files in rules/)`);
    try { await fs.rmdir(path.dirname(legacyRules)); } catch { /* not empty: user rules remain */ }
  }
  log('    rules: none (Cursor reads global rules from Customize → Rules; the workflow loads from the graphyloop-workflow skill)');

  // 3. skills (~/.agents/skills) — Cursor user skills dir (Agent Skills standard).
  if (skipAgents) {
    log('    SKIP skills (--skip-agents)');
  } else {
    log('    skills (unmodified ones refreshed, your own kept)');
    const skills = installSkills({
      skillsDir: path.join(homeDir, '.agents', 'skills'),
      dedupeDirs: [path.join(homeDir, '.gemini', 'skills')],
      force,
      log,
    });
    report.copied += skills.copied;
    report.skipped += skills.skipped;
    report.warnings.push(...skills.warnings);
  }

  log(
    `[cursor] done: copied=${report.copied} skipped=${report.skipped} merged=${report.merged} warnings=${report.warnings.length}`
  );
  return report;
}
