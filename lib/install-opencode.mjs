// graphyloop - OpenCode harness installer.
//
// Zero-dependency ESM (Node >= 20). Mirrors the behavior of the original
// setup.mjs for the OpenCode harness:
//   agents/*.md       -> <configDir>/agents        (skip unless --force, bak-ts)
//   plugin/<name>/*   -> <configDir>/plugins/<name> (skip unless --force, bak-ts)
//                         plus a refresh of a legacy
//                         <configDir>/scripts/start-server.ps1 when one exists
//   opencode.json     -> merge plugin entries (config/opencode.plugin.json,
//                         fallback ./plugins/graphyloop/plugin.js), commands
//                         (config/opencode.commands.json, add-missing-only),
//                         default_agent when unset; opencode.jsonc WARN;
//                         bak-ts before write
//   workflow/AGENTS.md -> <configDir>/AGENTS.md     (skip unless --force)
//
// Idempotent re-runs. Uses log() instead of console.log; throws Error (message
// prefixed ERROR:) on fatal failures.
//
// Contract (CONTRACTS.md, B2): export async install(ctx) -> {harness, copied,
// skipped, merged, warnings:[]}.
//
// ctx defaults: configDir = <homeDir>/.config/opencode, graphyloopDir =
// <homeDir>/.graphyloop/graphyloop (both overridable for testability).

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  copyFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSkills } from './install-skills.mjs';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PLUGIN_ENTRY = './plugins/graphyloop/plugin.js';
const DEFAULT_AGENT = 'agent-chadi';

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

// ---------------------------------------------------------------------------
// Steps (semantics identical to setup.mjs steps 3-5)
// ---------------------------------------------------------------------------

/** Install agents/*.md -> configDir/agents. Returns { copied, skipped }. */
function stepAgents(configDir, force, log) {
  log('[opencode/1] Installing agents (24-agent chadi/graphcrew squad)');
  const src = path.join(REPO_ROOT, 'agents');
  const dest = path.join(configDir, 'agents');
  if (!existsSync(src) || !statIsDir(src)) {
    log('    SKIP: agents/ not found in repo');
    return { copied: 0, skipped: 0 };
  }
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src).filter((name) => name.endsWith('.md'));
  let copied = 0;
  let skipped = 0;
  for (const entry of entries) {
    const destFile = path.join(dest, entry);
    if (existsSync(destFile)) {
      if (!force) {
        skipped++;
        log(`    skip  ${entry} (exists; use --force to overwrite)`);
        continue;
      }
      // One timestamp: two calls can straddle a second boundary and log a
      // backup name that does not exist on disk.
      const backup = `${destFile}.bak-${timestamp()}`;
      copyFileSync(destFile, backup);
      log(`    backup ${entry} -> ${path.basename(backup)}`);
    }
    copyFileSync(path.join(src, entry), destFile);
    copied++;
    log(`    copy  ${entry}`);
  }
  if (entries.length === 0) log('    (no .md files found)');
  return { copied, skipped };
}

function statIsDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Install plugin/<name>/* -> configDir/plugins/<name> for every bundled plugin
 * (force-gated, backed up). Returns { copied, skipped }.
 */
function stepPlugin(configDir, force, log) {
  log('[opencode/0] Installing plugins (graphyloop_* tools, server-guard detach)');
  const root = path.join(REPO_ROOT, 'plugin');
  if (!existsSync(root) || !statIsDir(root)) {
    log('    SKIP: plugin/ not found in repo');
    return { copied: 0, skipped: 0 };
  }
  const names = readdirSync(root).filter((name) => statIsDir(path.join(root, name))).sort();
  if (names.length === 0) {
    log('    SKIP: no plugin directories found in repo');
    return { copied: 0, skipped: 0 };
  }

  let copied = 0;
  let skipped = 0;
  for (const name of names) {
    const src = path.join(root, name);
    const dest = path.join(configDir, 'plugins', name);
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src)) {
      if (statIsDir(path.join(src, entry))) continue;
      const destFile = path.join(dest, entry);
      if (existsSync(destFile)) {
        if (!force) {
          skipped++;
          log(`    skip  ${name}/${entry} (exists; use --force to overwrite)`);
          continue;
        }
        const backup = `${destFile}.bak-${timestamp()}`;
        copyFileSync(destFile, backup);
        log(`    backup ${name}/${entry} -> ${path.basename(backup)}`);
      }
      copyFileSync(path.join(src, entry), destFile);
      copied++;
      log(`    copy  ${name}/${entry}`);
    }
  }

  // Legacy layout repair: setups created before the launcher shipped with the
  // kit keep their own <configDir>/scripts/start-server.ps1, and server-guard
  // falls back to it. Refresh that copy so a stale one cannot keep hanging
  // sessions — but never create it, the plugin-local copy is canonical.
  const launcherSrc = path.join(root, 'server-guard', 'start-server.ps1');
  const legacyLauncher = path.join(configDir, 'scripts', 'start-server.ps1');
  if (existsSync(launcherSrc) && existsSync(legacyLauncher)) {
    if (readFileSync(launcherSrc, 'utf8') === readFileSync(legacyLauncher, 'utf8')) {
      log('    ok    scripts/start-server.ps1 (legacy copy already current)');
    } else {
      copyFileSync(legacyLauncher, `${legacyLauncher}.bak-${timestamp()}`);
      copyFileSync(launcherSrc, legacyLauncher);
      copied++;
      log('    update scripts/start-server.ps1 (legacy copy refreshed, backup kept)');
    }
  }

  return { copied, skipped };
}

/**
 * Merge graphyloop plugin entry + graphyloop commands + default_agent into
 * configDir/opencode.json. Preserves every existing key exactly.
 * Returns number of config additions (plugins added + commands added +
 * default_agent set). Throws on unmergeable user config.
 */
function stepConfigMerge(configDir, log, warnings) {
  log('[opencode/2] Merging opencode.json');
  const configFile = path.join(configDir, 'opencode.json');
  const existed = existsSync(configFile);

  let config = {};
  if (existed) {
    try {
      config = JSON.parse(readFileSync(configFile, 'utf8'));
    } catch (err) {
      throw new Error(`ERROR: cannot parse existing ${configFile}: ${err.message}`);
    }
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`ERROR: existing ${configFile} is not a JSON object; refusing to merge`);
    }
  } else {
    log(`    create ${configFile} (missing)`);
  }

  let merged = 0;

  // plugin array: append entries from config/opencode.plugin.json (fallback:
  // the graphyloop plugin entry) when absent.
  let pluginEntries = [PLUGIN_ENTRY];
  const pluginSourceFile = path.join(REPO_ROOT, 'config', 'opencode.plugin.json');
  if (existsSync(pluginSourceFile)) {
    try {
      const parsed = JSON.parse(readFileSync(pluginSourceFile, 'utf8'));
      if (parsed && Array.isArray(parsed.plugin) && parsed.plugin.length > 0) {
        pluginEntries = parsed.plugin;
      }
    } catch (err) {
      throw new Error(`ERROR: cannot parse repo file ${pluginSourceFile}: ${err.message}`);
    }
  }
  const normalizeEntry = (value) =>
    typeof value === 'string' ? value.replace(/^\.\//, '').replace(/[\\/]+$/, '') : value;
  if (config.plugin === undefined) {
    config.plugin = pluginEntries;
    merged += pluginEntries.length;
    log(`    plugin array created with ${pluginEntries.length} entry/entries`);
  } else if (!Array.isArray(config.plugin)) {
    throw new Error('ERROR: config "plugin" exists but is not an array; refusing to touch it');
  } else {
    let added = 0;
    for (const entry of pluginEntries) {
      if (!config.plugin.some((p) => normalizeEntry(p) === normalizeEntry(entry))) {
        config.plugin.push(entry);
        added++;
      }
    }
    merged += added;
    log(`    plugin entries: ${added} added, ${config.plugin.length} total`);
  }

  // opencode.jsonc (if present) takes precedence over opencode.json in
  // OpenCode; warn so the user knows the merge targeted the .json file.
  if (existsSync(path.join(configDir, 'opencode.jsonc'))) {
    log('    WARN: opencode.jsonc detected - it takes precedence over opencode.json. Merge targeted opencode.json; review your .jsonc for the plugin/commands keys.');
    warnings.push('opencode.jsonc detected - it takes precedence over opencode.json; merge targeted opencode.json. Review your .jsonc for the plugin/commands keys.');
  }

  // commands: shallow merge, add missing keys only, never overwrite.
  const commandsSourceFile = path.join(REPO_ROOT, 'config', 'opencode.commands.json');
  if (existsSync(commandsSourceFile)) {
    let cmdSource;
    try {
      cmdSource = JSON.parse(readFileSync(commandsSourceFile, 'utf8'));
    } catch (err) {
      throw new Error(`ERROR: cannot parse repo file ${commandsSourceFile}: ${err.message}`);
    }
    if (cmdSource === null || typeof cmdSource !== 'object' || Array.isArray(cmdSource)) {
      throw new Error(`ERROR: repo file ${commandsSourceFile} is not a JSON object of commands`);
    }
    const commands =
      config.command && typeof config.command === 'object' && !Array.isArray(config.command)
        ? config.command
        : {};
    let added = 0;
    for (const key of Object.keys(cmdSource)) {
      if (!(key in commands)) {
        commands[key] = cmdSource[key];
        added++;
      }
    }
    if (Object.keys(commands).length > 0) config.command = commands;
    merged += added;
    log(`    commands merged: ${added} added, ${Object.keys(commands).length - added} kept (never overwrites user commands)`);
  } else {
    log('    SKIP commands merge: config/opencode.commands.json not found in repo');
  }

  // default_agent: only when unset.
  if (config.default_agent === undefined || config.default_agent === null) {
    config.default_agent = DEFAULT_AGENT;
    merged += 1;
    log(`    default_agent set: ${DEFAULT_AGENT}`);
  } else {
    log(`    default_agent kept: ${config.default_agent}`);
  }

  // Backup + write only when a change was made (no-op re-runs leave config
  // untouched). Write temp + rename so a crash mid-write cannot corrupt the
  // user's config.
  if (merged > 0) {
    if (existed) {
      const backupFile = `${configFile}.bak-${timestamp()}`;
      copyFileSync(configFile, backupFile);
      log(`    backup ${path.basename(configFile)} -> ${path.basename(backupFile)}`);
    }
    const tmpFile = `${configFile}.tmp-${process.pid}`;
    writeFileSync(tmpFile, `${JSON.stringify(config, null, 2)}\n`);
    renameSync(tmpFile, configFile);
    log(`    wrote ${configFile}`);
  } else {
    log('    no config changes needed; opencode.json untouched');
  }
  return merged;
}

/** Install workflow/AGENTS.md -> configDir/AGENTS.md. Returns { installed, skipped }. */
function stepWorkflow(configDir, force, log) {
  log('[opencode/3] Installing workflow rules (AGENTS.md)');
  const src = path.join(REPO_ROOT, 'workflow', 'AGENTS.md');
  const dest = path.join(configDir, 'AGENTS.md');
  if (!existsSync(src)) {
    log('    SKIP: workflow/AGENTS.md not found in repo');
    return { installed: false, skipped: false };
  }
  if (existsSync(dest)) {
    if (!force) {
      log('    skip  AGENTS.md (exists; use --force to overwrite)');
      return { installed: false, skipped: true };
    }
    copyFileSync(dest, `${dest}.bak-${timestamp()}`);
    log('    backup AGENTS.md -> AGENTS.md.bak-<timestamp>');
  }
  copyFileSync(src, dest);
  log(`    copy  AGENTS.md -> ${dest}`);
  return { installed: true, skipped: false };
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * Install the OpenCode harness components.
 *
 * @param {object} ctx
 * @param {string} ctx.homeDir       home directory (used for defaults)
 * @param {boolean} [ctx.force]      overwrite existing files (with backups)
 * @param {boolean} [ctx.skipAgents] skip agents/*.md install
 * @param {boolean} [ctx.skipWorkflow] skip AGENTS.md install
 * @param {boolean} [ctx.noConfigMerge] skip opencode.json merge
 * @param {string} [ctx.configDir]   opencode config root (default <homeDir>/.config/opencode)
 * @param {string} [ctx.graphyloopDir]    graphyloop install dir (default <homeDir>/.graphyloop/graphyloop; informational)
 * @param {(msg:string)=>void} [ctx.log] logger (defaults to console.log)
 * @returns {Promise<{harness:'opencode', copied:number, skipped:number, merged:number, warnings:string[]}>}
 */
export async function install(ctx = {}) {
  const log = ctx.log || ((msg) => console.log(msg));
  const homeDir = ctx.homeDir || process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) throw new Error('ERROR: install-opencode: homeDir is required (set ctx.homeDir)');

  const configDir = ctx.configDir || path.join(homeDir, '.config', 'opencode');
  const graphyloopDir = ctx.graphyloopDir || path.join(homeDir, '.graphyloop', 'graphyloop');
  const force = Boolean(ctx.force);
  const warnings = [];

  mkdirSync(configDir, { recursive: true });

  let copied = 0;
  let skipped = 0;
  let merged = 0;

  if (ctx.skipAgents) {
    log('[opencode/1] SKIP agents (skipAgents)');
  } else {
    const agents = stepAgents(configDir, force, log);
    copied += agents.copied;
    skipped += agents.skipped;

    // Skills the squad references. Never overwrites a skill you already have —
    // see the FORCE EXCEPTION note in lib/install-skills.mjs.
    log('[opencode/1b] Installing bundled skills (existing ones kept)');
    const skills = installSkills({ skillsDir: path.join(configDir, 'skills'), log });
    copied += skills.copied;
    skipped += skills.skipped;
    warnings.push(...skills.warnings);
  }

  const plugin = stepPlugin(configDir, force, log);
  copied += plugin.copied;
  skipped += plugin.skipped;

  if (ctx.noConfigMerge) {
    log('[opencode/2] SKIP config merge (noConfigMerge)');
  } else {
    merged += stepConfigMerge(configDir, log, warnings);
  }

  if (ctx.skipWorkflow) {
    log('[opencode/3] SKIP workflow (skipWorkflow)');
  } else {
    const wf = stepWorkflow(configDir, force, log);
    if (wf.installed) copied += 1;
    if (wf.skipped) skipped += 1;
  }

  return { harness: 'opencode', copied, skipped, merged, warnings };
}
