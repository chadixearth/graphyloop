// =============================================================================
// install-claude.mjs — claude harness installer (graphyloop build contract B3).
//
// Zero-dependency ESM (Node >= 20). Installs into the claude config root:
//   agents/*.md      ← agents/*.md (converted via lib/frontmatter.mjs)
//   commands/chadi-* ← config/opencode.commands.json (12 chadi-* entries)
//   .claude.json     ← mcpServers.graphyloop merged (all other keys preserved)
//   AGENTS.md        ← workflow/AGENTS.md
//
// Rules: never overwrite user config keys; timestamped backups
// (*.bak-YYYYMMDD-HHmmss); idempotent re-runs; ctx.log() instead of
// console.log; throw Error on fatal (message prefixed ERROR:).
//
// install(ctx) → { harness:'claude', copied, skipped, merged, warnings:[] }
//   ctx: { homeDir, force, skipAgents, skipWorkflow, noConfigMerge,
//          configDir, graphyloopDir, log(msg) }
//   - homeDir     (required) root for ~/.claude and ~/.claude.json
//   - configDir   optional override for the claude config root (default
//                 homeDir/.claude) — mirrors the opencode installer semantics
//   - graphyloopDir    accepted for CLI parity; claude MCP path is fixed by the
//                 contract to homeDir/.graphyloop/mcp-server.mjs
// =============================================================================

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeAgentFromSource, claudeCommandFile } from './frontmatter.mjs';
import { installSkills } from './install-skills.mjs';
import { backupFile, matchesContent, matchesFile } from './fsutil.mjs';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AGENTS_SRC = path.join(REPO_ROOT, 'agents');
const COMMANDS_SRC = path.join(REPO_ROOT, 'config', 'opencode.commands.json');
const WORKFLOW_SRC = path.join(REPO_ROOT, 'workflow', 'AGENTS.md');
const MCP_FILE = 'mcp-server.mjs';
const MCP_ENTRY = (mcpPath) => ({ command: 'node', args: [mcpPath] });

function readJson(file, what, log) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`ERROR: cannot parse ${what} ${file}: ${err.message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`ERROR: ${what} ${file} is not a JSON object; refusing to merge`);
  }
  return data;
}

// Ensure homeDir/.graphyloop/mcp-server.mjs exists. install-core normally
// copies it; fall back to copying from the repo so a standalone claude
// install still yields a working MCP entry.
function ensureMcpServer(homeDir, warnings, log) {
  const coreDir = path.join(homeDir, '.graphyloop');
  const mcpPath = path.join(coreDir, MCP_FILE);
  if (existsSync(mcpPath)) return mcpPath;

  const repoMcp = path.join(REPO_ROOT, MCP_FILE);
  if (existsSync(repoMcp)) {
    mkdirSync(coreDir, { recursive: true });
    copyFileSync(repoMcp, mcpPath);
    log(`    copy  ${MCP_FILE} -> ${mcpPath} (install-core fallback)`);
    return mcpPath;
  }

  warnings.push(
    `mcp-server.mjs not found at ${mcpPath} (and not in repo); claude MCP entry will reference it anyway — run install-core first`
  );
  return mcpPath;
}

// Merge mcpServers.graphyloop into homeDir/.claude.json. Preserves every other
// key. Backs up the file before the first write. Idempotent: an identical
// graphyloop entry is left untouched; a different user-configured graphyloop entry is
// kept (never overwritten) with a warning.
function mergeClaudeJson(homeDir, mcpPath, warnings, log) {
  const claudeJson = path.join(homeDir, '.claude.json');
  const existed = existsSync(claudeJson);
  const config = existed ? readJson(claudeJson, 'existing', log) : {};
  const entry = MCP_ENTRY(mcpPath);

  let mcpServers = config.mcpServers;
  if (mcpServers === undefined || mcpServers === null) {
    mcpServers = config.mcpServers = {};
  } else if (typeof mcpServers !== 'object' || Array.isArray(mcpServers)) {
    throw new Error(
      `ERROR: .claude.json "mcpServers" is not an object; refusing to merge`
    );
  }

  let changed = false;
  if (mcpServers.graphyloop === undefined) {
    mcpServers.graphyloop = entry;
    changed = true;
    log('    merge mcpServers.graphyloop -> .claude.json');
  } else if (JSON.stringify(mcpServers.graphyloop) !== JSON.stringify(entry)) {
    warnings.push(
      'mcpServers.graphyloop already configured differently in .claude.json; kept your config'
    );
    log('    keep  mcpServers.graphyloop (user config preserved)');
  } else {
    log('    keep  mcpServers.graphyloop (already installed)');
  }

  if (changed) {
    if (existed) backupFile(claudeJson, log);
    else log(`    create ${path.basename(claudeJson)} (missing)`);
    writeFileSync(claudeJson, `${JSON.stringify(config, null, 2)}\n`);
    log(`    wrote ${claudeJson}`);
  }
  return changed ? 1 : 0;
}

// Convert + install agents/*.md → claudeRoot/agents/*.md.
// Returns { copied, skipped }.
function installAgents(claudeRoot, force, warnings, log) {
  const destDir = path.join(claudeRoot, 'agents');
  mkdirSync(destDir, { recursive: true });

  if (!existsSync(AGENTS_SRC)) {
    warnings.push('agents/ not found in repo');
    return { copied: 0, skipped: 0 };
  }

  let copied = 0;
  let skipped = 0;
  const entries = readdirSync(AGENTS_SRC).filter((n) => n.endsWith('.md')).sort();
  for (const entry of entries) {
    const destFile = path.join(destDir, entry);
    // Rendered up front: the agent file is generated, so "unchanged" has to be
    // judged against what we would write, not against the source .md.
    const sourceText = readFileSync(path.join(AGENTS_SRC, entry), 'utf8');
    const next = claudeAgentFromSource(sourceText, entry);
    if (existsSync(destFile)) {
      if (!force) {
        skipped++;
        log(`    skip  ${entry} (exists; use --force to overwrite)`);
        continue;
      }
      if (matchesContent(destFile, next)) {
        skipped++;
        log(`    same  ${entry} (unchanged)`);
        continue;
      }
      backupFile(destFile, log);
    }
    writeFileSync(destFile, next);
    copied++;
    log(`    copy  ${entry}`);
  }
  if (entries.length === 0) log('    (no .md files found)');
  return { copied, skipped };
}

// Install 12 chadi-* commands → claudeRoot/commands/chadi-*.md.
// Returns { copied, skipped }.
function installCommands(claudeRoot, force, warnings, log) {
  const destDir = path.join(claudeRoot, 'commands');
  mkdirSync(destDir, { recursive: true });

  if (!existsSync(COMMANDS_SRC)) {
    warnings.push('config/opencode.commands.json not found in repo');
    return { copied: 0, skipped: 0 };
  }

  const commands = readJson(COMMANDS_SRC, 'repo file', log);
  const names = Object.keys(commands)
    .filter((k) => k.startsWith('chadi-'))
    .sort();

  let copied = 0;
  let skipped = 0;
  for (const name of names) {
    const cmd = commands[name];
    if (cmd === null || typeof cmd !== 'object') {
      warnings.push(`command "${name}" in opencode.commands.json is not an object; skipped`);
      continue;
    }
    const destFile = path.join(destDir, `${name}.md`);
    const next = claudeCommandFile(name, cmd.description, cmd.template);
    if (existsSync(destFile)) {
      if (!force) {
        skipped++;
        log(`    skip  ${name}.md (exists; use --force to overwrite)`);
        continue;
      }
      if (matchesContent(destFile, next)) {
        skipped++;
        log(`    same  ${name}.md (unchanged)`);
        continue;
      }
      backupFile(destFile, log);
    }
    writeFileSync(destFile, next);
    copied++;
    log(`    copy  ${name}.md`);
  }
  if (names.length === 0) log('    (no chadi-* commands found)');
  return { copied, skipped };
}

// workflow/AGENTS.md → claudeRoot/AGENTS.md (skip unless force).
function installWorkflow(claudeRoot, force, warnings, log) {
  if (!existsSync(WORKFLOW_SRC)) {
    warnings.push('workflow/AGENTS.md not found in repo');
    return { copied: 0, skipped: 0 };
  }
  const destFile = path.join(claudeRoot, 'AGENTS.md');
  if (existsSync(destFile)) {
    if (!force) {
      log('    skip  AGENTS.md (exists; use --force to overwrite)');
      return { copied: 0, skipped: 1 };
    }
    if (matchesFile(destFile, WORKFLOW_SRC)) {
      log('    same  AGENTS.md (unchanged)');
      return { copied: 0, skipped: 1 };
    }
    backupFile(destFile, log);
  }
  copyFileSync(WORKFLOW_SRC, destFile);
  log(`    copy  AGENTS.md -> ${destFile}`);
  return { copied: 1, skipped: 0 };
}

export async function install(ctx) {
  if (!ctx || typeof ctx.homeDir !== 'string' || ctx.homeDir.length === 0) {
    throw new Error('ERROR: install(ctx) requires ctx.homeDir');
  }

  const homeDir = path.resolve(ctx.homeDir);
  const force = !!ctx.force;
  const log = typeof ctx.log === 'function' ? ctx.log : () => {};
  // Claude root is always ~/.claude — --config-dir only affects opencode.
  const claudeRoot = path.join(homeDir, '.claude');

  const warnings = [];
  const report = { harness: 'claude', copied: 0, skipped: 0, merged: 0, warnings };

  mkdirSync(claudeRoot, { recursive: true });
  log(`claude harness`);
  log(`  claude root: ${claudeRoot}`);
  log(`  flags: force=${force} skipAgents=${!!ctx.skipAgents} skipWorkflow=${!!ctx.skipWorkflow} noConfigMerge=${!!ctx.noConfigMerge}`);
  log('');

  if (ctx.skipAgents) {
    log('[1/3] SKIP agents (--skip-agents)');
  } else {
    log('[1/3] Installing claude agents');
    const r = installAgents(claudeRoot, force, warnings, log);
    report.copied += r.copied;
    report.skipped += r.skipped;

    // Skills the squad references. An existing skill directory is kept as-is.
    log('      Installing bundled skills (existing ones kept)');
    const skills = installSkills({ skillsDir: path.join(claudeRoot, 'skills'), log });
    report.copied += skills.copied;
    report.skipped += skills.skipped;
    warnings.push(...skills.warnings);
  }

  log('');
  if (ctx.noConfigMerge) {
    log('[2/3] SKIP .claude.json merge (--no-config-merge)');
  } else {
    log('[2/3] Installing commands + merging .claude.json');
    const r = installCommands(claudeRoot, force, warnings, log);
    report.copied += r.copied;
    report.skipped += r.skipped;

    const mcpPath = ensureMcpServer(homeDir, warnings, log);
    report.merged += mergeClaudeJson(homeDir, mcpPath, warnings, log);
  }

  log('');
  if (ctx.skipWorkflow) {
    log('[3/3] SKIP workflow (--skip-workflow)');
  } else {
    log('[3/3] Installing workflow (AGENTS.md)');
    const r = installWorkflow(claudeRoot, force, warnings, log);
    report.copied += r.copied;
    report.skipped += r.skipped;
  }

  return report;
}
