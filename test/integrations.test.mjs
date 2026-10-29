// integrations.test.mjs — tests for generated Claude Code plugin, marketplace,
// and MCP Registry server.json manifests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIntegrations } from '../scripts/build-integrations.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_SCRIPT = path.join(REPO_ROOT, 'scripts', 'build-integrations.mjs');

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, relPath), 'utf8'));
}

test('build-integrations --check exits 0 on the clean repo', () => {
  const res = spawnSync(process.execPath, [BUILD_SCRIPT, '--check'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr || res.stdout}`);
  assert.match(res.stdout, /INTEGRATIONS_OK/);
});

test('plugin.json, server.json, and .mcp.json versions equal package.json version', () => {
  const pkg = readJson('package.json');
  const pluginJson = readJson('integrations/claude-code/.claude-plugin/plugin.json');
  const serverJson = readJson('server.json');
  const mcpJson = readJson('integrations/claude-code/.mcp.json');

  assert.equal(pluginJson.name, 'graphyloop');
  assert.equal(pluginJson.version, pkg.version);
  assert.equal(serverJson.version, pkg.version);
  assert.equal(serverJson.packages?.[0]?.version, pkg.version);
  assert.deepEqual(mcpJson.mcpServers?.graphyloop, {
    command: 'npx',
    args: ['-y', `graphyloop@${pkg.version}`, 'mcp'],
  });
});

test('server.json conforms to MCP Registry schema 2025-12-11 and matches mcpName', () => {
  const pkg = readJson('package.json');
  const serverJson = readJson('server.json');

  assert.equal(
    serverJson.$schema,
    'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json'
  );
  assert.equal(serverJson.name, pkg.mcpName);
  assert.match(serverJson.name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
  assert.equal(typeof serverJson.description, 'string');
  assert.ok(
    serverJson.description.length >= 1 && serverJson.description.length <= 100,
    `server.json description length (${serverJson.description.length}) must be 1..100`
  );
  assert.equal(serverJson.repository?.source, 'github');
  assert.match(serverJson.repository?.url || '', /^https:\/\/github\.com\//);

  assert.ok(Array.isArray(serverJson.packages) && serverJson.packages.length === 1);
  const npmPkg = serverJson.packages[0];
  assert.equal(npmPkg.registryType, 'npm');
  assert.equal(npmPkg.identifier, pkg.name);
  assert.equal(npmPkg.transport?.type, 'stdio');
  assert.deepEqual(npmPkg.packageArguments, [{ type: 'positional', value: 'mcp' }]);
});

test('every marketplace plugin source exists and has .claude-plugin/plugin.json', () => {
  const marketplace = readJson('.claude-plugin/marketplace.json');
  assert.equal(marketplace.name, 'graphyloop');
  assert.equal(typeof marketplace.owner?.name, 'string');
  assert.ok(marketplace.owner.name.length > 0);
  assert.ok(Array.isArray(marketplace.plugins) && marketplace.plugins.length >= 1);

  for (const entry of marketplace.plugins) {
    assert.equal(typeof entry.source, 'string', `plugin ${entry.name} source must be relative path`);
    assert.ok(entry.source.startsWith('./'), `plugin ${entry.name} source must start with ./`);
    const pluginDir = path.resolve(REPO_ROOT, entry.source);
    assert.ok(existsSync(pluginDir), `plugin source directory missing: ${entry.source}`);
    const manifestPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
    assert.ok(existsSync(manifestPath), `plugin manifest missing: ${manifestPath}`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.name, entry.name);
  }
});

test('generated plugin command count equals chadi-* count in config/opencode.commands.json and agents/skills match sources', () => {
  const commandsConfig = readJson('config/opencode.commands.json');
  const expectedCommands = Object.keys(commandsConfig)
    .filter((k) => k.startsWith('chadi-'))
    .map((k) => `${k}.md`)
    .sort();

  const generatedCommandsDir = path.join(REPO_ROOT, 'integrations', 'claude-code', 'commands');
  const actualCommands = readdirSync(generatedCommandsDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  assert.deepEqual(actualCommands, expectedCommands);

  const sourceAgents = readdirSync(path.join(REPO_ROOT, 'agents'))
    .filter((f) => f.endsWith('.md'))
    .sort();
  const generatedAgents = readdirSync(path.join(REPO_ROOT, 'integrations', 'claude-code', 'agents'))
    .filter((f) => f.endsWith('.md'))
    .sort();
  assert.deepEqual(generatedAgents, sourceAgents);

  const generatedSkills = readdirSync(
    path.join(REPO_ROOT, 'integrations', 'claude-code', 'skills')
  ).sort();
  assert.deepEqual(generatedSkills, ['graphyloop-waves', 'graphyloop-workflow', 'swarm-memory']);
  for (const skill of generatedSkills) {
    assert.ok(
      existsSync(path.join(REPO_ROOT, 'integrations', 'claude-code', 'skills', skill, 'SKILL.md')),
      `missing SKILL.md for ${skill}`
    );
  }
});

test('--check detects a deliberately stale file and an orphaned file in a temp clone', () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'graphyloop-integrations-'));
  try {
    // Copy canonical inputs and generated outputs into the temp clone.
    cpSync(path.join(REPO_ROOT, 'package.json'), path.join(tempRoot, 'package.json'));
    cpSync(
      path.join(REPO_ROOT, 'config', 'opencode.commands.json'),
      path.join(tempRoot, 'config', 'opencode.commands.json'),
      { recursive: true }
    );
    cpSync(path.join(REPO_ROOT, 'agents'), path.join(tempRoot, 'agents'), { recursive: true });
    for (const skill of ['graphyloop-workflow', 'graphyloop-waves', 'swarm-memory']) {
      cpSync(
        path.join(REPO_ROOT, 'skills', skill),
        path.join(tempRoot, 'skills', skill),
        { recursive: true }
      );
    }
    cpSync(path.join(REPO_ROOT, 'server.json'), path.join(tempRoot, 'server.json'));
    cpSync(path.join(REPO_ROOT, '.claude-plugin'), path.join(tempRoot, '.claude-plugin'), {
      recursive: true,
    });
    cpSync(path.join(REPO_ROOT, 'integrations'), path.join(tempRoot, 'integrations'), {
      recursive: true,
    });

    // Clean temp clone passes --check.
    const cleanCheck = buildIntegrations({ repoRoot: tempRoot, check: true });
    assert.equal(cleanCheck.ok, true);

    // Tamper with a generated file and plant an orphaned command file.
    const mcpFile = path.join(tempRoot, 'integrations', 'claude-code', '.mcp.json');
    writeFileSync(mcpFile, '{"mcpServers":{}}\n', 'utf8');
    const orphanFile = path.join(
      tempRoot,
      'integrations',
      'claude-code',
      'commands',
      'chadi-orphan.md'
    );
    writeFileSync(orphanFile, '---\ndescription: orphan\n---\n', 'utf8');

    const staleRes = spawnSync(
      process.execPath,
      [BUILD_SCRIPT, '--check', '--root', tempRoot],
      { encoding: 'utf8' }
    );
    assert.equal(staleRes.status, 1, 'expected --check to exit 1 on stale clone');
    assert.match(staleRes.stderr, /integrations\/claude-code\/\.mcp\.json/);
    assert.match(staleRes.stderr, /integrations\/claude-code\/commands\/chadi-orphan\.md/);

    // Rebuilding heals the stale file and removes the orphan.
    const rebuild = buildIntegrations({ repoRoot: tempRoot, check: false });
    assert.ok(rebuild.written.includes('integrations/claude-code/.mcp.json'));
    assert.ok(rebuild.removed.includes('integrations/claude-code/commands/chadi-orphan.md'));
    assert.equal(existsSync(orphanFile), false);

    const afterRebuild = buildIntegrations({ repoRoot: tempRoot, check: true });
    assert.equal(afterRebuild.ok, true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
