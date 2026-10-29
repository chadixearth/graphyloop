import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(REPO_ROOT, 'bin', 'graphyloop.mjs');

function runCli(args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

test('audit-install: gemini + codex install deduplicates skills into ~/.agents/skills across both install orders', () => {
  const sbx1 = mkdtempSync(join(tmpdir(), 'gl-audit-gem-codex-1-'));
  const sbx2 = mkdtempSync(join(tmpdir(), 'gl-audit-gem-codex-2-'));
  try {
    // Order 1: codex then gemini (same order as --harness gemini,codex or --harness all)
    const r1 = runCli(['install', '--harness', 'gemini,codex', '--home', sbx1]);
    assert.equal(r1.code, 0, r1.out + r1.err);
    assert.ok(existsSync(join(sbx1, '.agents', 'skills', 'graphyloop-workflow', 'SKILL.md')));
    assert.equal(existsSync(join(sbx1, '.gemini', 'skills', 'graphyloop-workflow', 'SKILL.md')), false);

    // Order 2: gemini first, then codex later (must prune unmodified duplicates in ~/.gemini/skills)
    assert.equal(runCli(['install', '--harness', 'gemini', '--home', sbx2]).code, 0);
    assert.ok(existsSync(join(sbx2, '.gemini', 'skills', 'graphyloop-workflow', 'SKILL.md')));
    // Hand-edit one skill in .gemini/skills to verify user edits are never pruned
    const editedSkill = join(sbx2, '.gemini', 'skills', 'council', 'SKILL.md');
    writeFileSync(editedSkill, '---\nname: council\ndescription: user edited\n---\ncustom\n');

    assert.equal(runCli(['install', '--harness', 'codex', '--home', sbx2]).code, 0);
    assert.ok(existsSync(join(sbx2, '.agents', 'skills', 'graphyloop-workflow', 'SKILL.md')));
    assert.equal(existsSync(join(sbx2, '.gemini', 'skills', 'graphyloop-workflow', 'SKILL.md')), false);
    assert.ok(existsSync(editedSkill), 'user-edited skill in ~/.gemini/skills is preserved');

    // Uninstalling codex while gemini is still wired keeps ~/.agents/skills
    assert.equal(runCli(['uninstall', '--harness', 'codex', '--home', sbx1]).code, 0);
    assert.ok(existsSync(join(sbx1, '.agents', 'skills', 'graphyloop-workflow', 'SKILL.md')));

    // Uninstalling gemini afterwards removes ~/.agents/skills
    assert.equal(runCli(['uninstall', '--harness', 'gemini', '--home', sbx1]).code, 0);
    assert.equal(existsSync(join(sbx1, '.agents', 'skills', 'graphyloop-workflow', 'SKILL.md')), false);
  } finally {
    rmSync(sbx1, { recursive: true, force: true });
    rmSync(sbx2, { recursive: true, force: true });
  }
});

test('audit-install: dsh graphyloop-squad SKILL.md has valid YAML frontmatter (quoted colon scalar)', () => {
  const text = readFileSync(join(REPO_ROOT, 'templates', 'dsh', 'skills', 'graphyloop-squad', 'SKILL.md'), 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(m, 'has YAML frontmatter');
  const descLine = m[1].split('\n').find((l) => l.startsWith('description:'));
  assert.ok(descLine, 'has description line');
  const val = descLine.slice('description:'.length).trim();
  assert.ok(val.startsWith('"') && val.endsWith('"'), `description with colons must be quoted: ${val}`);
});

test('audit-install: opencode and codex uninstall clean up server-guard plugin, default_agent, and MCP comment', () => {
  const sbx = mkdtempSync(join(tmpdir(), 'gl-audit-uninstall-'));
  try {
    assert.equal(runCli(['install', '--harness', 'opencode,codex', '--home', sbx]).code, 0);
    assert.ok(existsSync(join(sbx, '.config', 'opencode', 'plugins', 'server-guard', 'plugin.js')));

    assert.equal(runCli(['uninstall', '--harness', 'opencode,codex', '--home', sbx]).code, 0);
    assert.equal(existsSync(join(sbx, '.config', 'opencode', 'plugins', 'server-guard')), false);
    const ocJson = JSON.parse(readFileSync(join(sbx, '.config', 'opencode', 'opencode.json'), 'utf8'));
    assert.equal(ocJson.default_agent, undefined);
    assert.equal(ocJson.plugin, undefined);

    const codexToml = readFileSync(join(sbx, '.codex', 'config.toml'), 'utf8');
    assert.ok(!codexToml.includes('# graphyloop MCP server'), `orphaned comment removed: ${codexToml}`);
  } finally {
    rmSync(sbx, { recursive: true, force: true });
  }
});
