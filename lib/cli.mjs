#!/usr/bin/env node
// graphyloop - multi-harness CLI (B6).
//
// Zero-dependency ESM (Node >= 20). Entry point for the npx CLI
// (bin/graphyloop.mjs) and the legacy setup.mjs delegate.
//
// Subcommands:
//   install   install graphyloop core + harness adapters (per-harness installers)
//   doctor    detect installed harnesses and print a table (always exit 0)
//   status    show graphyloop swarm status via the core CLI (if installed)
//   uninstall remove only what graphyloop added (keeps user data + backups)
//   mcp       run the MCP stdio server (delegates to lib/mcp.mjs)
//
// Flags (unknown flags ignored, forward compat):
//   --harness opencode|claude|codex|cursor|all (default: all detected; "all" forces all four)
//   --home DIR (default os.homedir(); overrides ALL harness root resolution)
//   --force, --skip-agents, --skip-workflow, --no-config-merge,
//   --config-dir DIR, --graphyloop-dir DIR, --json, --version, --help
//
// Exit codes: 0 ok, 1 error (prints `ERROR: ...` on stderr).

import { existsSync, readFileSync, readdirSync, statSync, lstatSync, unlinkSync, rmdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// cli.mjs lives in lib/, so the repo root is two levels up.
const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLUGIN_ENTRY = './plugins/graphyloop/plugin.js';
const DEFAULT_AGENT = 'agent-chadi';

const HARNESS_NAMES = ['opencode', 'claude', 'codex', 'cursor'];

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/**
 * @param {string[]} argv
 * @returns {object} normalized options (unknown flags ignored)
 */
export function parseArgs(argv) {
  const opts = {
    command: null,
    harness: undefined,
    home: os.homedir(),
    configDir: null,
    graphyloopDir: null,
    force: false,
    skipAgents: false,
    skipWorkflow: false,
    noConfigMerge: false,
    json: false,
    help: false,
    version: false,
  };

  // Returns { value, next } for `--flag value` and `--flag=value` forms.
  const flagValue = (i, flag) => {
    const arg = argv[i];
    if (arg.startsWith(`${flag}=`)) return { value: arg.slice(flag.length + 1), next: i };
    return { value: argv[i + 1] ?? null, next: i + 1 };
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    if (arg === '--version' || arg === '-v') { opts.version = true; continue; }
    if (arg === '--force') { opts.force = true; continue; }
    if (arg === '--skip-agents') { opts.skipAgents = true; continue; }
    if (arg === '--skip-workflow') { opts.skipWorkflow = true; continue; }
    if (arg === '--no-config-merge') { opts.noConfigMerge = true; continue; }
    if (arg === '--json') { opts.json = true; continue; }
    if (arg === '--harness' || arg.startsWith('--harness=')) {
      const t = flagValue(i, '--harness');
      if (t.value) opts.harness = t.value;
      i = t.next;
      continue;
    }
    if (arg === '--home' || arg.startsWith('--home=')) {
      const t = flagValue(i, '--home');
      if (t.value) opts.home = t.value;
      i = t.next;
      continue;
    }
    if (arg === '--config-dir' || arg.startsWith('--config-dir=')) {
      const t = flagValue(i, '--config-dir');
      if (t.value) opts.configDir = t.value;
      i = t.next;
      continue;
    }
    if (arg === '--graphyloop-dir' || arg.startsWith('--graphyloop-dir=')) {
      const t = flagValue(i, '--graphyloop-dir');
      if (t.value) opts.graphyloopDir = t.value;
      i = t.next;
      continue;
    }
    if (arg.startsWith('-')) continue; // unknown flag: ignored (forward compat)
    if (opts.command === null) opts.command = arg;
    // extra positional args are ignored (forward compat)
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Help / version
// ---------------------------------------------------------------------------

function helpText() {
  return `graphyloop ${PKG.version} - agentic workflow kit for any AI coding harness

Usage:
  graphyloop install [--harness opencode|claude|codex|cursor|all] [flags]
  graphyloop doctor
  graphyloop status [--json]
  graphyloop uninstall [--harness ...] [--home DIR]
  graphyloop mcp
  graphyloop --version | --help

Commands:
  install    Detect installed harnesses and install graphyloop core + adapters.
             --harness all (default) installs every harness detected under
             --home; an explicit harness name installs it regardless.
  doctor     Detect harnesses and print a table (present / configPath). Exit 0.
  status     Print graphyloop swarm status via the core CLI (~/.graphyloop/graphyloop/cli.mjs).
  uninstall  Remove only what graphyloop added (never user data; backups kept).
  mcp        Run the MCP stdio server (8 graphyloop tools).

Flags:
  --harness <name>       opencode | claude | codex | cursor | all (default all)
  --home <DIR>           Home directory to install into (default os.homedir()).
                         Overrides ALL harness root resolution.
  --force                Overwrite existing files (timestamped backups made).
  --skip-agents          Skip agent/prompt file install.
  --skip-workflow        Skip AGENTS.md rule install.
  --no-config-merge      Skip opencode.json merge (plugin/commands/default_agent).
  --config-dir <DIR>     OpenCode config root (default <home>/.config/opencode).
  --graphyloop-dir <DIR>      GraphyLoop adapter target (default <home>/.graphyloop/graphyloop).
  --json                 Machine-readable output where supported (status).
  --version, --help      Print version / this help and exit 0.

Exit codes: 0 ok, 1 error. Unknown flags are ignored (forward compat).
`;
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

const HARNESS_MODULES = {
  opencode: './install-opencode.mjs',
  claude: './install-claude.mjs',
  codex: './install-codex.mjs',
  cursor: './install-cursor.mjs',
};

function resolveDir(value, cwd) {
  return value ? path.resolve(cwd, value) : null;
}

/**
 * Select harness names to operate on. 'all' -> every harness currently
 * detected under homeDir; an explicit name -> just that harness.
 */
function selectHarnesses(opts, detected) {
  if (opts.harness !== 'all') {
    if (opts.harness === undefined) {
      // No --harness flag: install for every harness that is present.
      return detected.filter((h) => h.present).map((h) => h.name);
    }
    if (!HARNESS_NAMES.includes(opts.harness)) {
      throw new Error(`unknown harness "${opts.harness}" (expected one of: ${HARNESS_NAMES.join(', ')}, all)`);
    }
    return [opts.harness];
  }
  // --harness all: install for all four harnesses regardless of detection
  // (fresh machines have no harness configs yet).
  return HARNESS_NAMES;
}

async function cmdInstall(opts, stdout, stderr) {
  const detect = await import('./detect.mjs');
  const detected = detect.detectHarnesses(opts.home);
  const present = new Map(detected.map((h) => [h.name, h.present]));
  const names = selectHarnesses(opts, detected);
  if (names.length === 0) {
    stdout.write(`No harnesses detected under ${opts.home}. Install one first (opencode, claude, codex or cursor), or pass --harness all to install for all four harnesses regardless.\n`);
  }

  const ctx = {
    homeDir: opts.home,
    force: opts.force,
    skipAgents: opts.skipAgents,
    skipWorkflow: opts.skipWorkflow,
    noConfigMerge: opts.noConfigMerge,
    configDir: resolveDir(opts.configDir, process.cwd()),
    graphyloopDir: resolveDir(opts.graphyloopDir, process.cwd()),
    log: (msg) => stdout.write(`${msg}\n`),
  };

  stdout.write(`graphyloop installer (${PKG.version})\n`);
  stdout.write(`  home:    ${opts.home}\n`);
  stdout.write(`  harness: ${names.length ? names.join(', ') : '(none detected)'}\n`);
  stdout.write('\n');

  const results = [];
  const warnings = [];

  // Core first (adapter + plugin + MCP server under ~/.graphyloop).
  const core = await import('./install-core.mjs');
  results.push(await core.install(ctx));

  for (const name of names) {
    let mod;
    try {
      mod = await import(HARNESS_MODULES[name]);
    } catch (err) {
      const detail = err && err.code === 'ERR_MODULE_NOT_FOUND'
        ? `installer for harness "${name}" not built yet (${HARNESS_MODULES[name]})`
        : (err && err.message ? err.message : String(err));
      throw new Error(`failed to load ${HARNESS_MODULES[name]}: ${detail}`);
    }
    if (typeof mod.install !== 'function') {
      throw new Error(`${HARNESS_MODULES[name]} does not export install(ctx)`);
    }
    const res = await mod.install(ctx);
    results.push(res);
    if (res.warnings && res.warnings.length) warnings.push(...res.warnings.map((w) => `[${res.harness}] ${w}`));
  }

  // Per-harness report rows.
  stdout.write('\nInstall report:\n');
  const rows = results.map((r) => ({
    harness: r.harness,
    present: r.harness === 'core' ? '-' : present.get(r.harness) ? 'yes' : 'no',
    copied: r.copied ?? 0,
    skipped: r.skipped ?? 0,
    merged: r.merged ?? 0,
    warnings: (r.warnings && r.warnings.length) || 0,
  }));
  const pad = (s, w) => String(s).padEnd(w);
  const w0 = Math.max(...rows.map((r) => r.harness.length)) + 1;
  stdout.write(`  ${pad('harness', w0)} ${pad('present', 8)} ${pad('copied', 7)} ${pad('skipped', 8)} ${pad('merged', 7)} warnings\n`);
  for (const r of rows) {
    stdout.write(`  ${pad(r.harness, w0)} ${pad(r.present, 8)} ${pad(r.copied, 7)} ${pad(r.skipped, 8)} ${pad(r.merged, 7)} ${r.warnings}\n`);
  }
  for (const w of warnings) stdout.write(`  WARN: ${w}\n`);

  stdout.write('\nNext steps:\n');
  stdout.write('  1. Restart your harness(es).\n');
  stdout.write('  2. Open a real project (not your home or system directory).\n');
  stdout.write('  3. Ask the primary agent to run /chadi-init.\n');
  stdout.write('\nGRAPH_LOOP_INSTALLED\n');
  return 0;
}

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------

async function cmdDoctor(opts, stdout, stderr) {
  const detect = await import('./detect.mjs');
  const harnesses = detect.detectHarnesses(opts.home);
  const pad = (s, w) => String(s).padEnd(w);
  const w0 = Math.max(...harnesses.map((h) => h.name.length)) + 1;
  const w1 = Math.max(...harnesses.map((h) => (h.present ? 'present' : 'absent').length), 'present'.length) + 2;
  stdout.write(`graphyloop doctor (${PKG.version}) - harness detection for ${opts.home}\n`);
  stdout.write(`  ${pad('harness', w0)} ${pad('present', w1)} configPath\n`);
  for (const h of harnesses) {
    stdout.write(`  ${pad(h.name, w0)} ${pad(h.present ? 'present' : 'absent', w1)} ${h.configPath ?? '(n/a)'}\n`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async function cmdStatus(opts, stdout, stderr) {
  const detect = await import('./detect.mjs');
  const cliPath = detect.GRAPHYLOOP_CLI_PATH(opts.home);
  if (!existsSync(cliPath)) {
    stderr.write(`ERROR: graphyloop CLI not found at ${cliPath}. Run: npx graphyloop install\n`);
    return 1;
  }
  const node = detect.findNode();
  const r = spawnSync(node, [cliPath, 'status'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (r.error) {
    stderr.write(`ERROR: failed to run graphyloop CLI: ${r.error.message}\n`);
    return 1;
  }
  if (r.status !== 0) {
    if (r.stderr) stderr.write(r.stderr.endsWith('\n') ? r.stderr : `${r.stderr}\n`);
    stderr.write(`ERROR: graphyloop CLI exited with status ${r.status}\n`);
    return 1;
  }
  if (!opts.json) {
    stdout.write(`graphyloop status (${cliPath}):\n`);
  }
  stdout.write(r.stdout.endsWith('\n') ? r.stdout : `${r.stdout}\n`);
  return 0;
}

// ---------------------------------------------------------------------------
// Uninstall (removes only what graphyloop added; keeps user data + backups)
// ---------------------------------------------------------------------------

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function backupFile(file, log) {
  const bak = `${file}.bak-${timestamp()}`;
  copyFileSync(file, bak);
  log(`    backup ${file} -> ${path.basename(bak)}`);
  return bak;
}

function repoFiles(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith(ext));
}

/**
 * Remove files under `dir` whose basename exists in `expected` (Map name ->
 * content) AND whose content is byte-identical to the expected graphyloop
 * copy. User-edited files are skipped. Skip *.bak-* (keep backups).
 * Symlinks are unlinked as links, never recursed into.
 */
function removeMatching(dir, expected, log, removed) {
  if (!existsSync(dir) || !expected || expected.size === 0) return;
  for (const entry of readdirSync(dir)) {
    if (entry.includes('.bak-')) continue;
    if (!expected.has(entry)) continue;
    const full = path.join(dir, entry);
    let st;
    try { st = lstatSync(full); } catch { continue; }
    if (st.isSymbolicLink()) {
      try {
        unlinkSync(full);
        removed.push(full);
        log(`    remove symlink ${full}`);
      } catch (err) {
        log(`    WARN: could not remove ${full}: ${err.message}`);
      }
      continue;
    }
    if (!st.isFile()) continue;
    let cur;
    try { cur = readFileSync(full, 'utf8'); } catch { continue; }
    if (cur === expected.get(entry)) {
      try {
        unlinkSync(full);
        removed.push(full);
        log(`    remove ${full}`);
      } catch (err) {
        log(`    WARN: could not remove ${full}: ${err.message}`);
      }
    } else {
      log(`    skip ${full}: content differs from the graphyloop copy (user-modified)`);
    }
  }
}

/** Read a repo dir into a Map(name -> utf8 content) for content-matching. */
function contentMap(dir, ext) {
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(ext)) continue;
    try { map.set(name, readFileSync(path.join(dir, name), 'utf8')); } catch { /* skip unreadable */ }
  }
  return map;
}

/** Remove a tree keeping *.bak-* files; prune now-empty directories. Symlinks unlinked, never recursed. */
function removeTreeKeepingBackups(dir, log, removed) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry.includes('.bak-')) continue;
    const full = path.join(dir, entry);
    let st;
    try { st = lstatSync(full); } catch { continue; }
    if (st.isSymbolicLink()) {
      try {
        unlinkSync(full);
        removed.push(full);
        log(`    remove symlink ${full}`);
      } catch (err) {
        log(`    WARN: could not remove ${full}: ${err.message}`);
      }
      continue;
    }
    if (st.isDirectory()) {
      removeTreeKeepingBackups(full, log, removed);
    } else {
      try {
        unlinkSync(full);
        removed.push(full);
        log(`    remove ${full}`);
      } catch (err) {
        log(`    WARN: could not remove ${full}: ${err.message}`);
      }
    }
  }
  try {
    if (readdirSync(dir).length === 0) {
      rmdirSync(dir);
      log(`    remove dir ${dir}`);
    }
  } catch { /* keep dir if non-empty (backups preserved) */ }
}

function removeJsonKey(file, topKey, key, log, removed) {
  if (!existsSync(file)) return;
  let json;
  try { json = JSON.parse(readFileSync(file, 'utf8')); } catch (err) {
    log(`    WARN: cannot parse ${file} (${err.message}); leaving it untouched`);
    return;
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    log(`    WARN: ${file} is not a JSON object; leaving it untouched`);
    return;
  }
  const container = json[topKey];
  if (container && typeof container === 'object' && !Array.isArray(container) && key in container) {
    const entry = container[key];
    // Only remove when the entry is the graphyloop-installed shape; a
    // user-modified graphyloop entry is kept.
    const isGraphyLoopEntry =
      entry && typeof entry === 'object' && entry.command === 'node' &&
      Array.isArray(entry.args) && entry.args.length === 1 &&
      typeof entry.args[0] === 'string' &&
      entry.args[0].includes('.graphyloop') &&
      entry.args[0].endsWith('mcp-server.mjs');
    if (!isGraphyLoopEntry) {
      log(`    skip ${file}: mcpServers.graphyloop differs from the graphyloop copy (user-modified)`);
      return;
    }
    backupFile(file, log);
    delete container[key];
    if (Object.keys(container).length === 0) delete json[topKey];
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    removed.push(`${topKey}.${key} in ${file}`);
    log(`    removed mcpServers.graphyloop from ${file}`);
  } else {
    log(`    skip ${file}: no "${topKey}.${key}" entry (nothing graphyloop added)`);
  }
}

/**
 * Strip graphyloop-owned keys from a `[section]` TOML table. User-added keys
 * inside the section are kept; the section is dropped only when empty.
 */
function removeTomlSection(file, section, log, removed) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `[${section}]`);
  if (start < 0) {
    log(`    skip ${file}: no "[${section}]" section (nothing graphyloop added)`);
    return;
  }
  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
  const kept = lines
    .slice(start + 1, end)
    .filter((l) => l.trim() !== '' && !/^\s*(command|args|env)\s*=/.test(l));

  backupFile(file, log);
  let out;
  if (kept.length === 0) {
    const head = lines.slice(0, start);
    const tail = lines.slice(end);
    if (head.length && head[head.length - 1].trim() === '') head.pop();
    out = [...head, ...tail].join('\n');
    log(`    removed [${section}] section from ${file}`);
  } else {
    out = [...lines.slice(0, start), `[${section}]`, ...kept, ...lines.slice(end)].join('\n');
    log(`    removed graphyloop keys from [${section}] in ${file} (kept ${kept.length} user key(s))`);
  }
  out = out.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  writeFileSync(file, out);
  removed.push(`[${section}] in ${file}`);
}

/** Remove a file only when its content matches `expected` (guards user edits). */
function removeIfMatches(file, expected, log, removed) {
  if (!existsSync(file)) return;
  let cur;
  try { cur = readFileSync(file, 'utf8'); } catch { return; }
  if (cur === expected) {
    try {
      unlinkSync(file);
      removed.push(file);
      log(`    remove ${file}`);
    } catch (err) {
      log(`    WARN: could not remove ${file}: ${err.message}`);
    }
  } else {
    log(`    skip ${file}: content differs from the graphyloop copy (user-modified)`);
  }
}

function uninstallCore(home, log, removed) {
  const coreDir = path.join(home, '.graphyloop');
  if (!existsSync(coreDir)) {
    log('    skip ~/.graphyloop (not installed)');
    return;
  }
  removeTreeKeepingBackups(path.join(coreDir, 'graphyloop'), log, removed);
  removeTreeKeepingBackups(path.join(coreDir, 'plugins', 'graphyloop'), log, removed);
  const mcpFile = path.join(coreDir, 'mcp-server.mjs');
  if (existsSync(mcpFile) && !mcpFile.includes('.bak-')) {
    try {
      unlinkSync(mcpFile);
      removed.push(mcpFile);
      log(`    remove ${mcpFile}`);
    } catch (err) {
      log(`    WARN: could not remove ${mcpFile}: ${err.message}`);
    }
  }
}

function uninstallOpenCode(home, opts, log, removed) {
  const configDir = resolveDir(opts.configDir, process.cwd()) || path.join(home, '.config', 'opencode');
  log(`  [opencode] config root: ${configDir}`);

  // Agents: only files byte-identical to the repo agents/ copy.
  removeMatching(path.join(configDir, 'agents'), contentMap(path.join(REPO_ROOT, 'agents'), '.md'), log, removed);

  // Plugin dir installed by install-core/install-opencode.
  removeTreeKeepingBackups(path.join(configDir, 'plugins', 'graphyloop'), log, removed);

  // opencode.json: remove plugin entries + commands added by graphyloop.
  const configFile = path.join(configDir, 'opencode.json');
  if (existsSync(configFile)) {
    let json;
    try { json = JSON.parse(readFileSync(configFile, 'utf8')); } catch (err) {
      log(`    WARN: cannot parse ${configFile} (${err.message}); leaving it untouched`);
      return;
    }
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      log(`    WARN: ${configFile} is not a JSON object; leaving it untouched`);
      return;
    }
    let changed = false;

    // plugin entries from config/opencode.plugin.json (fallback PLUGIN_ENTRY)
    let sourcePlugins = [PLUGIN_ENTRY];
    const pluginSourceFile = path.join(REPO_ROOT, 'config', 'opencode.plugin.json');
    try {
      const parsed = JSON.parse(readFileSync(pluginSourceFile, 'utf8'));
      if (parsed && Array.isArray(parsed.plugin) && parsed.plugin.length > 0) sourcePlugins = parsed.plugin;
    } catch { /* keep fallback */ }
    const normalize = (v) => (typeof v === 'string' ? v.replace(/^\.\//, '').replace(/[\\/]+$/, '') : v);
    const sourceNormalized = sourcePlugins.map(normalize);
    if (Array.isArray(json.plugin)) {
      const kept = json.plugin.filter((p) => !sourceNormalized.includes(normalize(p)));
      if (kept.length !== json.plugin.length) { json.plugin = kept; changed = true; }
    }

    // commands whose value exactly matches the shipped command JSON
    const commandsSourceFile = path.join(REPO_ROOT, 'config', 'opencode.commands.json');
    if (existsSync(commandsSourceFile)) {
      let cmdSource;
      try { cmdSource = JSON.parse(readFileSync(commandsSourceFile, 'utf8')); } catch { cmdSource = null; }
      if (cmdSource && typeof cmdSource === 'object' && !Array.isArray(cmdSource)
          && json.command && typeof json.command === 'object' && !Array.isArray(json.command)) {
        for (const key of Object.keys(cmdSource)) {
          if (key in json.command && JSON.stringify(json.command[key]) === JSON.stringify(cmdSource[key])) {
            delete json.command[key];
            changed = true;
          }
        }
        if (Object.keys(json.command).length === 0) delete json.command;
      }
    }

    if (changed) {
      backupFile(configFile, log);
      writeFileSync(configFile, `${JSON.stringify(json, null, 2)}\n`);
      removed.push(`graphyloop entries in ${configFile}`);
      log(`    removed graphyloop plugin/command entries from ${configFile}`);
    } else {
      log(`    skip ${configFile}: no graphyloop plugin/command entries found`);
    }
  }

  // AGENTS.md: only if byte-identical to the shipped copy.
  const wf = path.join(REPO_ROOT, 'workflow', 'AGENTS.md');
  if (existsSync(wf)) removeIfMatches(path.join(configDir, 'AGENTS.md'), readFileSync(wf, 'utf8'), log, removed);
}

async function uninstallClaude(home, opts, log, removed) {
  log('  [claude]');
  const { claudeAgentFromSource, claudeCommandFile } = await import('./frontmatter.mjs');

  // Expected agent files: regenerated from the repo's opencode agents.
  const expectedAgents = new Map();
  for (const [name, src] of contentMap(path.join(REPO_ROOT, 'agents'), '.md')) {
    expectedAgents.set(name, claudeAgentFromSource(src, name));
  }
  removeMatching(path.join(home, '.claude', 'agents'), expectedAgents, log, removed);

  // Expected command files: regenerated from the shipped commands.json.
  const expectedCmds = new Map();
  try {
    const cmds = JSON.parse(readFileSync(path.join(REPO_ROOT, 'config', 'opencode.commands.json'), 'utf8'));
    for (const [name, spec] of Object.entries(cmds)) {
      if (spec && typeof spec === 'object' && typeof spec.description === 'string' && typeof spec.template === 'string') {
        expectedCmds.set(`${name}.md`, claudeCommandFile(name, spec.description, spec.template));
      }
    }
  } catch { /* no commands to match */ }
  removeMatching(path.join(home, '.claude', 'commands'), expectedCmds, log, removed);

  removeJsonKey(path.join(home, '.claude.json'), 'mcpServers', 'graphyloop', log, removed);
  const wf = path.join(REPO_ROOT, 'workflow', 'AGENTS.md');
  if (existsSync(wf)) removeIfMatches(path.join(home, '.claude', 'AGENTS.md'), readFileSync(wf, 'utf8'), log, removed);
}

function uninstallCodex(home, log, removed) {
  log('  [codex]');
  removeTomlSection(path.join(home, '.codex', 'config.toml'), 'mcp_servers.graphyloop', log, removed);
  removeMatching(
    path.join(home, '.codex', 'prompts'),
    contentMap(path.join(REPO_ROOT, 'templates', 'codex', 'prompts'), '.md'),
    log,
    removed
  );
  const wf = path.join(REPO_ROOT, 'workflow', 'AGENTS.md');
  if (existsSync(wf)) removeIfMatches(path.join(home, '.codex', 'AGENTS.md'), readFileSync(wf, 'utf8'), log, removed);
}

function uninstallCursor(home, log, removed) {
  log('  [cursor]');
  removeJsonKey(path.join(home, '.cursor', 'mcp.json'), 'mcpServers', 'graphyloop', log, removed);
  const wf = path.join(REPO_ROOT, 'workflow', 'AGENTS.md');
  if (existsSync(wf)) removeIfMatches(path.join(home, '.cursor', 'rules', 'AGENTS.md'), readFileSync(wf, 'utf8'), log, removed);
}

const UNINSTALLERS = {
  opencode: uninstallOpenCode,
  claude: uninstallClaude,
  codex: uninstallCodex,
  cursor: uninstallCursor,
};

async function cmdUninstall(opts, stdout, stderr) {
  const detect = await import('./detect.mjs');
  const detected = detect.detectHarnesses(opts.home);
  const names = selectHarnesses(opts, detected);
  const log = (msg) => stdout.write(`${msg}\n`);
  const removed = [];

  stdout.write(`graphyloop uninstall (${PKG.version}) for ${opts.home}\n`);
  log('  [core] ~/.graphyloop (adapter, plugin, mcp-server)');
  uninstallCore(opts.home, log, removed);

  for (const name of names) {
    await UNINSTALLERS[name](opts.home, opts, log, removed);
  }

  log('');
  log(`Uninstalled ${removed.length} graphyloop-owned path(s). User config keys and *.bak-* backups were kept.`);
  if (opts.force) log('note: --force has no effect on uninstall; backups are always kept.');
  stdout.write('GRAPH_LOOP_UNINSTALLED\n');
  return 0;
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

async function cmdMcp(stdout, stderr) {
  const mcp = await import('./mcp.mjs');
  const main = mcp.main || (mcp.default && mcp.default.main) || mcp.default;
  if (typeof main !== 'function') throw new Error('lib/mcp.mjs does not export main()');
  await main();
  return 0;
}

// ---------------------------------------------------------------------------
// run()
// ---------------------------------------------------------------------------

/**
 * CLI entry: parse argv, dispatch, print. Returns the process exit code.
 *
 * @param {string[]} argv
 * @param {{stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream}} io
 * @returns {Promise<number>} exit code (0 ok, 1 error)
 */
export async function run(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    stderr.write(`ERROR: ${err.message}\n`);
    return 1;
  }

  try {
    if (opts.version) {
      stdout.write(`${PKG.version}\n`);
      return 0;
    }
    if (opts.help) {
      stdout.write(helpText());
      return 0;
    }
    switch (opts.command) {
      case 'install': return await cmdInstall(opts, stdout, stderr);
      case 'doctor': return await cmdDoctor(opts, stdout, stderr);
      case 'status': return await cmdStatus(opts, stdout, stderr);
      case 'uninstall': return await cmdUninstall(opts, stdout, stderr);
      case 'mcp': return await cmdMcp(stdout, stderr);
      case null:
        stdout.write(helpText());
        return 0;
      default:
        stderr.write(`ERROR: unknown command "${opts.command}". Run: graphyloop --help\n`);
        return 1;
    }
  } catch (err) {
    const raw = err && err.message ? err.message : String(err);
    stderr.write(`ERROR: ${raw.replace(/^ERROR:\s*/, '')}\n`);
    return 1;
  }
}
