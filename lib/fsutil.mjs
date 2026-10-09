// Shared write helpers for the installers.
//
// Every installer force-gates its writes and keeps a timestamped backup of
// whatever it replaced. That is right when the file actually changed — and pure
// waste when it did not. `--force` used to back up and rewrite files whose bytes
// already matched the source, so a single forced re-install of all five
// harnesses minted 143 dead *.bak-* copies. They never get pruned, so they
// accumulate: 599 stale backups across ~/.claude, ~/.config/opencode and
// ~/.graphyloop before this landed, 176 of them in one agents/ directory.
//
// An unchanged file is now left alone — nothing written, nothing backed up — so
// re-running `npx graphyloop@latest` is close to free and stops littering the
// config tree. install-opencode's legacy-launcher branch already worked this
// way; these helpers generalize that check to every installer.
//
// Zero-dependency ESM (Node >= 20), same as the rest of lib/.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Backup suffix stamp: YYYYMMDD-HHmmss, local time. */
export function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function toBuffer(content) {
  return Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
}

/**
 * True when `dest` already holds exactly `content`.
 *
 * Byte compare, not text: agent and skill files are copied verbatim, and a
 * decoded-string compare would silently treat a real CRLF or BOM difference as
 * "unchanged" and leave a stale file in place.
 *
 * A missing or unreadable dest reads as "different" so the caller writes it.
 */
export function matchesContent(dest, content) {
  try {
    return readFileSync(dest).equals(toBuffer(content));
  } catch {
    return false;
  }
}

/** True when `dest` is a byte-for-byte copy of the file at `src`. */
export function matchesFile(dest, src) {
  try {
    return readFileSync(dest).equals(readFileSync(src));
  } catch {
    return false;
  }
}

/** Async twin of matchesFile, for the fs/promises installers. */
export async function matchesFileAsync(dest, src) {
  try {
    const [current, next] = await Promise.all([fs.readFile(dest), fs.readFile(src)]);
    return current.equals(next);
  } catch {
    return false;
  }
}

/**
 * Copy `file` aside as `<file>.bak-<timestamp>` and log it.
 *
 * One timestamp per call: computing it twice can straddle a second boundary and
 * log a backup name that does not exist on disk.
 */
export function backupFile(file, log) {
  const bak = `${file}.bak-${timestamp()}`;
  copyFileSync(file, bak);
  log(`    backup ${path.basename(file)} -> ${path.basename(bak)}`);
  return bak;
}

/** Async twin of backupFile, for the fs/promises installers. */
export async function backupFileAsync(file, log) {
  const bak = `${file}.bak-${timestamp()}`;
  await fs.copyFile(file, bak);
  log(`    backup ${path.basename(file)} -> ${path.basename(bak)}`);
  return bak;
}

/**
 * Write generated `content` to `dest` with the installer force-gate:
 * missing -> write; present + no force -> keep; present + force + identical ->
 * no write and no backup; present + force + different -> backup then write.
 *
 * @returns {'copied'|'skipped'}
 */
export function writeGenerated(dest, content, force, log) {
  const label = path.basename(dest);
  if (existsSync(dest)) {
    if (!force) {
      log(`    skip  ${label} (exists; use --force to overwrite)`);
      return 'skipped';
    }
    if (matchesContent(dest, content)) {
      log(`    same  ${label} (unchanged)`);
      return 'skipped';
    }
    backupFile(dest, log);
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, content);
  log(`    copy  ${label}`);
  return 'copied';
}

/**
 * Install a workflow rules file ONLY when absent. A file the user already has
 * is never replaced — not even under --force, which `update` always sets — so
 * harnesses with their own rules file (omp AGENTS.md, Gemini GEMINI.md) keep
 * the user's instructions. A differing file produces a warning, not a write.
 *
 * @returns {'copied'|'skipped'}
 */
export function writeRulesIfAbsent(dest, srcFile, { hint, warnings, log }) {
  const label = path.basename(dest);
  if (existsSync(dest)) {
    if (matchesFile(dest, srcFile)) {
      log(`    same  ${label} (unchanged)`);
    } else {
      log(`    keep  ${label} (yours; graphyloop never overwrites it)`);
      warnings.push(`kept your ${label}; ${hint}`);
    }
    return 'skipped';
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(srcFile, dest);
  log(`    copy  ${label} -> ${dest}`);
  return 'copied';
}

/**
 * Merge `mcpServers.graphyloop = entry` into a JSON MCP config, keeping every
 * other key (disabledServers, other servers, user settings). Writes only when
 * something changed; backs up an existing file first; an existing graphyloop
 * entry the user configured differently is kept with a warning.
 *
 * @returns {number} 1 when the file was written, else 0
 */
export function mergeMcpServerJson(file, entry, { warnings, log }) {
  const label = path.basename(file);
  const existed = existsSync(file);
  let config = {};
  if (existed) {
    try {
      config = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`ERROR: cannot parse ${file}: ${err.message}`);
    }
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`ERROR: ${file} is not a JSON object; refusing to merge`);
    }
  }
  let servers = config.mcpServers;
  if (servers === undefined || servers === null) {
    servers = {};
  } else if (typeof servers !== 'object' || Array.isArray(servers)) {
    throw new Error(`ERROR: ${file} "mcpServers" is not an object; refusing to merge`);
  }

  const current = servers.graphyloop;
  if (current !== undefined) {
    const same = current && typeof current === 'object'
      && current.command === entry.command
      && JSON.stringify(current.args) === JSON.stringify(entry.args);
    if (same) {
      log(`    keep  ${label} mcpServers.graphyloop (already installed)`);
    } else {
      warnings.push(`mcpServers.graphyloop already configured differently in ${label}; kept your config`);
      log(`    keep  ${label} mcpServers.graphyloop (user config preserved)`);
    }
    return 0;
  }

  const next = { ...config, mcpServers: { ...servers, graphyloop: entry } };
  if (existed) backupFile(file, log);
  else mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  log(`    ${existed ? 'merge' : 'create'} mcpServers.graphyloop -> ${file}`);
  return 1;
}
