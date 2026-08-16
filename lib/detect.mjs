// graphyloop - harness detection + node resolution.
//
// Zero-dependency ESM (Node >= 20). Detects which AI coding harnesses are
// installed under a home directory and resolves the node executable using the
// same candidate list as plugin/graphyloop/plugin.js.
//
// Contract (CONTRACTS.md, B2):
//   detectHarnesses(homeDir) -> [{name, present, configPath, rootDir}, ...]
//   findNode() -> 'node' | resolved path
//   CORE_DIR(home), GRAPHYLOOP_CLI_PATH(home)

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// DeepSeek Harness home
// ---------------------------------------------------------------------------

/**
 * Resolve the DeepSeek Harness home for `homeDir`.
 *
 * dsh itself resolves `$DSH_HOME` before `~/.dsh`, so honouring that variable is
 * the only way to wire the harness the user actually runs. It is honoured ONLY
 * when installing into the real home directory: `--home <dir>` (tests,
 * containers, CI sandboxes) must stay inside the directory it was given, or a
 * developer with DSH_HOME set would have every sandboxed test write into their
 * live harness config.
 *
 * @param {string} homeDir
 * @returns {string}
 */
export function dshHome(homeDir) {
  const env = (process.env.DSH_HOME || '').trim();
  let real = null;
  try { real = os.homedir(); } catch { real = null; }
  if (env && real && path.resolve(homeDir) === path.resolve(real)) return path.resolve(env);
  return path.join(homeDir, '.dsh');
}

// ---------------------------------------------------------------------------
// Harness detection
// ---------------------------------------------------------------------------

/**
 * Detect installed harnesses under `homeDir`.
 *
 * present is true when the harness root dir or its config file exists.
 * configPath is always the resolved (possibly missing) config file path;
 * rootDir the resolved root directory.
 *
 * @param {string} homeDir
 * @returns {{name:'opencode'|'claude'|'codex'|'cursor'|'dsh', present:boolean, configPath:string|null, rootDir:string|null}[]}
 */
export function detectHarnesses(homeDir) {
  const harnesses = [
    {
      name: 'opencode',
      rootDir: path.join(homeDir, '.config', 'opencode'),
      configPath: null, // filled below: rootDir/opencode.json
    },
    {
      name: 'claude',
      configPath: path.join(homeDir, '.claude.json'),
      rootDir: path.join(homeDir, '.claude'),
    },
    {
      name: 'codex',
      rootDir: path.join(homeDir, '.codex'),
      configPath: path.join(homeDir, '.codex', 'config.toml'),
    },
    {
      name: 'cursor',
      rootDir: path.join(homeDir, '.cursor'),
      configPath: path.join(homeDir, '.cursor', 'mcp.json'),
    },
    {
      // DeepSeek Harness (`dsh`): the home-level patch layer is the config file
      // every profile composes over, so it is what graphyloop merges into.
      name: 'dsh',
      rootDir: dshHome(homeDir),
      configPath: path.join(dshHome(homeDir), 'cordis.patch.yml'),
    },
  ];
  // opencode config file lives inside its root dir.
  harnesses[0].configPath = path.join(harnesses[0].rootDir, 'opencode.json');

  return harnesses.map(({ name, rootDir, configPath }) => ({
    name,
    present: existsSync(rootDir) || existsSync(configPath),
    configPath,
    rootDir,
  }));
}

// ---------------------------------------------------------------------------
// Node resolution (same candidates as plugin/graphyloop/plugin.js)
// ---------------------------------------------------------------------------

const NODE_CANDIDATES = [
  process.env.GRAPHYLOOP_NODE,
  path.join('C:', 'Program Files', 'nodejs', 'node.exe'),
  'node',
].filter(Boolean);

let cachedNode = null;

/**
 * Resolve a working node executable: 'node' or an absolute path.
 * Probes each candidate once with `node --version`; falls back to 'node'.
 *
 * @returns {string}
 */
export function findNode() {
  if (cachedNode) return cachedNode;
  for (const candidate of NODE_CANDIDATES) {
    try {
      const check = spawnSync(candidate, ['--version'], {
        timeout: 3000,
        stdio: 'ignore',
        windowsHide: true,
      });
      if (check.status === 0) {
        cachedNode = candidate;
        return cachedNode;
      }
    } catch {
      // try next candidate
    }
  }
  cachedNode = 'node';
  return cachedNode;
}

// ---------------------------------------------------------------------------
// Core install targets
// ---------------------------------------------------------------------------

/** Core adapter + plugin install root: ~/.graphyloop */
export const CORE_DIR = (home) => path.join(home, '.graphyloop');

/** Core graphyloop CLI location: ~/.graphyloop/graphyloop/cli.mjs */
export const GRAPHYLOOP_CLI_PATH = (home) => path.join(home, '.graphyloop', 'graphyloop', 'cli.mjs');
