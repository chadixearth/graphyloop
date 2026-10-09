// graphyloop — bundled skills installer.
//
// Copies skills/<name>/** into a harness skill root:
//   OpenCode: <config>/skills/<name>/SKILL.md
//   Claude:   ~/.claude/skills/<name>/SKILL.md
//   dsh:      ~/.dsh/skills/<name>/SKILL.md  (+ the dsh-only squad skill from
//             templates/dsh/skills, passed as ctx.srcDir)
//
// Why the squad ships skills at all: every agent references skills by name, and
// on a fresh machine none of them exist — the agent then correctly reports "skill
// missing" and falls back, which means a freshly installed workflow is weaker than
// the one it advertises. Eleven of them are graphyloop-authored (graphyloop-waves,
// api-contract-design, api-hardening, frontend-security, web-accessibility,
// web-performance, dependency-audit, supabase-setup, vercel-deploy,
// secrets-hygiene, swarm-memory); since 0.3.0 the full personal library
// (65 skills: design systems, branding, video, research, workflow, domain packs)
// also ships as a snapshot from chadixearth/opencode-skills, so every agent skill
// reference resolves on a fresh install. Third-party collections (superpowers,
// GSAP, three.js) are included as the user's curated copies.
//
// OWNERSHIP RULE (deliberate): a skill directory that is not provably graphyloop's
// is NEVER overwritten, not even with --force. Users install skills from several
// collections into the same tree, and several of these names exist there too (a
// superpowers `tdd-workflow`, a personal `security-review`). Clobbering a user's
// own skill to install ours would be a data-loss bug dressed as an upgrade.
//
// "Provably ours" = the skill directory carries `.graphyloop-manifest.json`
// ({version, files:{<rel>: sha256}}, written by this installer) and every file it
// lists still hashes to the recorded value. Such a skill is simply an older copy
// of what we ship, so it is refreshed in place whenever the shipped version
// differs (install or update, no --force needed). Edit one file and the whole
// skill becomes yours: it is kept.
//
// One migration case: skills installed before manifests existed have none. On a
// forced run (`graphyloop update`) the graphyloop-AUTHORED ones (AUTHORED_SKILLS
// in lib/engine.mjs) are copied to `<skills root>/../.graphyloop-skill-backups/
// <skill>.bak-<timestamp>` and replaced. The backup sits OUTSIDE the skills root
// on purpose: harnesses load every directory there that holds a SKILL.md, so an
// in-root backup would surface as a duplicate skill of the same name.
// Third-party bundled skills without a manifest are kept, as are all of them on
// a plain install. A copy that is already byte-identical to the shipped one just
// gets its manifest written.
//
// Contract: installSkills(ctx) -> {copied, skipped, warnings:[], installed, kept,
//                                   refreshed, backedUp}

import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTHORED_SKILLS } from './engine.mjs';
import { timestamp } from './fsutil.mjs';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SKILLS_SRC = path.join(REPO_ROOT, 'skills');

/** Per-skill ownership record written next to SKILL.md. */
export const SKILL_MANIFEST = '.graphyloop-manifest.json';

let packageVersion = null;
function pkgVersion() {
  if (packageVersion === null) {
    try {
      packageVersion = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version || '0.0.0';
    } catch {
      packageVersion = '0.0.0';
    }
  }
  return packageVersion;
}

/**
 * dsh-only skill source root. The DeepSeek Harness has no agent files and no
 * file-based slash commands, so the squad reaches it as one skill that names the
 * `mcp__graphyloop__*` tools and the installed prompt library. Installing that
 * skill into OpenCode or Claude would be wrong — they have the real agents — so
 * it lives outside skills/ and only install-dsh.mjs passes this root.
 */
export const DSH_SKILLS_SRC = path.join(REPO_ROOT, 'templates', 'dsh', 'skills');

/** Resolve a skill source root: default = the shipped skills/ directory. */
function sourceRoot(srcDir) {
  return srcDir ? path.resolve(srcDir) : SKILLS_SRC;
}

/**
 * Skill names graphyloop ships. Exported so doctor/update/tests read one list.
 *
 * @param {string} [srcDir] alternate source root (e.g. templates/dsh/skills)
 */
export function bundledSkills(srcDir) {
  const root = sourceRoot(srcDir);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => {
      try { return lstatSync(path.join(root, name)).isDirectory(); } catch { return false; }
    })
    .filter((name) => existsSync(path.join(root, name, 'SKILL.md')))
    .sort();
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** sha256 hex of a file's bytes, or null when unreadable. */
export function hashFile(file) {
  try { return sha256(readFileSync(file)); } catch { return null; }
}

/** Regular files under a skill dir as Map(posix rel path -> absolute path); the manifest is excluded. */
function listFiles(root) {
  const out = new Map();
  const walk = (dir, rel) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (!rel && entry === SKILL_MANIFEST) continue;
      const full = path.join(dir, entry);
      const relPath = rel ? `${rel}/${entry}` : entry;
      let stat;
      try { stat = lstatSync(full); } catch { continue; }
      if (stat.isDirectory()) walk(full, relPath);
      else if (stat.isFile()) out.set(relPath, full);
    }
  };
  walk(root, '');
  return out;
}

/** Map(rel -> sha256) of a skill directory's files. */
function hashFiles(root) {
  const out = new Map();
  for (const [rel, full] of listFiles(root)) {
    try { out.set(rel, sha256(readFileSync(full))); } catch { /* unreadable: treated as absent */ }
  }
  return out;
}

/** The parsed manifest of an installed skill dir, or null when absent/invalid. */
export function readSkillManifest(dir) {
  try {
    const data = JSON.parse(readFileSync(path.join(dir, SKILL_MANIFEST), 'utf8'));
    if (!data || typeof data !== 'object' || !data.files || typeof data.files !== 'object' || Array.isArray(data.files)) return null;
    for (const hash of Object.values(data.files)) if (typeof hash !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

function writeManifest(dir, hashes) {
  const files = Object.fromEntries([...hashes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeFileSync(path.join(dir, SKILL_MANIFEST), `${JSON.stringify({ version: pkgVersion(), files }, null, 2)}\n`);
}

/** Copy every regular file of `src` into `dest` (creating dirs); returns the file count. */
function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  let copied = 0;
  for (const [rel, from] of listFiles(src)) {
    const to = path.join(dest, ...rel.split('/'));
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
    copied++;
  }
  return copied;
}

/** True when `have` holds every (rel, hash) of `want`. */
function containsAll(have, want) {
  for (const [rel, hash] of want) if (have.get(rel) !== hash) return false;
  return true;
}

function sameHashes(a, b) {
  return a.size === b.size && containsAll(a, b);
}

/**
 * Install the bundled skills into one skill root.
 *
 * @param {object} ctx
 * @param {string} ctx.skillsDir        target root (…/skills)
 * @param {string} [ctx.srcDir]         alternate source root (default: skills/)
 * @param {boolean} [ctx.force]         forced run (`update`): enables the legacy
 *                                      authored-skill backup + replace
 * @param {(msg:string)=>void} [ctx.log]
 * @returns {{copied:number, skipped:number, warnings:string[], installed:string[], kept:string[], refreshed:string[], backedUp:string[]}}
 */
export function installSkills(ctx = {}) {
  const log = ctx.log || (() => {});
  const skillsDir = ctx.skillsDir;
  const src = sourceRoot(ctx.srcDir);
  const result = { copied: 0, skipped: 0, warnings: [], installed: [], kept: [], refreshed: [], backedUp: [] };
  if (!skillsDir) {
    result.warnings.push('installSkills: ctx.skillsDir is required');
    return result;
  }
  const names = bundledSkills(src);
  if (names.length === 0) {
    result.warnings.push(`${path.relative(REPO_ROOT, src) || 'skills'}/ not found in package; no skills installed`);
    return result;
  }
  const authored = new Set(AUTHORED_SKILLS);

  const keep = (name, why) => {
    result.skipped++;
    result.kept.push(name);
    log(`    keep  skills/${name} (${why})`);
  };

  for (const name of names) {
    const from = path.join(src, name);
    const dest = path.join(skillsDir, name);
    const wanted = hashFiles(from);

    if (!existsSync(dest)) {
      const copied = copyTree(from, dest);
      writeManifest(dest, wanted);
      result.copied += copied;
      result.installed.push(name);
      log(`    copy  skills/${name} (${copied} file(s))`);
      continue;
    }

    let isDir = false;
    try { isDir = lstatSync(dest).isDirectory(); } catch { /* not a dir */ }
    if (!isDir) {
      keep(name, 'already present — your copy is kept');
      continue;
    }

    const have = hashFiles(dest);
    const manifest = readSkillManifest(dest);

    if (manifest) {
      const recorded = new Map(Object.entries(manifest.files));
      if (!containsAll(have, recorded)) {
        keep(name, 'already present, edited since install — your copy is kept');
        continue;
      }
      if (sameHashes(recorded, wanted)) {
        result.skipped++;
        log(`    same  skills/${name} (unchanged)`);
        continue;
      }
      // Untouched older copy: bring it up to the shipped version in place.
      let written = 0;
      for (const [rel, file] of listFiles(from)) {
        if (have.get(rel) === wanted.get(rel)) continue;
        const to = path.join(dest, ...rel.split('/'));
        mkdirSync(path.dirname(to), { recursive: true });
        copyFileSync(file, to);
        written++;
      }
      for (const rel of recorded.keys()) {
        if (wanted.has(rel)) continue;
        try { unlinkSync(path.join(dest, ...rel.split('/'))); written++; } catch { /* already gone */ }
      }
      writeManifest(dest, wanted);
      result.copied += written;
      result.refreshed.push(name);
      log(`    update skills/${name} (${written} file(s) changed)`);
      continue;
    }

    // No manifest: installed by an older graphyloop (or by the user).
    if (containsAll(have, wanted)) {
      writeManifest(dest, wanted);
      result.skipped++;
      log(`    same  skills/${name} (unchanged; now tracked)`);
      continue;
    }
    if (ctx.force && authored.has(name)) {
      const backup = path.join(path.dirname(skillsDir), '.graphyloop-skill-backups', `${name}.bak-${timestamp()}`);
      copyTree(dest, backup);
      rmSync(dest, { recursive: true, force: true });
      const copied = copyTree(from, dest);
      writeManifest(dest, wanted);
      result.copied += copied;
      result.refreshed.push(name);
      result.backedUp.push(name);
      log(`    replace skills/${name} (graphyloop-authored, older untracked copy; backup ${path.basename(backup)})`);
      continue;
    }
    keep(name, 'already present — your copy is kept');
  }
  return result;
}

/**
 * Content map (relative path -> utf8) for uninstall's byte-identical matching.
 *
 * @param {string} [srcDir] alternate source root (default: skills/)
 */
export function skillFiles(srcDir) {
  const src = sourceRoot(srcDir);
  const map = new Map();
  for (const name of bundledSkills(src)) {
    const root = path.join(src, name);
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

export default { installSkills, bundledSkills, skillFiles, readSkillManifest, hashFile, SKILL_MANIFEST, DSH_SKILLS_SRC };
