// graphyloop - core install: graphyloop adapter, plugin, and MCP server under ~/.graphyloop.
//
// Zero-dependency ESM (Node >= 20). Copies:
//   adapter/*           -> <graphyloopDir>                  (default ~/.graphyloop/graphyloop)
//   plugin/graphyloop/*      -> ~/.graphyloop/plugins/graphyloop
//   mcp-server.mjs      -> ~/.graphyloop/mcp-server.mjs (repo root entry, B1)
//
// Force-gated with timestamped backups (*.bak-YYYYMMDD-HHmmss). Idempotent:
// re-running without --force skips existing files. Uses log() instead of
// console.log; throws Error (message prefixed ERROR:) only on fatal failures.
//
// Contract (CONTRACTS.md, B2): export async install(ctx) -> {harness, copied,
// skipped, merged, warnings:[]}.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  unlinkSync,
  copyFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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

function isDirectory(p) {
  try {
    return lstatSync(p).isDirectory();
  } catch {
    return false;
  }
}

function backup(dest, log) {
  const backupPath = `${dest}.bak-${timestamp()}`;
  copyFileSync(dest, backupPath);
  log(`    backup ${path.basename(dest)} -> ${path.basename(backupPath)}`);
  return backupPath;
}

/**
 * Recursive directory copy with force guard + timestamped backups.
 * `filter(name)` gates individual files (directories are always recursed).
 * Returns { copied, skipped, missing }.
 */
function copyDir(src, dest, force, log, filter) {
  if (!isDirectory(src)) return { copied: 0, skipped: 0, missing: true };
  mkdirSync(dest, { recursive: true });
  let copied = 0;
  let skipped = 0;
  for (const entry of readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (isDirectory(srcPath)) {
      const sub = copyDir(srcPath, destPath, force, log, filter);
      copied += sub.copied;
      skipped += sub.skipped;
    } else if (filter && !filter(entry)) {
      continue;
    } else {
      // Never write through a symlinked dest (would clobber the link target).
      let destIsLink = false;
      try { destIsLink = lstatSync(destPath).isSymbolicLink(); } catch { /* missing */ }
      if (destIsLink) {
        unlinkSync(destPath);
        log(`    replace symlink ${entry}`);
      } else if (existsSync(destPath)) {
        if (!force) {
          skipped++;
          log(`    skip  ${entry} (exists; use --force to overwrite)`);
          continue;
        }
        backup(destPath, log);
      }
      copyFileSync(srcPath, destPath);
      copied++;
    }
  }
  return { copied, skipped, missing: false };
}

/**
 * Single-file copy with force guard + timestamped backup.
 * Returns { copied, skipped }.
 */
function copyFile(src, dest, force, log) {
  if (existsSync(dest)) {
    if (!force) {
      log(`    skip  ${path.basename(dest)} (exists; use --force to overwrite)`);
      return { copied: 0, skipped: 1 };
    }
    backup(dest, log);
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  log(`    copy  ${path.basename(dest)} -> ${dest}`);
  return { copied: 1, skipped: 0 };
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * Install the core graphyloop adapter, plugin, and MCP server.
 *
 * @param {object} ctx
 * @param {string} ctx.homeDir      home directory (authoritative for ~/.graphyloop)
 * @param {boolean} [ctx.force]     overwrite existing files (with backups)
 * @param {string} [ctx.graphyloopDir]   override adapter target dir
 * @param {(msg:string)=>void} [ctx.log] logger (defaults to console.log)
 * @returns {Promise<{harness:'core', copied:number, skipped:number, merged:number, warnings:string[]}>}
 */
export async function install(ctx = {}) {
  const log = ctx.log || ((msg) => console.log(msg));
  const homeDir = ctx.homeDir || process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) throw new Error('ERROR: install-core: homeDir is required (set ctx.homeDir)');

  const graphyloopDir = ctx.graphyloopDir || path.join(homeDir, '.graphyloop', 'graphyloop');
  const pluginsDir = path.join(homeDir, '.graphyloop', 'plugins', 'graphyloop');
  const mcpDest = path.join(homeDir, '.graphyloop', 'mcp-server.mjs');
  const force = Boolean(ctx.force);

  const warnings = [];
  let copied = 0;
  let skipped = 0;

  log('[core/1] Installing graphyloop adapter (swarm + memory engine)');
  const adapterSrc = path.join(REPO_ROOT, 'adapter');
  // Runtime only. adapter/*.ts is a TypeScript design reference that nothing
  // imports and no build step compiles — installing it would put ~1.3k lines of
  // unrunnable code into every user's ~/.graphyloop.
  let r = copyDir(adapterSrc, graphyloopDir, force, log, (name) => name.endsWith('.mjs'));
  if (r.missing) {
    log('    SKIP: adapter/ not found in repo');
    warnings.push('adapter/ not found in repo; graphyloop CLI not installed');
  } else {
    copied += r.copied;
    skipped += r.skipped;
    log(`    ${r.copied} file(s) -> ${graphyloopDir}`);
  }

  log('[core/2] Installing graphyloop plugin (graphyloop_* tools)');
  const pluginSrc = path.join(REPO_ROOT, 'plugin', 'graphyloop');
  r = copyDir(pluginSrc, pluginsDir, force, log);
  if (r.missing) {
    log('    SKIP: plugin/graphyloop/ not found in repo');
    warnings.push('plugin/graphyloop/ not found in repo; graphyloop plugin not installed');
  } else {
    copied += r.copied;
    skipped += r.skipped;
    log(`    ${r.copied} file(s) -> ${pluginsDir}`);
  }

  log('[core/3] Installing MCP server (mcp-server.mjs + lib/mcp.mjs)');
  const mcpSrc = path.join(REPO_ROOT, 'mcp-server.mjs');
  if (!existsSync(mcpSrc)) {
    log('    SKIP: mcp-server.mjs not found in repo (core MCP server not built yet)');
    warnings.push('mcp-server.mjs not found in repo; MCP server not installed');
  } else {
    r = copyFile(mcpSrc, mcpDest, force, log);
    copied += r.copied;
    skipped += r.skipped;
    // The installed entry imports ./lib/mcp.mjs — ship the library alongside.
    const libSrc = path.join(REPO_ROOT, 'lib', 'mcp.mjs');
    const libDest = path.join(homeDir, '.graphyloop', 'lib', 'mcp.mjs');
    if (existsSync(libSrc)) {
      r = copyFile(libSrc, libDest, force, log);
      copied += r.copied;
      skipped += r.skipped;
    } else {
      log('    WARN: lib/mcp.mjs not found in repo; installed MCP server will fail');
      warnings.push('lib/mcp.mjs not found in repo; installed MCP server cannot resolve its import');
    }
  }

  return { harness: 'core', copied, skipped, merged: 0, warnings };
}
