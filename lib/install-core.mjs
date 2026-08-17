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
import { matchesFile } from './fsutil.mjs';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * lib/ files the installed tree cannot run without. Exported so `graphyloop
 * update`/`doctor` can check an existing install for drift instead of guessing.
 */
export const CORE_LIB_FILES = ['mcp.mjs', 'engine.mjs', 'secrets.mjs', 'stack.mjs', 'planner.mjs'];

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
        // Already byte-identical: rewriting it would only mint a dead backup.
        if (matchesFile(destPath, srcPath)) {
          skipped++;
          log(`    same  ${entry} (unchanged)`);
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
    // Already byte-identical: rewriting it would only mint a dead backup.
    // `update` forces, so without this every update left 7 more core backups.
    if (matchesFile(dest, src)) {
      log(`    same  ${path.basename(dest)} (unchanged)`);
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
    // The installed tree mirrors the repo's relative shape:
    //   ~/.graphyloop/mcp-server.mjs     -> ./lib/mcp.mjs
    //   ~/.graphyloop/lib/mcp.mjs        -> ./engine.mjs
    //   ~/.graphyloop/lib/mcp.mjs        -> ../package.json
    //   ~/.graphyloop/graphyloop/cli.mjs -> ../lib/engine.mjs
    // so every entry point resolves the engine with one import specifier.
    // engine.mjs is not optional: without it both the CLI and the MCP server
    // fail to load. Neither are secrets/stack/planner — engine.mjs imports them
    // statically, so a tree missing one of them cannot even be imported. That is
    // the drift `graphyloop update` detects and repairs.
    // package.json is not optional either: lib/mcp.mjs derives serverInfo.version
    // from it so the version can never drift from the tree that was installed.
    for (const name of CORE_LIB_FILES) {
      const libSrc = path.join(REPO_ROOT, 'lib', name);
      const libDest = path.join(homeDir, '.graphyloop', 'lib', name);
      if (existsSync(libSrc)) {
        r = copyFile(libSrc, libDest, force, log);
        copied += r.copied;
        skipped += r.skipped;
      } else {
        log(`    WARN: lib/${name} not found in repo; the installed CLI and MCP server will fail to load`);
        warnings.push(`lib/${name} not found in repo; installed entry points cannot resolve their imports`);
      }
    }
    const pkgSrc = path.join(REPO_ROOT, 'package.json');
    if (existsSync(pkgSrc)) {
      r = copyFile(pkgSrc, path.join(homeDir, '.graphyloop', 'package.json'), force, log);
      copied += r.copied;
      skipped += r.skipped;
    }
  }

  return { harness: 'core', copied, skipped, merged: 0, warnings };
}
