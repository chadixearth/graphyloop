// Test runner — version-agnostic across Node 20/22/24 and all platforms.
// `node --test <dir>` breaks on some Windows/Node combos and glob patterns
// require Node >= 22, so enumerate the test files explicitly.
//
// Usage:
//   node scripts/run-tests.mjs                 all suites
//   node scripts/run-tests.mjs secrets planner  only files whose name matches
//   node scripts/run-tests.mjs --fast           everything except install (slow)
//   node scripts/run-tests.mjs --list           print the suites and exit
//
// Why filters exist: install.test.mjs spawns a real installer per case and
// dominates the wall clock, so iterating on one small suite through the full
// batch wasted minutes per edit.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const testDir = path.join(repo, 'test');

// Slow by nature: each case runs the installer against a sandbox home.
const SLOW = ['install', 'update'];

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('-')));
const patterns = argv.filter((a) => !a.startsWith('-'));

const all = readdirSync(testDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort();

const name = (f) => f.replace(/\.test\.mjs$/, '');

let selected = all;
if (patterns.length > 0) {
  selected = all.filter((f) => patterns.some((p) => name(f).includes(p.toLowerCase())));
}
if (flags.has('--fast')) {
  selected = selected.filter((f) => !SLOW.includes(name(f)));
}

if (flags.has('--list')) {
  console.log(all.map((f) => `${name(f)}${SLOW.includes(name(f)) ? '  (slow)' : ''}`).join('\n'));
  process.exit(0);
}

if (selected.length === 0) {
  console.error(`ERROR: no test files matched ${patterns.length ? patterns.join(', ') : 'test/'}`);
  console.error(`available: ${all.map(name).join(', ')}`);
  process.exit(1);
}

console.log(`running ${selected.length}/${all.length} suite(s): ${selected.map(name).join(', ')}`);
const files = selected.map((f) => path.join(testDir, f));
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
