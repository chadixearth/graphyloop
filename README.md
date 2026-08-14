# GraphyLoop

[![npm version](https://img.shields.io/npm/v/graphyloop)](https://www.npmjs.com/package/graphyloop)
[![CI](https://github.com/chadixearth/graphyloop/actions/workflows/ci.yml/badge.svg)](https://github.com/chadixearth/graphyloop/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**One command. A full agentic workflow for any AI coding harness.**

GraphyLoop installs everything you need for agent-driven development in one shot:

- **graphyloop swarm + memory engine** — zero-config agent orchestration and persistent memory that survive restarts. No API keys required.
- **24-agent chadi/graphcrew squad** — explorer, backend, frontend, test, security, reviewer, and more, with a 5-gate delivery workflow.
- **MCP server** — the universal bridge: **Claude Code, Codex, Cursor, Windsurf, OpenCode** all get the graphyloop tools over the Model Context Protocol.
- **5-gate workflow rules** (AGENTS.md) — classify → discover → implement → verify → report, installed for every harness.

Works on **Windows, macOS, Linux** and **Node.js 20, 22, 24** — verified in CI on every push.

---

## Quick start (60 seconds)

```bash
npx graphyloop install
```

That's it. GraphyLoop detects which harnesses you have (OpenCode, Claude Code, Codex, Cursor) and wires up each one:

1. **Restart your harness** (close and reopen your terminal / editor).
2. **Open a real project** (not your home directory).
3. **Ask your agent to run `/chadi-init`** — the workflow initializes.

> Fresh machine with no harness configs yet? `npx graphyloop install` installs all four automatically so you are ready either way. Use `--harness <name>` to target one, or `--harness all` to force all four.

### What you get

| Harness | Agents | Commands | Rules | Tools |
|---|---|---|---|---|
| OpenCode | 25 agents in `~/.config/opencode/agents/` | 12 `/chadi-*` commands | AGENTS.md | graphyloop plugin (`graphyloop_*` tools) |
| Claude Code | 25 agents in `~/.claude/agents/` | 12 `/chadi-*` commands | AGENTS.md | MCP server |
| Codex | prompts in `~/.codex/prompts/` | 12 prompts | AGENTS.md | MCP server |
| Cursor / Windsurf | — | — | AGENTS.md | MCP server |

The core engine lives in `~/.graphyloop/` (adapter CLI + plugin + MCP server).

### Install via git (no npm)

```bash
git clone https://github.com/chadixearth/graphyloop.git
cd graphyloop
node setup.mjs          # equivalent to: npx graphyloop install --harness opencode
```

---

## CLI reference

```
npx graphyloop install [--harness opencode|claude|codex|cursor|all]
                       [--force] [--skip-agents] [--skip-workflow]
                       [--no-config-merge] [--config-dir DIR] [--graphyloop-dir DIR]
npx graphyloop doctor              # what's detected on this machine
npx graphyloop status [--json]     # swarm status via the graphyloop engine
npx graphyloop uninstall           # remove only what graphyloop added
npx graphyloop mcp                 # run the MCP server directly (stdio)
```

Flags:

| Flag | Meaning |
|---|---|
| `--harness` | `opencode` / `claude` / `codex` / `cursor` / `all`. Default: every detected harness. |
| `--home DIR` | Install into a different home directory (testing, containers). |
| `--force` | Overwrite existing graphyloop files (previous copies are backed up as `*.bak-<timestamp>`). |
| `--skip-agents` / `--skip-workflow` | Skip agents/prompts or AGENTS.md. |
| `--no-config-merge` | Never touch `opencode.json`, `.claude.json`, `config.toml`, `mcp.json`. |

**Safety guarantees** (all verified by tests):

- Never overwrites your existing config keys — plugin lists, commands, MCP servers, `default_agent`, models are preserved exactly.
- Every write is preceded by a timestamped backup.
- Re-running is always safe (idempotent).
- Uninstall removes **only** files byte-identical to the shipped copies — anything you edited is left alone.

---

## MCP tools (available in every harness)

Once installed, any MCP-capable harness can call:

| Tool | Purpose |
|---|---|
| `agent_spawn` | Spawn a swarm agent (`coder`, `tester`, `reviewer`, `architect`, `explorer`, `security`, `coordinator`, `frontend`, `data`) |
| `agent_list` | List swarm agents |
| `task_distribute` | Distribute tasks across the swarm (JSON array of `{id, type, description, priority}`) |
| `task_record` | Record a task result (updates agent metrics) |
| `swarm_state` | Swarm status + memory count |
| `memory_store` | Persist a memory entry (`decision`, `pattern`, `lesson`, `event`, `task`) |
| `memory_search` | Keyword-search stored memories |
| `shutdown` | Gracefully stop the swarm |

Verify the connection any time:

```bash
claude mcp list      # look for: graphyloop ... √ Connected
codex mcp list       # look for: graphyloop ... enabled
```

---

## The 5-gate workflow

GraphyLoop's rules (installed as AGENTS.md) drive every task through five gates:

1. **Classify & route** — trivial → inline fix; standard → squad; heavy → full review loop.
2. **Discovery + dispatch** — parallel exploration, memory recall, contract freeze before coding.
3. **Implement + autofix** — flash workers, exclusive file ownership, 3-tier error recovery.
4. **Verify (batched)** — tests + lint + security + review in one parallel wave.
5. **Report** — evidence-first summary, workflow metrics.

Plus: internal-decision policy (no bouncing reversible decisions), shell discipline for hang-free automation, MCP budget, and RAM-aware parallel-agent caps.

## Slash commands

`chadi-init` · `chadi-fast` · `chadi-review` · `chadi-plan` · `chadi-audit` · `chadi-release` · `chadi-research` · `chadi-confusing` · `chadi-discuss` · `chadi-go` · `chadi-recall` · `chadi-skills`

---

## Configuration

**Model** — agents ship without a pinned model so they inherit your harness's default. To pin one (OpenCode):

```yaml
# ~/.config/opencode/agents/agent-chadi.md
model: <your-model>
```

**DeepSeek direct mode** — optional: set `DEEPSEEK_API_KEY` to let the graphyloop engine call DeepSeek directly (bypasses the harness). Not required for anything.

**Default agent (OpenCode)** — setup sets `default_agent: agent-chadi` only when you don't have one. Change it any time.

**Optional skills** — agents reference skills from the [superpowers](https://github.com/obra/superpowers) collection (`brainstorming`, `systematic-debugging`, `tdd-workflow`), plus `last30days`, `security-review`, `council`. They are not bundled; install what you use — agents note a missing skill rather than faking it.

---

## Updates

```bash
npx graphyloop@latest install --force   # refresh core + agents (backups kept)
```

Or simply re-run `npx graphyloop install` — it is idempotent and never clobbers your config.

## Uninstall

```bash
npx graphyloop uninstall
```

Removes the core (`~/.graphyloop/`), agents/prompts/commands it installed, and the MCP entries it added — while keeping your config keys, your own files, and all backups.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `graphyloop CLI not found at ...` from an MCP tool | Run `npx graphyloop install` — the core engine is missing. |
| "graphyloop skipped: not a project root" | Open a real project. The engine deliberately refuses home/system directories. |
| MCP server not showing in Claude Code | `claude mcp list`; if missing, re-run install and restart Claude Code. |
| Codex does not load the server | Check `~/.codex/config.toml` has `[mcp_servers.graphyloop]`; restart codex. |
| Re-running setup "skips" files | Normal — that is the preserve-your-config behavior. Use `--force` to refresh (backups are made first). |
| Config merge warnings about `opencode.jsonc` | OpenCode gives `.jsonc` precedence; review it for the plugin/commands keys. |
| I edited an agent and uninstall kept it | Intended — uninstall only removes byte-identical copies. |

---

## Development

```bash
npm test          # 19 tests: MCP protocol E2E + installer preservation/idempotency
npm pack          # build the publishable tarball
```

Structure: `bin/` CLI entry · `lib/` installers + MCP server + detection · `plugin/` OpenCode plugin · `adapter/` graphyloop engine · `agents/` squad sources · `workflow/AGENTS.md` rules · `templates/` per-harness files. CI runs the full matrix (Windows/macOS/Linux × Node 20/22/24) on every push, including a real install + MCP handshake smoke.

## License

MIT © 2026 chadixearth
