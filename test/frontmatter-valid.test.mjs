// frontmatter-valid.test.mjs — zero-dependency YAML frontmatter regression test.
//
// Walks agents/, skills/, templates/ and integrations/claude-code/ and rejects:
//   - top-level plain scalars containing `: `, trailing `:`, ` #`, or a leading
//     YAML indicator character
//   - quoted scalars not closed on the same line or containing unescaped inner
//     quotes
//   - unexpected indented continuation lines after a single-line scalar
//
// Run with: node scripts/run-tests.mjs frontmatter-valid

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claudeAgentFromSource,
  claudeCommandFile,
  ompAgentFromSource,
} from '../lib/frontmatter.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['agents', 'skills', 'templates', 'integrations/claude-code'];

function walkMd(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMd(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function validateDoubleQuoted(raw) {
  if (raw.length < 2) return 'unclosed double-quoted scalar';
  let i = 1;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"') {
      if (i === raw.length - 1) return null; // closed at end of line
      return 'unescaped inner quote or trailing text after closing quote';
    }
    i++;
  }
  return 'unclosed double-quoted scalar on line';
}

function validateSingleQuoted(raw) {
  if (raw.length < 2 || !raw.endsWith("'")) {
    return 'unclosed single-quoted scalar on line';
  }
  const inner = raw.slice(1, -1).replace(/''/g, '');
  if (inner.includes("'")) return 'unescaped inner single quote';
  return null;
}

/**
 * Validate the leading `---` YAML frontmatter of a markdown document.
 * Returns an array of human-readable error strings (empty when valid).
 */
export function validateFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return [];

  const lines = m[1].split(/\r?\n/);
  const errors = [];
  let inBlock = false; // true after `key:` (nested map/seq) or `key: >` / `key: |`

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNo = idx + 2; // 1-based line number in file (line 1 is `---`)

    if (line.trim() === '' || /^\s*#/.test(line)) continue;

    if (/^\s/.test(line)) {
      if (!inBlock) {
        errors.push(`line ${lineNo}: unexpected indented continuation after single-line scalar`);
      }
      continue;
    }

    const kv = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(line);
    if (!kv) {
      errors.push(`line ${lineNo}: invalid top-level frontmatter line`);
      inBlock = false;
      continue;
    }

    const key = kv[1];
    const raw = (kv[2] ?? '').trim();

    if (raw === '' || /^[>|][+-]?$/.test(raw)) {
      inBlock = true;
      continue;
    }

    inBlock = false;

    if (raw.startsWith('"')) {
      const err = validateDoubleQuoted(raw);
      if (err) errors.push(`line ${lineNo} (${key}): ${err}`);
      continue;
    }

    if (raw.startsWith("'")) {
      const err = validateSingleQuoted(raw);
      if (err) errors.push(`line ${lineNo} (${key}): ${err}`);
      continue;
    }

    if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('{') && raw.endsWith('}'))) {
      continue;
    }

    if (/^[\s>|!&*\-?{}[\]%@`"'#,]/.test(raw)) {
      errors.push(`line ${lineNo} (${key}): plain scalar starts with YAML indicator`);
    }
    if (/:\s|:$/.test(raw)) {
      errors.push(`line ${lineNo} (${key}): unquoted plain scalar contains ": " or trailing ":"`);
    }
    if (/\s#/.test(raw)) {
      errors.push(`line ${lineNo} (${key}): unquoted plain scalar contains " #"`);
    }
  }

  return errors;
}

test('every .md file under agents/, skills/, templates/, and integrations/claude-code/ has valid YAML frontmatter', () => {
  const failures = [];
  let checked = 0;

  for (const relRoot of ROOTS) {
    const absRoot = path.join(REPO_ROOT, relRoot);
    for (const file of walkMd(absRoot)) {
      const text = readFileSync(file, 'utf8');
      if (!text.startsWith('---')) continue;
      checked++;
      const errs = validateFrontmatter(text);
      if (errs.length > 0) {
        const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
        failures.push(`${rel}: ${errs.join('; ')}`);
      }
    }
  }

  assert.ok(checked >= 150, `expected at least 150 frontmatter files, checked ${checked}`);
  assert.deepEqual(failures, [], `Invalid YAML frontmatter:\n${failures.join('\n')}`);
});

test('validator catches the pre-fix invalid frontmatter shapes', () => {
  // 1. Unquoted `: ` in plain scalar (pre-fix chadi-integrator / story-video-automator / skills)
  const unquotedColon = [
    '---',
    'description: Wave 2 integration specialist — joins parallel lanes: swaps frontend mocks',
    'mode: subagent',
    '---',
    '',
  ].join('\n');
  assert.ok(validateFrontmatter(unquotedColon).some((e) => e.includes('": "')));

  // 2. Unquoted ` #` in plain scalar
  const unquotedHash = ['---', 'description: Use when x # comment leak', '---', ''].join('\n');
  assert.ok(validateFrontmatter(unquotedHash).some((e) => e.includes('" #"')));

  // 3. Multi-line double-quoted description with continuation lines (pre-fix cavecrew/SKILL.md)
  const preFixCavecrew = [
    '---',
    'name: cavecrew',
    'description: "Decision guide for delegating to caveman-style subagents."',
    '  Trigger: "delegate to subagent", "use cavecrew",',
    '  "save context".',
    '---',
    '',
  ].join('\n');
  assert.ok(
    validateFrontmatter(preFixCavecrew).some((e) => e.includes('unexpected indented continuation'))
  );

  // 4. Unclosed quote on the same line
  const unclosedQuote = [
    '---',
    'description: "First line not closed',
    '  second line"',
    '---',
    '',
  ].join('\n');
  assert.ok(validateFrontmatter(unclosedQuote).some((e) => e.includes('unclosed double-quoted')));
});

test('claudeAgentFromSource, claudeCommandFile, and ompAgentFromSource quote scalars with ": " without adding double-quoting', () => {
  const srcQuoted = [
    '---',
    'description: "Wave 2 integration specialist — joins parallel lanes: swaps frontend mocks."',
    'mode: subagent',
    '---',
    'Body text',
  ].join('\n');

  for (const fn of [claudeAgentFromSource, ompAgentFromSource]) {
    const out = fn(srcQuoted, 'chadi-integrator.md');
    assert.deepEqual(validateFrontmatter(out), []);
    assert.match(
      out,
      /^description: "Wave 2 integration specialist — joins parallel lanes: swaps frontend mocks\."$/m
    );
    assert.ok(!out.includes('""Wave 2'), 'must not double-quote already quoted source description');
  }

  const cmdOut = claudeCommandFile(
    'chadi-db',
    'Supabase database workflow: preflight, env sync, RLS-first migration',
    'Template body'
  );
  assert.deepEqual(validateFrontmatter(cmdOut), []);
  assert.match(
    cmdOut,
    /^description: "Supabase database workflow: preflight, env sync, RLS-first migration"$/m
  );
});
