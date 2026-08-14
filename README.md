<div align="center">

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
| 🐝 **Swarm orchestration** | Spawn, distribute, and track agents with a hierarchical swarm topology — zero API keys, state in `<project>/.opencode/graphyloop/state.json` |
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

**DeepSeek direct mode** — optional: set `DEEPSEEK_API_KEY` to let the graphyloop engine call DeepSeek directly (bypasses the harness). Not required for anything.

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

---

## Development

```bash
npm test          # 19 tests: MCP protocol E2E + installer preservation/idempotency + uninstall round-trip
npm pack          # build the publishable tarball
```

**Structure:** `bin/` CLI entry · `lib/` installers + MCP server + detection · `plugin/` OpenCode plugin · `adapter/` graphyloop engine · `agents/` squad sources · `workflow/AGENTS.md` rules · `templates/` per-harness files · `scripts/` test runner + CI smoke.

**CI** runs the full matrix (Windows/macOS/Linux × Node 20/22/24) on every push: syntax, tests, fresh-sandbox installer smoke, installed-MCP-server handshake, tarball contents.

### Releasing (automatic)

```bash
npm test                          # 1. verify locally
npm version patch                 # 2. bump (patch | minor | major) — creates a v* tag
git push && git push --tags       # 3. GitHub Actions tests + publishes to npm automatically
```

One-time setup: add an npm granular access token (scope: graphyloop, read+write) as a GitHub Actions secret named `NPM_TOKEN`. If the token cannot bypass 2FA, fall back to the *Run workflow* action with your current npm one-time password in the `otp` input; `dry_run=true` validates the pipeline without shipping. Users update with `npx -y graphyloop@latest install --force`.

---

## Support

| Resource | Link |
|---|---|
| Source & issues | [github.com/chadixearth/graphyloop](https://github.com/chadixearth/graphyloop) |
| Package | [npmjs.com/package/graphyloop](https://www.npmjs.com/package/graphyloop) |
| Setup prompt (any AI) | [docs/SETUP-PROMPT.md](docs/SETUP-PROMPT.md) |
| Install | `npx graphyloop install` |

## Credits

Built with [**Claude**](https://www.anthropic.com/claude) (Anthropic) — AI-assisted engineering across design, implementation, and verification. Commits carry the standard `Co-authored-by: Claude <noreply@anthropic.com>` trailer.

## License

MIT © 2026 chadixearth
