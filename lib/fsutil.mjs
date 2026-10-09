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

const NODE_COMMAND = /^node(\.exe)?$/i;

/**
 * True for an MCP entry graphyloop itself would have written: `node` (or a path
 * to a node binary) with exactly one argument, a path ending in mcp-server.mjs.
 * Extra keys (enabled, env, ...) do not matter; they are the user's.
 */
export function isGraphyloopShaped(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (typeof entry.command !== 'string') return false;
  if (!NODE_COMMAND.test(path.basename(entry.command.replace(/\\/g, '/')))) return false;
  return Array.isArray(entry.args)
    && entry.args.length === 1
    && typeof entry.args[0] === 'string'
    && entry.args[0].endsWith('mcp-server.mjs');
}

/** Path equality that survives slash style and (on Windows) letter case. */
export function sameServerPath(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const norm = (p) => {
    const r = path.resolve(p);
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return norm(a) === norm(b);
}

/**
 * Judge an existing `mcpServers.graphyloop` entry against the server path we
 * would write now.
 *   'same'   graphyloop-shaped and already pointing at `mcpPath`
 *   'stale'  graphyloop-shaped but pointing somewhere else (moved/old install)
 *   'custom' anything else: the user's own configuration
 */
export function classifyMcpEntry(entry, mcpPath) {
  if (!isGraphyloopShaped(entry)) return 'custom';
  return sameServerPath(entry.args[0], mcpPath) ? 'same' : 'stale';
}

/** The repaired form of a stale entry: only the server path changes. */
export function repairedMcpEntry(entry, mcpPath) {
  return { ...entry, args: [mcpPath] };
}

/**
 * Merge `mcpServers.graphyloop = entry` into a JSON MCP config, keeping every
 * other key (disabledServers, other servers, user settings). Writes only when
 * something changed; backs up an existing file first.
 *
 * - An empty / whitespace-only file is `{}`; a UTF-8 BOM is ignored.
 * - A file that cannot be used (JSONC comments, not an object, ...) never
 *   aborts the install: a warning with the snippet to add by hand is raised and
 *   the merge is skipped. The user's file is not touched.
 * - A graphyloop-shaped entry pointing at another path is repaired (backup
 *   first); an entry the user customised is kept with a warning.
 *
 * @returns {number} 1 when the file was written, else 0
 */
export function mergeMcpServerJson(file, entry, { warnings, log }) {
  const label = path.basename(file);
  const existed = existsSync(file);
  const manual = (reason) => {
    warnings.push(
      `could not parse ${label} (${reason}); add the graphyloop MCP entry by hand: ${JSON.stringify({ mcpServers: { graphyloop: entry } })}`,
    );
    log(`    WARN  ${label} not merged (${reason})`);
    return 0;
  };

  let config = {};
  if (existed) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch (err) {
      return manual(err.message);
    }
    text = text.replace(/^\uFEFF/, '');
    if (text.trim() !== '') {
      try {
        config = JSON.parse(text);
      } catch (err) {
        return manual(err.message);
      }
    }
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      return manual('not a JSON object');
    }
  }
  let servers = config.mcpServers;
  if (servers === undefined || servers === null) {
    servers = {};
  } else if (typeof servers !== 'object' || Array.isArray(servers)) {
    return manual('"mcpServers" is not an object');
  }

  const current = servers.graphyloop;
  let next;
  if (current === undefined) {
    next = { ...config, mcpServers: { ...servers, graphyloop: entry } };
  } else {
    const state = classifyMcpEntry(current, entry.args[0]);
    if (state === 'same') {
      log(`    keep  ${label} mcpServers.graphyloop (already installed)`);
      return 0;
    }
    if (state === 'custom') {
      warnings.push(`mcpServers.graphyloop already configured differently in ${label}; kept your config`);
      log(`    keep  ${label} mcpServers.graphyloop (user config preserved)`);
      return 0;
    }
    next = { ...config, mcpServers: { ...servers, graphyloop: repairedMcpEntry(current, entry.args[0]) } };
    log(`    repair ${label} mcpServers.graphyloop (pointed at ${current.args[0]})`);
  }

  if (existed) backupFile(file, log);
  else mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  log(`    ${existed ? 'merge' : 'create'} mcpServers.graphyloop -> ${file}`);
  return 1;
}
