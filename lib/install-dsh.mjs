// graphyloop — DeepSeek Harness (`dsh`) installer.
//
// dsh composes its whole plugin tree from patch layers: each bundle in the
// profile manifest, then the profile's own `cordis.patch.yml`, then the
// home-level `$DSH_HOME/cordis.patch.yml`, then `--patch` overlays. The
// home-level layer is the one graphyloop wants: it applies to EVERY profile
// (web, headless, any custom one) and dsh hot-reloads it, so the tools appear
// without touching a single bundle.
//
// Installs into the dsh home (~/.dsh, or $DSH_HOME when installing into the real
// home directory):
//   1. cordis.patch.yml   — append one `insert` patch mounting
//                           @deepseek-ai/dsh-mcp-client against
//                           ~/.graphyloop/mcp-server.mjs (serverName
//                           `graphyloop`). The MCP bridge registers every tool
//                           as `mcp__graphyloop__<name>`. Idempotent: skipped
//                           when an id: graphyloop-mcp row is already there.
//   2. AGENTS.md          — the 5-gate rules. dsh loads $DSH_HOME/AGENTS.md as
//                           user-global instructions for every session.
//   3. skills/            — the 5 bundled skills plus the dsh-only
//                           `graphyloop-squad` skill (dsh discovers
//                           $DSH_HOME/skills). An existing skill is never
//                           overwritten.
//   4. graphyloop/agents/ + graphyloop/commands/ — the squad role prompts and
//                           the 15 workflow bodies. dsh has no agent files and
//                           no file-based slash commands (agents are
//                           compositions, commands are plugins), so the squad
//                           reaches it as a prompt library the conductor reads
//                           and hands to dsh's own `subagent` tool. The
//                           graphyloop-squad skill is the index.
//
// The mcp-client package needs no install step: dsh symlinks its whole
// dependency closure into $DSH_HOME/profiles/node_modules on every boot, so
// '@deepseek-ai/dsh-mcp-client' resolves from any profile.
//
// Rules (CONTRACTS.md): never overwrite user config keys; timestamped backups
// (*.bak-YYYYMMDD-HHmmss); idempotent re-runs; log via ctx.log; throw Error
// with an `ERROR:` prefix on fatal.
//
// Zero dependencies: node:fs, node:path, node:url only. Node >= 20, ESM.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dshHome } from './detect.mjs';
import { installSkills, DSH_SKILLS_SRC } from './install-skills.mjs';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MCP_SERVER_FILE = 'mcp-server.mjs';

/** Row id graphyloop owns in the patch list; also the idempotency marker. */
export const PATCH_ROW_ID = 'graphyloop-mcp';

/** MCP namespace: dsh exposes the tools as `mcp__graphyloop__<name>`. */
export const MCP_SERVER_NAME = 'graphyloop';

/** Where the squad prompt library lands inside the dsh home. */
export const LIBRARY_DIR = 'graphyloop';

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

/**
 * YAML single-quoted scalar. Single quotes keep backslashes literal, which is
 * what a Windows path needs; only an embedded quote is escaped (doubled).
 */
export function yamlSingleQuoted(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * The patch list entry graphyloop appends to the dsh home patch layer.
 *
 * One `insert` over the composed root: a single `dsh-mcp-client` row. Written as
 * text rather than through a YAML serializer because this file is the user's own
 * layer — their comments, `!!js` expressions and row order must survive a
 * re-install untouched, and an emitter would rewrite the whole document.
 *
 * @param {string} mcpPath absolute path of ~/.graphyloop/mcp-server.mjs
 * @returns {string}
 */
export function patchBlock(mcpPath) {
  return [
    '# graphyloop MCP server — managed by `npx graphyloop install`; removed by',
    '# `npx graphyloop uninstall`. Tools appear as mcp__graphyloop__<name>.',
    '- insert:',
    `    - id: ${PATCH_ROW_ID}`,
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        transport: stdio',
    `        serverName: ${MCP_SERVER_NAME}`,
    '        command: node',
    '        args:',
    `          - ${yamlSingleQuoted(mcpPath)}`,
    '',
  ].join('\n');
}

/** Header used only when graphyloop creates the patch file from scratch. */
export function patchFileHeader() {
  return [
    '# $DSH_HOME/cordis.patch.yml — your machine-local dsh patch layer, applied',
    '# over every profile. A top-level YAML array of loader patch entries',
    '# (id-targeted config overrides, disables, and insert lists).',
    '',
    '',
  ].join('\n');
}

/** True when the patch list already carries the graphyloop row. */
export function hasPatchRow(content) {
  return new RegExp(`(^|\\s)id:\\s*['"]?${PATCH_ROW_ID}['"]?\\s*$`, 'm').test(content);
}

/**
 * Does this patch document hold zero entries?
 *
 * The shipped template is comments plus a `[]` flow sequence. Appending list
 * items after `[]` is invalid YAML, and dsh throws at boot on a patch file it
 * cannot parse, so that case is a replacement rather than an append.
 */
export function isEmptyPatchList(content) {
  const body = content
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
    .join('\n')
    .trim();
  return body === '' || body === '[]';
}

/** Copy every *.md in `srcDir` into `destDir` under the force gate. */
async function copyMarkdownDir(srcDir, destDir, force, log, report, label) {
  let entries = [];
  try {
    entries = await fs.readdir(srcDir);
  } catch {
    entries = [];
  }
  const files = entries.filter((name) => name.endsWith('.md')).sort();
  if (files.length === 0) {
    report.warnings.push(`${label} empty or missing; nothing installed`);
    return;
  }
  await fs.mkdir(destDir, { recursive: true });
  for (const name of files) {
    const status = await copyWithForce(path.join(srcDir, name), path.join(destDir, name), force, log);
    if (status === 'copied') report.copied++;
    else report.skipped++;
  }
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

  const report = { harness: 'dsh', copied: 0, skipped: 0, merged: 0, warnings: [] };

  if (!homeDir || typeof homeDir !== 'string') {
    throw new Error('ERROR: install-dsh requires ctx.homeDir');
  }

  const dshDir = dshHome(homeDir);
  const patchFile = path.join(dshDir, 'cordis.patch.yml');
  const mcpPath = path.join(homeDir, '.graphyloop', MCP_SERVER_FILE);

  log(`[dsh] installing into ${dshDir}`);

  // 1. cordis.patch.yml — append the graphyloop row, keep every other entry.
  if (noConfigMerge) {
    log('    SKIP cordis.patch.yml merge (--no-config-merge)');
  } else if (await exists(patchFile)) {
    let content;
    try {
      content = await fs.readFile(patchFile, 'utf8');
    } catch (err) {
      throw new Error(`ERROR: cannot read ${patchFile}: ${err.message}`);
    }
    if (hasPatchRow(content)) {
      log(`    skip  cordis.patch.yml (id: ${PATCH_ROW_ID} already present)`);
      report.skipped++;
    } else {
      await backupFile(patchFile, log);
      let next;
      if (isEmptyPatchList(content)) {
        // Keep the user's comments, drop the empty `[]` the template ships with.
        const kept = content.replace(/^\s*\[\s*\]\s*$/m, '').replace(/\n{3,}/g, '\n\n');
        next = `${kept.trimEnd()}\n\n${patchBlock(mcpPath)}`.replace(/^\n+/, '');
      } else {
        const separator = content.endsWith('\n') ? '\n' : '\n\n';
        next = content + separator + patchBlock(mcpPath);
      }
      await fs.writeFile(patchFile, next, 'utf8');
      log(`    merged id: ${PATCH_ROW_ID} into ${patchFile}`);
      report.merged++;
    }
  } else {
    await fs.mkdir(dshDir, { recursive: true });
    await fs.writeFile(patchFile, `${patchFileHeader()}${patchBlock(mcpPath)}`, 'utf8');
    log(`    create ${patchFile} (missing)`);
    report.merged++;
  }

  // 2. AGENTS.md — dsh reads $DSH_HOME/AGENTS.md for every session.
  const agentsSrc = path.join(REPO_ROOT, 'workflow', 'AGENTS.md');
  const agentsDest = path.join(dshDir, 'AGENTS.md');
  if (skipWorkflow) {
    log('    SKIP AGENTS.md (--skip-workflow)');
  } else if (await exists(agentsSrc)) {
    const status = await copyWithForce(agentsSrc, agentsDest, force, log);
    if (status === 'copied') report.copied++;
    else report.skipped++;
  } else {
    report.warnings.push('workflow/AGENTS.md not found in package; AGENTS.md skipped');
  }

  // 3. skills/ — the shared five, then the dsh-only squad skill. Existing
  //    skills are kept (see the FORCE EXCEPTION note in install-skills.mjs).
  const skillsDir = path.join(dshDir, 'skills');
  log('    installing bundled skills (existing ones kept)');
  for (const srcDir of [undefined, DSH_SKILLS_SRC]) {
    const skills = installSkills({ skillsDir, srcDir, log });
    report.copied += skills.copied;
    report.skipped += skills.skipped;
    report.warnings.push(...skills.warnings);
  }

  // 4. The squad prompt library + the 15 workflow bodies.
  if (skipAgents) {
    log('    SKIP squad prompt library (--skip-agents)');
  } else {
    await copyMarkdownDir(
      path.join(REPO_ROOT, 'agents'),
      path.join(dshDir, LIBRARY_DIR, 'agents'),
      force,
      log,
      report,
      'agents/'
    );
    await copyMarkdownDir(
      path.join(REPO_ROOT, 'templates', 'codex', 'prompts'),
      path.join(dshDir, LIBRARY_DIR, 'commands'),
      force,
      log,
      report,
      'templates/codex/prompts'
    );
  }

  log(
    `[dsh] done: copied=${report.copied} skipped=${report.skipped} merged=${report.merged} warnings=${report.warnings.length}`
  );
  return report;
}

export default { install, patchBlock, patchFileHeader, hasPatchRow, isEmptyPatchList, PATCH_ROW_ID };
