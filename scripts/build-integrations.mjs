#!/usr/bin/env node
// =============================================================================
// build-integrations.mjs — deterministic generator for distribution manifests
// and the Claude Code plugin tree (integrations/claude-code/).
//
// Usage:
//   node scripts/build-integrations.mjs           write/sync all generated files
//   node scripts/build-integrations.mjs --check   exit 1 + list stale/extra files
// =============================================================================

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeAgentFromSource, claudeCommandFile } from '../lib/frontmatter.mjs';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(THIS_DIR, '..');

const CORE_SKILLS = ['graphyloop-workflow', 'graphyloop-waves', 'swarm-memory'];

function normalizeLf(text) {
  const lf = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return lf.endsWith('\n') ? lf : `${lf}\n`;
}

function jsonText(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

function parseAuthor(authorField) {
  if (authorField && typeof authorField === 'object') {
    return authorField;
  }
  const raw = String(authorField || '').trim();
  const m = /^([^<(]+?)(?:\s*<([^>]+)>)?(?:\s*\(([^)]+)\))?$/.exec(raw);
  if (!m) return { name: raw || 'graphyloop' };
  const out = { name: m[1].trim() };
  if (m[2]) out.email = m[2].trim();
  if (m[3]) out.url = m[3].trim();
  return out;
}

function cleanRepoUrl(repoField) {
  const raw = typeof repoField === 'string' ? repoField : repoField?.url || '';
  return raw.replace(/^git\+/, '').replace(/\.git$/, '');
}

function walkFiles(dir, baseDir = dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir).sort();
  const out = [];
  for (const name of entries) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkFiles(full, baseDir));
    } else if (st.isFile()) {
      out.push(path.relative(baseDir, full).split(path.sep).join('/'));
    }
  }
  return out.sort();
}

function removeEmptyDirs(dir, stopAt) {
  if (!existsSync(dir) || path.resolve(dir) === path.resolve(stopAt)) return;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      removeEmptyDirs(full, stopAt);
    }
  }
  if (readdirSync(dir).length === 0) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function computeExpectedFiles(repoRoot = REPO_ROOT) {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const version = pkg.version;
  const mcpName = pkg.mcpName || 'io.github.chadixearth/graphyloop';
  const author = parseAuthor(pkg.author);
  const repoUrl = cleanRepoUrl(pkg.repository);

  // Map of repo-relative POSIX path -> UTF-8 string content (LF + trailing newline).
  const expected = new Map();

  // 1. Repo-root server.json (MCP Registry schema 2025-12-11, description <= 100 chars).
  const serverJson = {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: mcpName,
    title: 'GraphyLoop',
    description: 'Workflow planner, wave dispatcher, persistent swarm memory, and deploy preflight for AI agents.',
    repository: {
      url: repoUrl,
      source: 'github',
    },
    websiteUrl: pkg.homepage,
    version,
    packages: [
      {
        registryType: 'npm',
        registryBaseUrl: 'https://registry.npmjs.org',
        identifier: pkg.name,
        version,
        transport: {
          type: 'stdio',
        },
        packageArguments: [
          {
            type: 'positional',
            value: 'mcp',
          },
        ],
      },
    ],
  };
  expected.set('server.json', jsonText(serverJson));

  // The npm description sells the whole kit ("also ships as a Claude Code
  // plugin"), which reads wrong inside the plugin itself, so the plugin and its
  // marketplace entry describe only what the plugin installs.
  const pluginDescription = 'GraphyLoop Workflow v3 for Claude Code: the /graphyloop:chadi-* commands, the agent squad, core workflow skills and the graphyloop MCP server (wave planner, persistent memory, secrets, preflight).';

  // 2. Repo-root .claude-plugin/marketplace.json.
  // Note: `version` lives in integrations/claude-code/.claude-plugin/plugin.json
  // only, because setting `version` in both the marketplace entry and plugin.json
  // triggers a duplicate-version warning in `claude plugin validate`.
  const marketplaceJson = {
    name: 'graphyloop',
    description: 'GraphyLoop agentic workflow kit (Workflow v3, 25-agent squad, slash commands, core skills, and MCP server) for Claude Code.',
    owner: author,
    plugins: [
      {
        name: 'graphyloop',
        source: './integrations/claude-code',
        description: pluginDescription,
        // Discovery fields: marketplace browsers and plugin directories that
        // crawl .claude-plugin/marketplace.json filter on category and tags.
        category: 'development',
        tags: ['workflow', 'agents', 'subagents', 'mcp', 'memory', 'agent-skills', 'planning'],
        homepage: pkg.homepage,
        license: pkg.license || 'MIT',
      },
    ],
  };
  expected.set('.claude-plugin/marketplace.json', jsonText(marketplaceJson));

  // 3. Plugin manifest: integrations/claude-code/.claude-plugin/plugin.json.
  const pluginJson = {
    name: 'graphyloop',
    version,
    description: pluginDescription,
    author,
    homepage: pkg.homepage,
    repository: repoUrl,
    license: pkg.license || 'MIT',
    keywords: Array.isArray(pkg.keywords) ? pkg.keywords : [],
  };
  expected.set('integrations/claude-code/.claude-plugin/plugin.json', jsonText(pluginJson));

  // 4. Plugin MCP config: integrations/claude-code/.mcp.json.
  const mcpJson = {
    mcpServers: {
      graphyloop: {
        command: 'npx',
        args: ['-y', `graphyloop@${version}`, 'mcp'],
      },
    },
  };
  expected.set('integrations/claude-code/.mcp.json', jsonText(mcpJson));

  // 5. Plugin README: integrations/claude-code/README.md.
  const pluginReadme = [
    '# GraphyLoop — Claude Code Plugin',
    '',
    'GraphyLoop ships as a native Claude Code plugin providing:',
    '',
    '- **15 `/graphyloop:chadi-*` commands** (`chadi-fast`, `chadi-waves`, `chadi-plan`, `chadi-recall`, `chadi-db`, `chadi-deploy`, `chadi-review`, `chadi-audit`, `chadi-init`, `chadi-go`, `chadi-discuss`, `chadi-research`, `chadi-confusing`, `chadi-skills`, `chadi-release`)',
    '- **26 agent definitions** (`agent-chadi` driver + 25 specialist and crew lanes)',
    '- **3 core skills** (`graphyloop-workflow`, `graphyloop-waves`, `swarm-memory`)',
    `- **MCP server** (\`graphyloop\` via \`npx -y graphyloop@${version} mcp\`)`,
    '',
    '## Install from the marketplace',
    '',
    'Inside a Claude Code session:',
    '',
    '```text',
    '/plugin marketplace add chadixearth/graphyloop',
    '/plugin install graphyloop@graphyloop',
    '```',
    '',
    'Or from your shell:',
    '',
    '```bash',
    'claude plugin marketplace add chadixearth/graphyloop',
    'claude plugin install graphyloop@graphyloop',
    '```',
    '',
    '> **Choose one install channel for Claude Code**: use this plugin **or** `npx graphyloop --harness claude`, not both, to avoid duplicate tools and agents.',
    '',
    '## Regenerate',
    '',
    'This directory is generated from the canonical sources (`agents/`, `config/opencode.commands.json`, `skills/`, `package.json`). Do not hand-edit files here; run:',
    '',
    '```bash',
    'node scripts/build-integrations.mjs',
    '```',
  ].join('\n');
  expected.set('integrations/claude-code/README.md', normalizeLf(pluginReadme));

  // 6. Commands: config/opencode.commands.json -> integrations/claude-code/commands/chadi-*.md.
  const commandsPath = path.join(repoRoot, 'config', 'opencode.commands.json');
  const commands = JSON.parse(readFileSync(commandsPath, 'utf8'));
  const commandNames = Object.keys(commands)
    .filter((k) => k.startsWith('chadi-'))
    .sort();
  for (const name of commandNames) {
    const cmd = commands[name];
    if (!cmd || typeof cmd !== 'object') continue;
    const rendered = claudeCommandFile(name, cmd.description, cmd.template);
    expected.set(`integrations/claude-code/commands/${name}.md`, normalizeLf(rendered));
  }

  // 7. Agents: agents/*.md -> integrations/claude-code/agents/*.md.
  const agentsDir = path.join(repoRoot, 'agents');
  const agentFiles = readdirSync(agentsDir)
    .filter((n) => n.endsWith('.md'))
    .sort();
  for (const entry of agentFiles) {
    const srcText = readFileSync(path.join(agentsDir, entry), 'utf8');
    const rendered = claudeAgentFromSource(srcText, entry);
    expected.set(`integrations/claude-code/agents/${entry}`, normalizeLf(rendered));
  }

  // 8. Core skills: skills/{graphyloop-workflow,graphyloop-waves,swarm-memory}/**
  for (const skillName of CORE_SKILLS) {
    const skillRoot = path.join(repoRoot, 'skills', skillName);
    const relFiles = walkFiles(skillRoot);
    for (const rel of relFiles) {
      const srcFile = path.join(skillRoot, rel);
      const content = readFileSync(srcFile, 'utf8');
      expected.set(`integrations/claude-code/skills/${skillName}/${rel}`, normalizeLf(content));
    }
  }

  return expected;
}

export function buildIntegrations({ repoRoot = REPO_ROOT, check = false } = {}) {
  const expected = computeExpectedFiles(repoRoot);
  const managedRoots = ['integrations/claude-code', '.claude-plugin'];

  // Collect all currently existing files under managed directories so orphaned
  // files whose source was removed get detected (in --check) or deleted.
  const existingManaged = new Set();
  for (const rootRel of managedRoots) {
    const rootAbs = path.join(repoRoot, rootRel);
    for (const rel of walkFiles(rootAbs)) {
      existingManaged.add(`${rootRel}/${rel}`);
    }
  }
  if (existsSync(path.join(repoRoot, 'server.json'))) {
    existingManaged.add('server.json');
  }

  const stale = [];
  const written = [];
  const removed = [];

  const sortedExpectedKeys = [...expected.keys()].sort();
  for (const relPath of sortedExpectedKeys) {
    const want = expected.get(relPath);
    const absPath = path.join(repoRoot, relPath);
    let current = null;
    if (existsSync(absPath)) {
      current = readFileSync(absPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }
    if (current !== want) {
      stale.push(relPath);
      if (!check) {
        mkdirSync(path.dirname(absPath), { recursive: true });
        writeFileSync(absPath, want, 'utf8');
        written.push(relPath);
      }
    }
  }

  const sortedExisting = [...existingManaged].sort();
  for (const relPath of sortedExisting) {
    if (!expected.has(relPath)) {
      stale.push(relPath);
      if (!check) {
        const absPath = path.join(repoRoot, relPath);
        rmSync(absPath, { force: true });
        removed.push(relPath);
      }
    }
  }

  if (!check) {
    for (const rootRel of managedRoots) {
      removeEmptyDirs(path.join(repoRoot, rootRel), repoRoot);
    }
  }

  return { ok: stale.length === 0, stale, written, removed, total: expected.size };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const rootIdx = argv.indexOf('--root');
  const repoRoot =
    rootIdx >= 0 && argv[rootIdx + 1] ? path.resolve(argv[rootIdx + 1]) : REPO_ROOT;
  const res = buildIntegrations({ repoRoot, check });
  if (check) {
    if (!res.ok) {
      console.error(`INTEGRATIONS_STALE (${res.stale.length} file(s) out of sync):`);
      for (const f of res.stale) console.error(`  - ${f}`);
      console.error('Run `node scripts/build-integrations.mjs` to regenerate.');
      process.exit(1);
    }
    console.log(`INTEGRATIONS_OK (${res.total} files verified)`);
    process.exit(0);
  }
  console.log(
    `INTEGRATIONS_BUILT (${res.total} files; ${res.written.length} updated, ${res.removed.length} removed)`
  );
}
