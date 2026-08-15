// graphyloop — bundled skills installer.
//
// Copies skills/<name>/** into a harness skill root:
//   OpenCode: <config>/skills/<name>/SKILL.md
//   Claude:   ~/.claude/skills/<name>/SKILL.md
//
// Why the squad ships skills at all: every agent references skills by name, and
// on a fresh machine none of them exist — the agent then correctly reports "skill
// missing" and falls back, which means a freshly installed workflow is weaker than
// the one it advertises. These five are graphyloop-authored (no third-party
// content) and cover the parts of the workflow the squad cannot get anywhere else.
//
// FORCE EXCEPTION (deliberate): an existing skill directory is NEVER overwritten,
// not even with --force. Users install skills from several collections into the
// same tree, and several of these names exist there too (a superpowers
// `tdd-workflow`, a personal `security-review`). Clobbering a user's own skill to
// install ours would be a data-loss bug dressed as an upgrade. Everything else in
// graphyloop is force-refreshable; skills are opt-in per name.
//
// Contract: installSkills(ctx) -> {copied, skipped, warnings:[]}

import { existsSync, mkdirSync, readdirSync, lstatSync, copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SKILLS_SRC = path.join(REPO_ROOT, 'skills');

/** Skill names graphyloop ships. Exported so doctor/update/tests read one list. */
export function bundledSkills() {
  if (!existsSync(SKILLS_SRC)) return [];
  return readdirSync(SKILLS_SRC)
    .filter((name) => {
      try { return lstatSync(path.join(SKILLS_SRC, name)).isDirectory(); } catch { return false; }
    })
    .filter((name) => existsSync(path.join(SKILLS_SRC, name, 'SKILL.md')))
    .sort();
}

/** Recursive copy used only for a skill directory that does not exist yet. */
function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  let copied = 0;
  for (const entry of readdirSync(src)) {
    const from = path.join(src, entry);
    const to = path.join(dest, entry);
    let stat;
    try { stat = lstatSync(from); } catch { continue; }
    if (stat.isDirectory()) copied += copyTree(from, to);
    else if (stat.isFile()) { copyFileSync(from, to); copied++; }
  }
  return copied;
}

/**
 * Install the bundled skills into one skill root.
 *
 * @param {object} ctx
 * @param {string} ctx.skillsDir        target root (…/skills)
 * @param {(msg:string)=>void} [ctx.log]
 * @returns {{copied:number, skipped:number, warnings:string[], installed:string[], kept:string[]}}
 */
export function installSkills(ctx = {}) {
  const log = ctx.log || (() => {});
  const skillsDir = ctx.skillsDir;
  const result = { copied: 0, skipped: 0, warnings: [], installed: [], kept: [] };
  if (!skillsDir) {
    result.warnings.push('installSkills: ctx.skillsDir is required');
    return result;
  }
  const names = bundledSkills();
  if (names.length === 0) {
    result.warnings.push('skills/ not found in package; no skills installed');
    return result;
  }

  for (const name of names) {
    const dest = path.join(skillsDir, name);
    if (existsSync(dest)) {
      // The user's own copy of this skill wins — see FORCE EXCEPTION above.
      result.skipped++;
      result.kept.push(name);
      log(`    keep  skills/${name} (already present — your copy is kept)`);
      continue;
    }
    const copied = copyTree(path.join(SKILLS_SRC, name), dest);
    result.copied += copied;
    result.installed.push(name);
    log(`    copy  skills/${name} (${copied} file(s))`);
  }
  return result;
}

/** Content map (relative path -> utf8) for uninstall's byte-identical matching. */
export function skillFiles() {
  const map = new Map();
  for (const name of bundledSkills()) {
    const root = path.join(SKILLS_SRC, name);
    const walk = (dir, rel) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        const relPath = rel ? path.join(rel, entry) : entry;
        let stat;
        try { stat = lstatSync(full); } catch { continue; }
        if (stat.isDirectory()) walk(full, relPath);
        else if (stat.isFile()) {
          try { map.set(path.join(name, relPath), readFileSync(full, 'utf8')); } catch { /* skip */ }
        }
      }
    };
    walk(root, '');
  }
  return map;
}

export default { installSkills, bundledSkills, skillFiles };
