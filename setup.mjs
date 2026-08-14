#!/usr/bin/env node
// =============================================================================
// graphyloop - one-command installer for the OpenCode agentic workflow kit.
//
// Zero-dependency Node script (Node >= 20, ESM). Uses only builtin modules:
// node:fs, node:path, node:os (+ node:url for import.meta.url resolution).
// Cross-platform (Windows + POSIX). Safe to re-run: every step is idempotent.
//
// Usage:
//   node setup.mjs [--config-dir DIR] [--graphyloop-dir DIR] [--force]
//                  [--skip-agents] [--skip-workflow] [--no-config-merge]
//
// Defaults:
//   config-dir = ~/.config/opencode   (OpenCode config root)
//   graphyloop-dir  = ~/.opencode/graphyloop    (must match plugin.js expectation)
//
// Exit codes: 0 = success (final line GRAPH_LOOP_INSTALLED), 1 = failure.
// =============================================================================

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode');
const DEFAULT_GRAPHYLOOP_DIR = path.join(os.homedir(), '.opencode', 'graphyloop');
const PLUGIN_ENTRY = './plugins/graphyloop/plugin.js';
const DEFAULT_AGENT = 'agent-chadi';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    configDir: DEFAULT_CONFIG_DIR,
    graphyloopDir: DEFAULT_GRAPHYLOOP_DIR,
    force: false,
    skipAgents: false,
    skipWorkflow: false,
    noConfigMerge: false,
  };

  const matches = (arg, flag) => arg === flag || arg.startsWith(`${flag}=`);
  const valueOf = (arg, flag, index) => {
    if (arg.startsWith(`${flag}=`)) return { value: arg.slice(flag.length + 1), next: index };
    return { value: argv[index + 1], next: index + 1 };
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') opts.force = true;
    else if (arg === '--skip-agents') opts.skipAgents = true;
    else if (arg === '--skip-workflow') opts.skipWorkflow = true;
    else if (arg === '--no-config-merge') opts.noConfigMerge = true;
    else if (matches(arg, '--config-dir')) {
      const t = valueOf(arg, '--config-dir', i);
      opts.configDir = t.value;
      i = t.next;
    } else if (matches(arg, '--graphyloop-dir')) {
      const t = valueOf(arg, '--graphyloop-dir', i);
      opts.graphyloopDir = t.value;
      i = t.next;
    }
    // Unknown flags are ignored (forward compatibility).
  }

  if (typeof opts.configDir !== 'string' || opts.configDir.length === 0) {
    throw new Error('--config-dir requires a directory argument');
  }
  if (typeof opts.graphyloopDir !== 'string' || opts.graphyloopDir.length === 0) {
    throw new Error('--graphyloop-dir requires a directory argument');
  }

  // Resolve relative paths against the current working directory.
  opts.configDir = path.resolve(process.cwd(), opts.configDir);
  opts.graphyloopDir = path.resolve(process.cwd(), opts.graphyloopDir);
  return opts;
}

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
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Recursive directory copy with --force guard + timestamped backups.
// Returns { copied, missing }.
function copyDir(src, dest, force) {
  if (!isDirectory(src)) return { copied: 0, missing: true };
  mkdirSync(dest, { recursive: true });
  let copied = 0;
  for (const entry of readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (isDirectory(srcPath)) {
      copied += copyDir(srcPath, destPath, force).copied;
    } else {
      if (existsSync(destPath)) {
        if (!force) {
          console.log(`    skip  ${entry} (exists; use --force to overwrite)`);
          continue;
        }
      const backup = `${destPath}.bak-${timestamp()}`;
      copyFileSync(destPath, backup);
      console.log(`    backup ${entry} -> ${path.basename(backup)}`);
      }
      copyFileSync(srcPath, destPath);
      copied++;
    }
  }
  return { copied, missing: false };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
function step1Adapter(graphyloopDir, force) {
  console.log('[1/6] Installing graphyloop adapter (swarm + memory engine)');
  const src = path.join(REPO_ROOT, 'adapter');
  const { copied, missing } = copyDir(src, graphyloopDir, force);
  if (missing) {
    console.log('    SKIP: adapter/ not found in repo');
    return { copied: 0 };
  }
  console.log(`    ${copied} file(s) -> ${graphyloopDir}`);
  return { copied };
}

function step2Plugin(configDir, force) {
  console.log('[2/6] Installing graphyloop plugin (OpenCode graphyloop_* tools)');
  const src = path.join(REPO_ROOT, 'plugin', 'graphyloop');
  const dest = path.join(configDir, 'plugins', 'graphyloop');
  const { copied, missing } = copyDir(src, dest, force);
  if (missing) {
    console.log('    SKIP: plugin/graphyloop/ not found in repo');
    return { copied: 0 };
  }
  console.log(`    ${copied} file(s) -> ${dest}`);
  return { copied };
}

function step3Agents(configDir, force) {
  console.log('[3/6] Installing agents (24-agent chadi/graphcrew squad)');
  const src = path.join(REPO_ROOT, 'agents');
  const dest = path.join(configDir, 'agents');
  if (!isDirectory(src)) {
    console.log('    SKIP: agents/ not found in repo');
    return { copied: 0, skipped: 0, missing: true };
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
        console.log(`    skip  ${entry} (exists; use --force to overwrite)`);
        continue;
      }
      copyFileSync(destFile, `${destFile}.bak-${timestamp()}`);
      console.log(`    backup ${entry} -> ${entry}.bak-${timestamp()}`);
    }
    copyFileSync(path.join(src, entry), destFile);
    copied++;
    console.log(`    copy  ${entry}`);
  }
  if (entries.length === 0) console.log('    (no .md files found)');
  return { copied, skipped };
}

// Merge graphyloop plugin entry + graphyloop commands + default_agent into
// config-dir/opencode.json. Preserves every existing key exactly.
function step4ConfigMerge(configDir) {
  console.log('[4/6] Merging opencode.json');
  const configFile = path.join(configDir, 'opencode.json');
  const existed = existsSync(configFile);

  let config = {};
  if (existed) {
    try {
      config = JSON.parse(readFileSync(configFile, 'utf8'));
    } catch (err) {
      throw new Error(`cannot parse existing ${configFile}: ${err.message}`);
    }
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`existing ${configFile} is not a JSON object; refusing to merge`);
    }
  } else {
    console.log(`    create ${configFile} (missing)`);
  }

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
      throw new Error(`cannot parse repo file ${pluginSourceFile}: ${err.message}`);
    }
  }
  const normalizeEntry = (value) =>
    typeof value === 'string' ? value.replace(/^\.\//, '').replace(/[\\/]+$/, '') : value;
  if (config.plugin === undefined) {
    config.plugin = pluginEntries;
    console.log(`    plugin array created with ${pluginEntries.length} entry/entries`);
  } else if (!Array.isArray(config.plugin)) {
    throw new Error('config "plugin" exists but is not an array; refusing to touch it');
  } else {
    let added = 0;
    for (const entry of pluginEntries) {
      if (!config.plugin.some((p) => normalizeEntry(p) === normalizeEntry(entry))) {
        config.plugin.push(entry);
        added++;
      }
    }
    console.log(`    plugin entries: ${added} added, ${config.plugin.length} total`);
  }

  // opencode.jsonc (if present) takes precedence over opencode.json in
  // OpenCode; warn so the user knows the merge targeted the .json file.
  if (existsSync(path.join(configDir, 'opencode.jsonc'))) {
    console.log('    WARN: opencode.jsonc detected - it takes precedence over opencode.json. Merge targeted opencode.json; review your .jsonc for the plugin/commands keys.');
  }

  // commands: shallow merge, add missing keys only, never overwrite.
  const commandsSourceFile = path.join(REPO_ROOT, 'config', 'opencode.commands.json');
  if (existsSync(commandsSourceFile)) {
    let cmdSource;
    try {
      cmdSource = JSON.parse(readFileSync(commandsSourceFile, 'utf8'));
    } catch (err) {
      throw new Error(`cannot parse repo file ${commandsSourceFile}: ${err.message}`);
    }
    if (cmdSource === null || typeof cmdSource !== 'object' || Array.isArray(cmdSource)) {
      throw new Error(`repo file ${commandsSourceFile} is not a JSON object of commands`);
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
    console.log(`    commands merged: ${added} added, ${Object.keys(commands).length - added} kept (never overwrites user commands)`);
  } else {
    console.log('    SKIP commands merge: config/opencode.commands.json not found in repo');
  }

  // default_agent: only when unset.
  if (config.default_agent === undefined || config.default_agent === null) {
    config.default_agent = DEFAULT_AGENT;
    console.log(`    default_agent set: ${DEFAULT_AGENT}`);
  } else {
    console.log(`    default_agent kept: ${config.default_agent}`);
  }

  // Backup existing config before writing.
  if (existed) {
    const backupFile = `${configFile}.bak-${timestamp()}`;
    copyFileSync(configFile, backupFile);
    console.log(`    backup ${path.basename(configFile)} -> ${path.basename(backupFile)}`);
  }
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`    wrote ${configFile}`);
}

function step5Workflow(configDir, force) {
  console.log('[5/6] Installing workflow rules (AGENTS.md)');
  const src = path.join(REPO_ROOT, 'workflow', 'AGENTS.md');
  const dest = path.join(configDir, 'AGENTS.md');
  if (!existsSync(src)) {
    console.log('    SKIP: workflow/AGENTS.md not found in repo');
    return { installed: false, skipped: false };
  }
  if (existsSync(dest)) {
    if (!force) {
      console.log('    skip  AGENTS.md (exists; use --force to overwrite)');
      return { installed: false, skipped: true };
    }
    copyFileSync(dest, `${dest}.bak-${timestamp()}`);
    console.log('    backup AGENTS.md -> AGENTS.md.bak-<timestamp>');
  }
  copyFileSync(src, dest);
  console.log(`    copy  AGENTS.md -> ${dest}`);
  return { installed: true, skipped: false };
}

function step6Summary(report) {
  console.log('[6/6] Summary');
  const rows = [
    ['component', 'source', 'destination'],
    ['graphyloop adapter', 'adapter/*', report.graphyloopDir],
    ['graphyloop plugin', 'plugin/graphyloop/*', path.join(report.configDir, 'plugins', 'graphyloop')],
    ['agents', 'agents/*.md', path.join(report.configDir, 'agents')],
    ['opencode.json', 'merged', path.join(report.configDir, 'opencode.json')],
    ['AGENTS.md', 'workflow/AGENTS.md', path.join(report.configDir, 'AGENTS.md')],
  ];
  const width = rows.reduce((acc, row) => Math.max(acc, row[0].length), 0);
  for (const [col, source, dest] of rows) {
    console.log(`  ${col.padEnd(width)}  ${source.padEnd(16)}  ${dest}`);
  }
  console.log('');
  console.log('Next steps:');
  console.log('  1. Restart OpenCode.');
  console.log('  2. Open a real project (not your home or system directory).');
  console.log('  3. Ask agent-chadi to run /chadi-init.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('graphyloop installer');
  console.log(`  repo root:  ${REPO_ROOT}`);
  console.log(`  config-dir: ${opts.configDir}`);
  console.log(`  graphyloop-dir:  ${opts.graphyloopDir}`);
  console.log(`  flags: force=${opts.force} skip-agents=${opts.skipAgents} skip-workflow=${opts.skipWorkflow} no-config-merge=${opts.noConfigMerge}`);
  console.log('');

  mkdirSync(opts.configDir, { recursive: true });
  mkdirSync(opts.graphyloopDir, { recursive: true });

  const report = { configDir: opts.configDir, graphyloopDir: opts.graphyloopDir };

  step1Adapter(opts.graphyloopDir, opts.force);
  step2Plugin(opts.configDir, opts.force);

  if (opts.skipAgents) {
    console.log('[3/6] SKIP agents (--skip-agents)');
  } else {
    step3Agents(opts.configDir, opts.force);
  }

  if (opts.noConfigMerge) {
    console.log('[4/6] SKIP config merge (--no-config-merge)');
  } else {
    step4ConfigMerge(opts.configDir);
  }

  if (opts.skipWorkflow) {
    console.log('[5/6] SKIP workflow (--skip-workflow)');
  } else {
    step5Workflow(opts.configDir, opts.force);
  }

  step6Summary(report);
  console.log('');
  console.log('GRAPH_LOOP_INSTALLED');
}

try {
  main();
  process.exitCode = 0;
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exitCode = 1;
}
