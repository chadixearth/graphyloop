<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/chadixearth/graphyloop/main/assets/logo-dark.svg">
  <img src="https://raw.githubusercontent.com/chadixearth/graphyloop/main/assets/logo.svg" alt="GraphyLoop" width="320">
</picture>

[![GraphyLoop](https://img.shields.io/badge/_GraphyLoop-any%20harness-6366f1?style=for-the-badge)](https://github.com/chadixearth/graphyloop)
[![npm version](https://img.shields.io/npm/v/graphyloop?label=npx%20graphyloop&style=for-the-badge&logo=npm&color=cb3837)](https://www.npmjs.com/package/graphyloop)
[![CI — Win/macOS/Linux × Node 20/22/24](https://github.com/chadixearth/graphyloop/actions/workflows/ci.yml/badge.svg)](https://github.com/chadixearth/graphyloop/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

# GraphyLoop

**An agentic workflow kit for any AI coding harness.**

</div>

> **Agent = Model + Harness.** The model thinks; the harness gives it tools, memory, loops, and discipline so it can actually work. **GraphyLoop is the harness layer** — one command wires any AI coding harness with a 24-agent squad, coordinated swarms, persistent memory that survives restarts, and a 5-gate delivery workflow. You keep writing code. GraphyLoop handles coordination.

```
User --> Harness (OpenCode / Claude Code / Codex / Cursor)
              |
              +---- MCP server ----+---- graphyloop engine (swarm + memory)
              |                    +---- squad agents (24 chadi/graphcrew)
              |                    +---- 5-gate workflow rules (AGENTS.md)
              v
         ~/.graphyloop core (cli.mjs · plugin.js · mcp-server.mjs)
```

> **New here?** You don't need to learn anything before installing. Run `npx graphyloop install`, restart your harness, open a real project, and ask your agent to run `/chadi-init`. The workflow takes over from there.

---

## Quick Start

**Prerequisites:** Node.js ≥ 20 (npm/npx included) and at least one AI harness you want to wire up (OpenCode, Claude Code, Codex, Cursor, Windsurf — or none yet; GraphyLoop covers that too).

```bash
npx graphyloop install
```

GraphyLoop detects which harnesses you have and wires each one. Then:

1. **Restart your harness** (close and reopen your terminal / editor).
2. **Open a real project** (not your home directory).
3. **Ask your agent to run `/chadi-init`** — the workflow initializes.

| Install path | What you get | Files in your workspace |
|---|---|---|
| `npx graphyloop install` | Everything, for every harness detected | **Zero** — everything lives in your home config (`~/.graphyloop/`, `~/.config/opencode/`, `~/.claude/`, `~/.codex/`, `~/.cursor/`) |
| `npx graphyloop install --harness opencode` | One harness only | Zero |
| `git clone` + `node setup.mjs` | OpenCode-only, no npm needed | Zero (repo clone aside) |

> **Fresh machine?** No harness configs yet → GraphyLoop installs all four automatically, so you are ready no matter which harness you open next. `--harness all` forces all four; `--harness <name>` targets one.

### Setup with any AI assistant (copy-paste)

Paste the block below into your AI harness — it installs, verifies, and reports on its own. Raw copy: [`docs/SETUP-PROMPT.md`](docs/SETUP-PROMPT.md).

```
You are setting up GraphyLoop (github.com/chadixearth/graphyloop, npm package `graphyloop`) — a one-command agentic workflow kit for AI harnesses: graphyloop swarm + memory engine, a 24-agent squad, a 5-gate delivery workflow, and an MCP server that works in any harness.

Goal: install it for THIS machine's harness(es), verify the install actually works, and report. Do NOT edit any config file by hand — run only the installer. Do NOT run npm publish, npm login, or anything unrelated.

Steps:
1. Prerequisites:
   - Run `node --version` — must be 20 or newer. If older, tell the user to install Node.js 20+ and stop there.
   - Detect which harnesses exist on this machine (check for any of): ~/.config/opencode/  (OpenCode), ~/.claude.json or ~/.claude/  (Claude Code), ~/.codex/  (Codex), ~/.cursor/  (Cursor). On Windows, ~ = %USERPROFILE%.
2. Install:
   - Any harness detected:  npx --yes graphyloop install
   - None detected (fresh machine):  npx --yes graphyloop install --harness all
   - If npx asks "Ok to proceed?", answer yes. If npx is missing, stop and tell the user to install Node.js 20+ (npx ships with npm).
3. Verify — every applicable check must pass:
   - `npx --yes graphyloop doctor` prints the harness table.
   - Core engine files exist: ~/.graphyloop/graphyloop/cli.mjs , ~/.graphyloop/mcp-server.mjs , ~/.graphyloop/lib/mcp.mjs .
   - OpenCode (if present): ~/.config/opencode/opencode.json contains a plugin entry "./plugins/graphyloop/plugin.js", and ~/.config/opencode/agents/ contains 25 .md files.
   - Claude Code (if present): ~/.claude.json has an mcpServers.graphyloop entry, and ~/.claude/agents/ is populated.
   - Codex (if present): ~/.codex/config.toml contains a [mcp_servers.graphyloop] section.
   - Cursor (if present): ~/.cursor/mcp.json has a "graphyloop" entry.
   - If any check fails: re-run the install with --force (automatic backups) and re-verify. Still failing? Report the exact error and stop.
4. Wrap up: tell the user to RESTART their harness (close/reopen the terminal or editor), open a real project (not their home directory), and ask the agent to run /chadi-init. Give a one-line summary of what was installed.

Do not ask permission for reversible steps — proceed. Stop only for: Node < 20, an install failure, or a prompt you cannot answer.
```

### What you get

| Harness | Agents | Commands | Rules | Tools |
|---|---|---|---|---|
| **OpenCode** | 25 agent files | 12 `/chadi-*` commands | AGENTS.md | graphyloop plugin (`graphyloop_*` tools) |
| **Claude Code** | 25 agent files | 12 `/chadi-*` commands | AGENTS.md | MCP server (`√ Connected`) |
| **Codex** | 12 prompts | 12 prompts | AGENTS.md | MCP server (`enabled`) |
| **Cursor / Windsurf** | — | — | AGENTS.md | MCP server |

Verified in CI on Windows, macOS and Linux × Node 20, 22, 24 — including a real install + MCP handshake smoke on every combination.

---

## What You Get

| Capability | Description |
|---|---|
| 🐝 **Swarm orchestration** | Spawn, distribute, and track agents with a hierarchical swarm topology — zero API keys, state in `<project>/.graphyloop/state.json` |
| 🧠 **Persistent memory** | Store decisions, patterns, lessons, and events; keyword-search across sessions. Survives restarts and compactions |
| 🤖 **24-agent squad** | Specialized agents for exploration, backend, frontend, testing, security, review, refactoring, docs, data, performance, and more (see [Squad](#squad-agents)) |
| 🛡️ **5-gate delivery workflow** | Classify → Discover → Implement → Verify → Report, with lane-based verification and evidence-first reporting |
| 🔌 **Universal MCP bridge** | The same graphyloop tools work in Claude Code, Codex, Cursor, Windsurf, OpenCode — any MCP-capable harness |
| 📋 **12 slash commands** | `chadi-init` · `chadi-fast` · `chadi-review` · `chadi-plan` · `chadi-audit` · `chadi-release` · `chadi-research` · `chadi-confusing` · `chadi-discuss` · `chadi-go` · `chadi-recall` · `chadi-skills` |
| 🔒 **Config safety** | Timestamped backups before every write, never overwrites your config keys, idempotent re-runs, uninstall removes only byte-identical copies |
| ⚡ **Zero dependencies** | Pure Node (≥ 20), no npm packages at runtime, no shell scripts — installs the same on every platform |

<details>
<summary><strong>With vs Without</strong></summary>

| Capability | Harness Alone | + GraphyLoop |
|---|---|---|
| Agent collaboration | Isolated sessions | Swarm with shared memory |
| Orchestration | Manual | 5-gate workflow + dedicated squad agents |
| Memory | Session-only | Persistent, searchable, survives restarts |
| Multi-harness | One tool | Same workflow in OpenCode, Claude Code, Codex, Cursor |
| Delivery discipline | Ad hoc | Lane-gated verification (test → security → review) |
| Safety | — | Backup-first config merges, content-matched uninstall |

</details>

<details>
<summary><strong>Architecture overview</strong></summary>

```
User --> Harness (OpenCode / Claude Code / Codex / Cursor / Windsurf)
              |
              v
        MCP bridge (8 graphyloop tools)  <----  OpenCode plugin (graphyloop_* tools)
              |
              v
        graphyloop engine (adapter/cli.mjs)
        (swarm orchestration + persistent memory, JSON state)
              |
              +-----> 24-agent squad (explorer, backend, frontend,
              |        test, security, reviewer, architect, ...)
              |
              v
        workflow/AGENTS.md (5-gate rules, installed per harness)
```

</details>

---

## MCP Tools

Once installed, any MCP-capable harness can call:

| Tool | Purpose |
|---|---|
| `agent_spawn` | Spawn a swarm agent — `coder`, `tester`, `reviewer`, `architect`, `explorer`, `security`, `coordinator`, `frontend`, `data` |
| `agent_list` | List swarm agents |
| `task_distribute` | Distribute tasks across the swarm (JSON array of `{id, type, description, priority}`) |
| `task_record` | Record a task result (updates agent metrics) |
| `swarm_state` | Swarm status + memory count |
| `memory_store` | Persist a memory entry — `decision`, `pattern`, `lesson`, `event`, `task` |
| `memory_search` | Keyword-search stored memories |
| `shutdown` | Gracefully stop the swarm |

The swarm **initializes itself on the first tool call** — no setup step, no init tool to remember. Memory persists across `shutdown` and across sessions; only the agent roster is reset.

State lives in `<project>/.graphyloop/state.json` (pre-0.1.2 state under `.opencode/graphyloop/` is moved there automatically on first use). Writes are atomic and guarded by a lock, so parallel agents cannot drop each other's updates; the engine refuses to run in a home, system, or harness-config directory so it never litters those trees.

Verify the connection any time:

```bash
claude mcp list      # look for: graphyloop ... √ Connected
codex mcp list       # look for: graphyloop ... enabled
```

---

## Squad Agents

| Role | Agents |
|---|---|
| **Conductor** | `agent-chadi` — the primary agent running the 5-gate workflow |
| **Exploration** | `chadi-explorer` · `graphcrew-investigator` |
| **Implementation** | `chadi-backend` · `chadi-frontend` · `graphcrew-builder` · `graphcrew-fixer` · `chadi-refactor` |
| **Verification** | `chadi-test` · `chadi-quality` · `chadi-reviewer` · `graphcrew-reviewer` |
| **Security** | `chadi-security` |
| **Architecture & Planning** | `chadi-architect` · `chadi-think` · `chadi-council` |
| **Data & DevOps** | `chadi-data` · `chadi-devops` |
| **Docs & Media** | `chadi-docs` · `chadi-vision` · `story-video-automator` |
| **Memory & Meta** | `chadi-memory` · `chadi-agent-writer` · `chadi-performance` |

## The 5-Gate Workflow

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/chadixearth/graphyloop/main/assets/workflow-dark.svg">
  <img src="https://raw.githubusercontent.com/chadixearth/graphyloop/main/assets/workflow.svg" alt="The five gates — classify, discover, implement, verify, report — running over a persistent memory store, with parallel workers under gate 3 and a single retry from verify back to implement">
</picture>

1. **Classify & route** — trivial → inline fix; standard → squad; heavy → full review loop.
2. **Discovery + dispatch** — parallel exploration, memory recall, contract freeze before coding.
3. **Implement + autofix** — flash workers, exclusive file ownership, 3-tier error recovery.
4. **Verify (batched)** — tests + lint + security + review in one parallel wave.
5. **Report** — evidence-first summary with workflow metrics.

Plus: an internal-decision policy (no bouncing reversible decisions back), shell discipline for hang-free automation, and RAM-aware parallel-agent caps.

---

## CLI Reference

```
npx graphyloop install [--harness opencode|claude|codex|cursor|all]
                       [--force] [--skip-agents] [--skip-workflow]
                       [--no-config-merge] [--config-dir DIR] [--graphyloop-dir DIR]
npx graphyloop doctor              # what's detected on this machine
npx graphyloop status [--json]     # swarm status via the graphyloop engine
npx graphyloop uninstall           # remove only what graphyloop added
npx graphyloop mcp                 # run the MCP server directly (stdio)
```

| Flag | Meaning |
|---|---|
| `--harness` | `opencode` / `claude` / `codex` / `cursor` / `all` — default: every detected harness |
| `--home DIR` | Install into a different home directory (testing, containers) |
| `--force` | Overwrite existing graphyloop files (previous copies backed up as `*.bak-<timestamp>`) |
| `--skip-agents` / `--skip-workflow` | Skip agents/prompts or AGENTS.md |
| `--no-config-merge` | Never touch `opencode.json`, `.claude.json`, `config.toml`, `mcp.json` |

**Safety guarantees** (all covered by tests):

- Never overwrites your existing config keys — plugin lists, commands, MCP servers, `default_agent`, models preserved exactly.
- Every write is preceded by a timestamped backup.
- Re-running is always safe (idempotent).
- Uninstall removes **only** files byte-identical to the shipped copies — anything you edited is left alone.

---

## Configuration

**Model** — agents ship without a pinned model so they inherit your harness's default. To pin one (OpenCode):

```yaml
# ~/.config/opencode/agents/agent-chadi.md
model: <your-model>
```

**DeepSeek direct mode** — optional: set `DEEPSEEK_API_KEY` to let the graphyloop engine call DeepSeek directly (bypasses the harness). Model comes from `--model` or `DEEPSEEK_MODEL`; `deepseek-v4-flash` (default) and `deepseek-v4-pro` are the current ids. Not required for anything.

**Engine limits** — `GRAPHYLOOP_MAX_MEMORIES` caps the memory log (default 2000, oldest dropped first). `GRAPHYLOOP_LOCK_TIMEOUT_MS` is how long a command waits for the state lock (default 10000).

**Default agent (OpenCode)** — setup sets `default_agent: agent-chadi` only when you don't have one. Change it any time.

**Optional skills** — agents reference skills from the [superpowers](https://github.com/obra/superpowers) collection (`brainstorming`, `systematic-debugging`, `tdd-workflow`), plus `last30days`, `security-review`, `council`. They are not bundled; install what you use — agents note a missing skill rather than faking it.

---

## Updates

```bash
npx -y graphyloop@latest install --force   # refresh core + agents from the newest version (backups kept)
```

Re-running plain `npx graphyloop install` is always safe — idempotent, never clobbers your config.

## Uninstall

```bash
npx graphyloop uninstall
```

Removes the core (`~/.graphyloop/`), agents/prompts/commands it installed, and the MCP entries it added — while keeping your config keys, your own files, and all backups.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `graphyloop CLI not found at ...` from an MCP tool | Run `npx graphyloop install` — the core engine is missing |
| "graphyloop skipped: not a project root" | Open a real project — the engine deliberately refuses home/system directories |
| MCP server not showing in Claude Code | `claude mcp list`; if missing, re-run install and restart Claude Code |
| Codex does not load the server | Check `~/.codex/config.toml` has `[mcp_servers.graphyloop]`; restart codex |
| Re-running setup "skips" files | Normal — that is the preserve-your-config behavior. Use `--force` to refresh (backups are made first) |
| Config merge warnings about `opencode.jsonc` | OpenCode gives `.jsonc` precedence; review it for the plugin/commands keys |
| I edited an agent and uninstall kept it | Intended — uninstall only removes byte-identical copies |
| `timed out ... waiting for the graphyloop state lock` | Another graphyloop command is mid-write. A lock orphaned by a killed process clears itself after 30s; raise `GRAPHYLOOP_LOCK_TIMEOUT_MS` if your swarm is very wide |
| My swarm history "disappeared" after updating | It moved: `.opencode/graphyloop/state.json` → `.graphyloop/state.json`, migrated on first use. `npx graphyloop status` prints the active `stateFile` path |
| `state.json.corrupt-<timestamp>` appeared | The engine found an unparsable state file, kept it for inspection, and started clean rather than failing every command |

---

## Development

```bash
npm test          # 44 tests: MCP protocol E2E + engine state durability/concurrency + OpenCode plugin + installer preservation/idempotency + uninstall round-trip
npm pack          # build the publishable tarball
```

**Structure:** `bin/` CLI entry · `lib/` installers + MCP server + detection · `plugin/` OpenCode plugin · `adapter/cli.mjs` graphyloop engine · `agents/` squad sources · `workflow/AGENTS.md` rules · `templates/` per-harness files · `scripts/` test runner + CI smoke · `assets/` logo + diagrams (SVG, light/dark pairs; referenced by absolute URL so npm renders them too, and kept out of the tarball).

`adapter/*.ts` is the original TypeScript design reference — nothing imports it and no build step compiles it, so it is neither published nor installed (CI fails the build if a `.ts` file reaches the tarball).

**CI** runs the full matrix (Windows/macOS/Linux × Node 20/22/24) on every push: syntax, tests, fresh-sandbox installer smoke, installed-MCP-server handshake, tarball contents.

**Commits** carry the `Co-authored-by: Claude <noreply@anthropic.com>` trailer (AI-credit convention). Fresh clones: `git config core.hooksPath hooks` enables the automatic trailer hook (`hooks/prepare-commit-msg`).

### Releasing (automatic)

```bash
npm test                          # 1. verify locally
npm version patch                 # 2. bump (patch | minor | major) — creates a v* tag
git push && git push --tags       # 3. GitHub Actions tests + publishes to npm automatically
```

One-time setup: add an npm granular access token (scope: graphyloop, read+write) as a GitHub Actions secret named `NPM_TOKEN`. If the token cannot bypass 2FA, fall back to the *Run workflow* action with your current npm one-time password in the `otp` input; `dry_run=true` validates the pipeline without shipping. Users update with `npx -y graphyloop@latest install --force`.

---

## What's New

| Version | Highlights |
|---|---|
| **0.1.3** *(unreleased)* | Fix: the task queue grew without bound — settled tasks are now capped (`GRAPHYLOOP_MAX_TASKS`, default 500) while pending work is never dropped · npm metadata (repository, issues, homepage, keywords, author) so the package links back and is findable · octopus mark + drawn 5-gate workflow diagram |
| **0.1.2** | **Fix: MCP tools worked only after a manual init** — the swarm now initializes lazily on the first tool call, so Claude Code / Codex / Cursor work in a fresh project out of the box · **Fix: re-init after `shutdown` erased the whole memory log** · **Fix: parallel agents silently dropped each other's writes** — state is now lock-guarded (measured: 6 of 12 concurrent writes lost before, 12 of 12 kept after) · state moved to `<project>/.graphyloop/` with automatic migration from `.opencode/graphyloop/` · project-root guard extended to the MCP server · crash-safe atomic writes, corrupt-state quarantine, capped memory log · engine input validation (`--flag=value`, unknown agent types, duplicate ids, malformed task payloads, empty queries) · plugin surfaces CLI crashes/timeouts instead of swallowing them · uninstall no longer skips `AGENTS.md` when `opencode.json` is unparsable · `adapter/*.ts` (1.3k unrunnable lines) no longer published or installed · release gate rejects a tag that disagrees with `package.json` · first test coverage for the OpenCode plugin · 25 new tests (44 total) |
| **0.1.1** | Complete rebrand to the GraphyLoop identity (engine, agents, tool names, config entries) · `graphcrew` agent squad · automatic npm releases via GitHub Actions (tag → test → publish) · copy-paste setup prompt for any AI harness · professional docs, CI matrix (Win/macOS/Linux × Node 20/22/24), AI co-author credits |
| **0.1.0** | Initial release — one-command install for OpenCode, Claude Code, Codex, Cursor · 24-agent squad · 5-gate workflow · MCP server (8 tools) · persistent memory + swarm engine · zero runtime dependencies |

## Why this exists

GraphyLoop started as a personal setup — the agents, rules and glue used every day to keep AI coding sessions disciplined, first in OpenCode and then in Claude Code too. It lived in one home directory, copied by hand from machine to machine, and was never meant to leave it.

It got useful enough that keeping it private stopped making sense. This repository is that setup, packaged so it installs anywhere in one command instead of being reassembled by hand — same workflow, same squad, same memory, now shared.

Use it, fork it, or take the parts you like. Issues and PRs are welcome.

---

## Support

| Resource | Link |
|---|---|
| Source & issues | [github.com/chadixearth/graphyloop](https://github.com/chadixearth/graphyloop) |
| Package | [npmjs.com/package/graphyloop](https://www.npmjs.com/package/graphyloop) |
| Setup prompt (any AI) | [docs/SETUP-PROMPT.md](docs/SETUP-PROMPT.md) |
| Install | `npx graphyloop install` |

## Credits

Built with [**DeepSeek**](https://www.deepseek.com) and [**Claude**](https://www.anthropic.com/claude) (Anthropic) — AI-assisted engineering across design, implementation, and verification. Commits carry the standard co-author trailers:

```
Co-authored-by: Claude <noreply@anthropic.com>
Co-authored-by: DeepSeek <noreply@deepseek.com>
```

## License

MIT © 2026 chadixearth
