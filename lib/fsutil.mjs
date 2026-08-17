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

import { copyFileSync, readFileSync } from 'node:fs';
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
