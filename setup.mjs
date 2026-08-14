#!/usr/bin/env node
// =============================================================================
// graphyloop - legacy setup.mjs entry (thin delegate to the npx CLI).
//
// Kept for backwards compatibility: `node setup.mjs` now equals
//   node bin/graphyloop.mjs install --harness opencode
//
// Legacy flags map 1:1 onto the CLI flags (same names):
//   --config-dir DIR, --graphyloop-dir DIR, --force, --skip-agents,
//   --skip-workflow, --no-config-merge
// Unknown flags are passed through and ignored by the CLI (forward compat),
// so `node setup.mjs --help` prints CLI help and still exits 0.
//
// Exit codes: 0 = success (final line GRAPH_LOOP_INSTALLED), 1 = failure.
// =============================================================================

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(REPO_ROOT, 'bin', 'graphyloop.mjs');

// Legacy flag -> CLI flag. Names match 1:1; the map is kept explicit so any
// future rename lands in one place.
const FLAG_MAP = {
  '--config-dir': '--config-dir',
  '--graphyloop-dir': '--graphyloop-dir',
  '--force': '--force',
  '--skip-agents': '--skip-agents',
  '--skip-workflow': '--skip-workflow',
  '--no-config-merge': '--no-config-merge',
};

const BOOLEAN_FLAGS = new Set(['--force', '--skip-agents', '--skip-workflow', '--no-config-merge']);
const VALUE_FLAGS = new Set(['--config-dir', '--graphyloop-dir']);
// Flags that would change the harness target or home; strip them so the legacy
// entry always installs OpenCode into the default home.
const STRIP_FLAGS = new Set(['--harness', '--home']);

/**
 * Map legacy argv onto CLI argv. Handles both `--flag value` and
 * `--flag=value`; unknown flags pass through untouched (CLI ignores them).
 */
function mapArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const flag = eq >= 0 ? arg.slice(0, eq) : arg;
    if (!FLAG_MAP[flag]) {
      if (STRIP_FLAGS.has(flag)) {
        if (eq < 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--')) i += 1; // skip value
        continue;
      }
      out.push(arg); // unknown: passthrough (forward compat)
      continue;
    }
    if (eq >= 0) {
      out.push(`${FLAG_MAP[flag]}${arg.slice(eq)}`);
    } else if (BOOLEAN_FLAGS.has(flag)) {
      out.push(FLAG_MAP[flag]);
    } else if (VALUE_FLAGS.has(flag)) {
      out.push(FLAG_MAP[flag]);
      if (i + 1 < argv.length) {
        out.push(argv[i + 1]);
        i += 1;
      }
    }
  }
  return out;
}

function main() {
  const args = ['install', '--harness', 'opencode', ...mapArgs(process.argv.slice(2))];
  // execFileSync (not execSync): keeps node's path-with-spaces out of cmd.exe
  // and passes the arg array unparsed.
  execFileSync(process.execPath, [BIN, ...args], { stdio: 'inherit' });
}

try {
  main();
  process.exitCode = 0;
} catch (err) {
  if (err && Number.isInteger(err.status)) {
    // Child (bin/graphyloop.mjs) already printed the ERROR and exited non-zero.
    process.exitCode = err.status;
  } else {
    process.stderr.write(`ERROR: ${err && err.message ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}
