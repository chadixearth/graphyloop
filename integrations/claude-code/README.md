# GraphyLoop — Claude Code Plugin

GraphyLoop ships as a native Claude Code plugin providing:

- **15 `/graphyloop:chadi-*` commands** (`chadi-fast`, `chadi-waves`, `chadi-plan`, `chadi-recall`, `chadi-db`, `chadi-deploy`, `chadi-review`, `chadi-audit`, `chadi-init`, `chadi-go`, `chadi-discuss`, `chadi-research`, `chadi-confusing`, `chadi-skills`, `chadi-release`)
- **26 agent definitions** (`agent-chadi` driver + 25 specialist and crew lanes)
- **3 core skills** (`graphyloop-workflow`, `graphyloop-waves`, `swarm-memory`)
- **MCP server** (`graphyloop` via `npx -y graphyloop@0.6.0 mcp`)

## Install from the marketplace

Inside a Claude Code session:

```text
/plugin marketplace add chadixearth/graphyloop
/plugin install graphyloop@graphyloop
```

Or from your shell:

```bash
claude plugin marketplace add chadixearth/graphyloop
claude plugin install graphyloop@graphyloop
```

> **Choose one install channel for Claude Code**: use this plugin **or** `npx graphyloop --harness claude`, not both, to avoid duplicate tools and agents.

## Regenerate

This directory is generated from the canonical sources (`agents/`, `config/opencode.commands.json`, `skills/`, `package.json`). Do not hand-edit files here; run:

```bash
node scripts/build-integrations.mjs
```
