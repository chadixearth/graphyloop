// =============================================================================
// install-gemini.mjs — Gemini CLI harness installer.
//
// Zero-dependency ESM (Node >= 20). Installs into ~/.gemini (rooted at
// ctx.homeDir):
//   settings.json         ← mcpServers.graphyloop merged; user keys preserved
//   commands/<name>.toml  ← the chadi-* commands from
//                           config/opencode.commands.json (`$ARGUMENTS` →
//                           `{{args}}`)
//   GEMINI.md             ← workflow rules, ONLY when absent. A differing
//                           GEMINI.md is the user's and is never touched, even
//                           with --force (which `update` always sets).
//
// Gemini CLI has no file-based agents or skills, so none are written.
//
// install(ctx) → { harness:'gemini', copied, skipped, merged, warnings:[] }
// =============================================================================

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geminiCommandFile } from './frontmatter.mjs';
import { ensureMcpServer } from './install-claude.mjs';
import { mergeMcpServerJson, writeGenerated, writeRulesIfAbsent } from './fsutil.mjs';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const COMMANDS_SRC = path.join(REPO_ROOT, 'config', 'opencode.commands.json');
const WORKFLOW_SRC = path.join(REPO_ROOT, 'workflow', 'AGENTS.md');

/** Gemini CLI root for a home dir: ~/.gemini. */
export function geminiRoot(homeDir) {
  return path.join(homeDir, '.gemini');
}

/** Expected `<name>.toml` -> content for every shipped chadi-* command. */
export function geminiCommandFiles() {
  const out = new Map();
  if (!existsSync(COMMANDS_SRC)) return out;
  let commands;
  try {
    commands = JSON.parse(readFileSync(COMMANDS_SRC, 'utf8'));
  } catch {
    return out;
  }
  for (const name of Object.keys(commands).filter((k) => k.startsWith('chadi-')).sort()) {
    const cmd = commands[name];
    if (cmd && typeof cmd === 'object' && typeof cmd.template === 'string') {
      out.set(`${name}.toml`, geminiCommandFile(name, cmd.description, cmd.template));
    }
  }
  return out;
}

export async function install(ctx) {
  if (!ctx || typeof ctx.homeDir !== 'string' || ctx.homeDir.length === 0) {
    throw new Error('ERROR: install(ctx) requires ctx.homeDir');
  }
  const homeDir = path.resolve(ctx.homeDir);
  const force = !!ctx.force;
  const log = typeof ctx.log === 'function' ? ctx.log : () => {};
  const root = geminiRoot(homeDir);

  const warnings = [];
  const report = { harness: 'gemini', copied: 0, skipped: 0, merged: 0, warnings };
  const tally = (status) => { if (status === 'copied') report.copied++; else report.skipped++; };

  mkdirSync(root, { recursive: true });
  log('[gemini] installing into ' + root);

  // 1. commands
  if (ctx.skipAgents) {
    log('  SKIP commands (--skip-agents)');
  } else {
    log('  commands');
    const files = geminiCommandFiles();
    if (files.size === 0) warnings.push('config/opencode.commands.json not found or has no chadi-* commands');
    for (const [file, content] of files) {
      tally(writeGenerated(path.join(root, 'commands', file), content, force, log));
    }
  }

  // 2. MCP entry
  if (ctx.noConfigMerge) {
    log('  SKIP settings.json merge (--no-config-merge)');
  } else {
    log('  settings.json');
    const mcpPath = ensureMcpServer(homeDir, warnings, log);
    report.merged += mergeMcpServerJson(
      path.join(root, 'settings.json'),
      { command: 'node', args: [mcpPath] },
      { warnings, log },
    );
  }

  // 3. workflow rules — never clobbered
  if (ctx.skipWorkflow) {
    log('  SKIP GEMINI.md (--skip-workflow)');
  } else if (!existsSync(WORKFLOW_SRC)) {
    warnings.push('workflow/AGENTS.md not found in package; GEMINI.md skipped');
  } else {
    log('  GEMINI.md');
    tally(writeRulesIfAbsent(path.join(root, 'GEMINI.md'), WORKFLOW_SRC, {
      hint: 'graphyloop workflow rules were not added (copy workflow/AGENTS.md from the graphyloop package to include them)',
      warnings,
      log,
    }));
  }

  log(`[gemini] done: copied=${report.copied} skipped=${report.skipped} merged=${report.merged} warnings=${warnings.length}`);
  return report;
}

export default { install, geminiRoot, geminiCommandFiles };
