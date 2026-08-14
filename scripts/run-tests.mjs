// Test runner — version-agnostic across Node 20/22/24 and all platforms.
// `node --test <dir>` breaks on some Windows/Node combos and glob patterns
// require Node >= 22, so enumerate the test files explicitly.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const files = readdirSync(path.join(repo, 'test'))
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => path.join(repo, 'test', f));

if (files.length === 0) {
  console.error('ERROR: no test files found in test/');
  process.exit(1);
}

const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
