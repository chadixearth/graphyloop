// =============================================================================
// install-omp.mjs — Oh My Pi (`omp`) harness installer.
//
// Zero-dependency ESM (Node >= 20). Installs into the omp agent root
// (~/.omp/agent, rooted at ctx.homeDir):
//   agents/*.md   ← agents/*.md, frontmatter reduced to name + description (no
//                   model, so every agent inherits the user's omp model)
//   skills/       ← bundled skills (an existing skill is never overwritten)
//   mcp.json      ← mcpServers.graphyloop merged; every other key is kept
//                   (disabledServers, other servers, ...)
//   AGENTS.md     ← workflow rules, ONLY when absent. omp users keep their own
//                   AGENTS.md; a differing file is never touched, even with
//                   --force (which `update` always sets) — a warning is raised.
//
// install(ctx) → { harness:'omp', copied, skipped, merged, warnings:[] }
// =============================================================================

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ompAgentFromSource } from './frontmatter.mjs';
import { installSkills } from './install-skills.mjs';
import { ensureMcpServer } from './install-claude.mjs';
import { mergeMcpServerJson, writeGenerated, writeRulesIfAbsent } from './fsutil.mjs';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AGENTS_SRC = path.join(REPO_ROOT, 'agents');
const WORKFLOW_SRC = path.join(REPO_ROOT, 'workflow', 'AGENTS.md');

/** omp agent root for a home dir: ~/.omp/agent. */
export function ompAgentRoot(homeDir) {
  return path.join(homeDir, '.omp', 'agent');
}

export async function install(ctx) {
  if (!ctx || typeof ctx.homeDir !== 'string' || ctx.homeDir.length === 0) {
    throw new Error('ERROR: install(ctx) requires ctx.homeDir');
  }
  const homeDir = path.resolve(ctx.homeDir);
  const force = !!ctx.force;
  const log = typeof ctx.log === 'function' ? ctx.log : () => {};
  const root = ompAgentRoot(homeDir);

  const warnings = [];
  const report = { harness: 'omp', copied: 0, skipped: 0, merged: 0, warnings };
  const tally = (status) => { if (status === 'copied') report.copied++; else report.skipped++; };

  mkdirSync(root, { recursive: true });
  log('[omp] installing into ' + root);

  // 1. agents + skills
  if (ctx.skipAgents) {
    log('  SKIP agents + skills (--skip-agents)');
  } else if (!existsSync(AGENTS_SRC)) {
    warnings.push('agents/ not found in package');
  } else {
    log('  agents');
    const entries = readdirSync(AGENTS_SRC).filter((n) => n.endsWith('.md')).sort();
    for (const entry of entries) {
      const next = ompAgentFromSource(readFileSync(path.join(AGENTS_SRC, entry), 'utf8'), entry);
      tally(writeGenerated(path.join(root, 'agents', entry), next, force, log));
    }
    log('  skills (existing ones kept)');
    const skills = installSkills({ skillsDir: path.join(root, 'skills'), log });
    report.copied += skills.copied;
    report.skipped += skills.skipped;
    warnings.push(...skills.warnings);
  }

  // 2. MCP entry
  if (ctx.noConfigMerge) {
    log('  SKIP mcp.json merge (--no-config-merge)');
  } else {
    log('  mcp.json');
    const mcpPath = ensureMcpServer(homeDir, warnings, log);
    report.merged += mergeMcpServerJson(
      path.join(root, 'mcp.json'),
      { command: 'node', args: [mcpPath] },
      { warnings, log },
    );
  }

  // 3. workflow rules — never clobbered
  if (ctx.skipWorkflow) {
    log('  SKIP AGENTS.md (--skip-workflow)');
  } else if (!existsSync(WORKFLOW_SRC)) {
    warnings.push('workflow/AGENTS.md not found in package; AGENTS.md skipped');
  } else {
    log('  AGENTS.md');
    tally(writeRulesIfAbsent(path.join(root, 'AGENTS.md'), WORKFLOW_SRC, {
      hint: 'graphyloop rules are in skill graphyloop-workflow',
      warnings,
      log,
    }));
  }

  log(`[omp] done: copied=${report.copied} skipped=${report.skipped} merged=${report.merged} warnings=${warnings.length}`);
  return report;
}

export default { install, ompAgentRoot };
