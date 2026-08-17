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

> **Agent = Model + Harness.** The model thinks; the harness gives it tools, memory, loops, and discipline so it can actually work. **GraphyLoop is the harness layer** — one command wires any AI coding harness with a 25-agent squad, coordinated swarms, persistent memory that survives restarts, and a 5-gate delivery workflow. You keep writing code. GraphyLoop handles coordination.

```
User --> Harness (OpenCode / Claude Code / Codex / Cursor / DeepSeek Harness)
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

**Prerequisites:** Node.js ≥ 20 (npm/npx included) and at least one AI harness you want to wire up (OpenCode, Claude Code, Codex, Cursor, Windsurf, DeepSeek Harness — or none yet; GraphyLoop covers that too).

```bash
npx graphyloop install
```

GraphyLoop detects which harnesses you have and wires each one. Then:

1. **Restart your harness** (close and reopen your terminal / editor).
2. **Open a real project** (not your home directory).
3. **Ask your agent to run `/chadi-init`** — the workflow initializes.

| Install path | What you get | Files in your workspace |
|---|---|---|
| `npx graphyloop install` | Everything, for every harness detected | **Zero** — everything lives in your home config (`~/.graphyloop/`, `~/.config/opencode/`, `~/.claude/`, `~/.codex/`, `~/.cursor/`, `~/.dsh/`) |
| `npx graphyloop install --harness opencode` | One harness only | Zero |
| `git clone` + `node setup.mjs` | OpenCode-only, no npm needed | Zero (repo clone aside) |

> **Fresh machine?** No harness configs yet → GraphyLoop installs all five automatically, so you are ready no matter which harness you open next. `--harness all` forces all five; `--harness <name>` targets one.

### Setup with any AI assistant (copy-paste)

Paste the block below into your AI harness — it installs, verifies, and reports on its own. Raw copy: [`docs/SETUP-PROMPT.md`](docs/SETUP-PROMPT.md).

```
You are setting up GraphyLoop (github.com/chadixearth/graphyloop, npm package `graphyloop`) — a one-command agentic workflow kit for AI harnesses: graphyloop swarm + memory engine, a 25-agent squad, a 5-gate delivery workflow, and an MCP server that works in any harness.

Goal: install it for THIS machine's harness(es), verify the install actually works, and report. Do NOT edit any config file by hand — run only the installer. Do NOT run npm publish, npm login, or anything unrelated.

Steps:
1. Prerequisites:
   - Run `node --version` — must be 20 or newer. If older, tell the user to install Node.js 20+ and stop there.
   - Detect which harnesses exist on this machine (check for any of): ~/.config/opencode/  (OpenCode), ~/.claude.json or ~/.claude/  (Claude Code), ~/.codex/  (Codex), ~/.cursor/  (Cursor), ~/.dsh/ or $DSH_HOME  (DeepSeek Harness / `dsh`). On Windows, ~ = %USERPROFILE%.
2. Install:
   - Any harness detected:  npx --yes graphyloop install
   - None detected (fresh machine):  npx --yes graphyloop install --harness all
   - If npx asks "Ok to proceed?", answer yes. If npx is missing, stop and tell the user to install Node.js 20+ (npx ships with npm).
3. Verify — every applicable check must pass:
   - `npx --yes graphyloop doctor` prints the harness table.
   - Core engine files exist: ~/.graphyloop/graphyloop/cli.mjs , ~/.graphyloop/mcp-server.mjs , ~/.graphyloop/lib/mcp.mjs , ~/.graphyloop/lib/engine.mjs .
   - OpenCode (if present): ~/.config/opencode/opencode.json contains plugin entries "./plugins/graphyloop/plugin.js" and "./plugins/server-guard/plugin.js", and ~/.config/opencode/agents/ contains 26 .md files.
   - Claude Code (if present): ~/.claude.json has an mcpServers.graphyloop entry, and ~/.claude/agents/ is populated.
   - Codex (if present): ~/.codex/config.toml contains a [mcp_servers.graphyloop] section.
   - Cursor (if present): ~/.cursor/mcp.json has a "graphyloop" entry.
   - DeepSeek Harness (if present): ~/.dsh/cordis.patch.yml contains a row `id: graphyloop-mcp` naming '@deepseek-ai/dsh-mcp-client', ~/.dsh/AGENTS.md exists, and ~/.dsh/skills/ holds graphyloop-squad. Optional deeper check: `dsh --profile headless --dump-config` prints that row. In dsh the tools are namespaced — call them as mcp__graphyloop__<name> (e.g. mcp__graphyloop__swarm_state).
   - If any check fails: re-run the install with --force (automatic backups) and re-verify. Still failing? Report the exact error and stop.
4. Wrap up: tell the user to RESTART their harness (close/reopen the terminal or editor), open a real project (not their home directory), and ask the agent to run /chadi-init. In the DeepSeek Harness there are no slash commands: ask the agent to load the `graphyloop-squad` skill instead. Give a one-line summary of what was installed.

Do not ask permission for reversible steps — proceed. Stop only for: Node < 20, an install failure, or a prompt you cannot answer.
```

### What you get

| Harness | Agents | Commands | Rules | Tools |
|---|---|---|---|---|
| **OpenCode** | 26 agent files | 15 `/chadi-*` commands | AGENTS.md | graphyloop plugin (`graphyloop_*` tools) + server-guard (Windows) |
| **Claude Code** | 26 agent files | 15 `/chadi-*` commands | AGENTS.md | MCP server (`√ Connected`) |
| **Codex** | 15 prompts | 15 prompts | AGENTS.md | MCP server (`enabled`) |
| **Cursor / Windsurf** | — | — | AGENTS.md | MCP server |
| **DeepSeek Harness** (`dsh`) | 26 role prompts + `graphyloop-squad` skill | — (dsh commands are plugins) | AGENTS.md | MCP server (`mcp__graphyloop__*`) |

Verified in CI on Windows, macOS and Linux × Node 20, 22, 24 — including a real install + MCP handshake smoke on every combination.

In `dsh` the tools are namespaced by the MCP bridge, so they are called
`mcp__graphyloop__plan_feature`, `mcp__graphyloop__memory_search`, and so on. dsh
has no agent files and no file-based slash commands — agents are cordis
compositions, commands are plugins — so the squad installs as a prompt library
(`~/.dsh/graphyloop/{agents,commands}`) and the `graphyloop-squad` skill teaches
the conductor to delegate with dsh's own `subagent` tool.

dsh is also the one harness where the project is **not** the server's working
directory: it is a long-lived host launched from wherever you typed `dsh`, and the
project is the workspace you pick in the UI. So the patch row states
`GRAPHYLOOP_DSH_HOME`, and the server reads the open workspace from dsh's own
store on every tool call — switch workspace and the next call lands in the new
project, no restart. Pin one project instead by adding `GRAPHYLOOP_PROJECT_ROOT`
to the same `env:` block.

---

## What You Get

| Capability | Description |
|---|---|
| 🐝 **Swarm orchestration** | Spawn, distribute, and track agents with a hierarchical swarm topology — zero API keys, state in `<project>/.graphyloop/state.json` |
| 🧠 **Persistent memory** | Store decisions, patterns, lessons, and events; keyword-search across sessions. Survives restarts and compactions |
| 🤖 **25-agent squad** | Specialized agents for exploration, backend, frontend, testing, security, review, refactoring, docs, data, performance, and more (see [Squad](#squad-agents)) |
| 🛡️ **5-gate delivery workflow** | Classify → Discover → Implement → Verify → Report, with lane-based verification and evidence-first reporting |
| 🔌 **Universal MCP bridge** | The same graphyloop tools work in Claude Code, Codex, Cursor, Windsurf, OpenCode, DeepSeek Harness — any MCP-capable harness |
| 📋 **15 slash commands** | `chadi-init` · `chadi-fast` · `chadi-review` · `chadi-plan` · `chadi-waves` · `chadi-db` · `chadi-deploy` · `chadi-audit` · `chadi-release` · `chadi-research` · `chadi-confusing` · `chadi-discuss` · `chadi-go` · `chadi-recall` · `chadi-skills` |
| 🌊 **Wave planner** | One call turns "I want an inventory system" into contract → **database ∥ backend ∥ frontend ∥ tests** → integration → **test ∥ typecheck ∥ security ∥ performance ∥ review** → gated deploy, with file ownership and dependencies the engine enforces |
| 🔑 **Supabase + Vercel credentials** | Store keys once per project (chmod 600, git-ignored before the first write), sync them into the env file the framework reads, and preflight database/deploy work. Values are never returned to the model |
| 📚 **71 bundled skills** | 11 graphyloop-authored (contract-first waves, API hardening, frontend security, accessibility, web performance, dependency audit, Supabase, Vercel, secrets, memory) plus the full curated library — design systems, branding, video/AI, research, workflow, GSAP and three.js packs — so every skill an agent routes on resolves on a fresh install. A skill you already have is never overwritten |
| 🔒 **Config safety** | Timestamped backups before every write, never overwrites your config keys, idempotent re-runs, uninstall removes only byte-identical copies |
| 🪟 **Windows hang guard** | `npm run dev` inside an agent session no longer freezes the turn: server-guard rewrites it into a launcher that starts the server without inheriting the tool's stdout pipe, so the call returns in milliseconds while the server keeps serving (`-Stop` kills the tree) |
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
User --> Harness (OpenCode / Claude Code / Codex / Cursor / Windsurf / DeepSeek Harness)
              |
              v
        MCP bridge (15 graphyloop tools)  <----  OpenCode plugin (graphyloop_* tools)
              |
              v
        graphyloop engine (adapter/cli.mjs)
        (swarm orchestration + persistent memory, JSON state)
              |
              +-----> 25-agent squad (explorer, backend, frontend,
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
| `plan_feature` | Turn a feature request into a **wave plan** — contract → parallel builders → integration → parallel verifiers → gated deploy, with per-lane file ownership, acceptance checks and `dependsOn` |
| `task_distribute` | Distribute tasks across the swarm. Honours `wave` + `dependsOn`, and answers with `dispatchNow` (safe to fan out) vs `blocked` (with `waitingOn`) |
| `task_record` | Record a task result (updates agent metrics, reports what the result unblocked) |
| `swarm_state` | Swarm status + memory count + ready/blocked tasks per wave |
| `memory_store` | Persist a memory entry — `decision`, `pattern`, `lesson`, `event`, `task` |
| `memory_search` | Keyword-search stored memories — ranked by match quality with a recency bias, optional `type` filter |
| `memory_forget` | Delete one memory by id, so a wrong lesson can be corrected instead of recalled forever |
| `secrets_status` | Masked readiness report for Supabase/Vercel credentials — which keys exist, where each comes from, what is missing. **Never returns a value** |
| `secrets_set` | Store one credential in `<project>/.graphyloop/secrets.json` (chmod 600, git-ignored before the first write) |
| `env_sync` | Write stored credentials into the env file the framework reads, add public aliases for public keys only, refresh a values-free `.env.example`, guard `.gitignore` |
| `preflight` | Readiness check + ordered command plan for `db` / `deploy` — blockers, warnings, and gates on every destructive step. Executes nothing |
| `skills_status` | Which skills are actually installed (project + OpenCode + Claude roots), which bundled ones are present, which referenced ones are missing — so an agent states a gap instead of faking a skill |
| `shutdown` | Gracefully stop the swarm |

Tools run **in-process**: the server calls the engine directly instead of spawning a child process per call. Since 0.4.0 the engine also stops re-reading its state file on every call — it caches the parsed state against the file's stat signature (mtime + size + inode + ctime), so an outside write still invalidates it on the next call while a read costs one `stat`:

| per tool call (800 memories, Node 24 / Windows) | before | after |
|---|---|---|
| `swarm_state` / `agent_list` | 2.9 ms | **0.013 ms** |
| `memory_search` | 6.8 ms | **0.97 ms** |
| `memory_store` | 7.5 ms | **3.0 ms** |
| `plan_feature` | 7.7 ms | **2.8 ms** |
| `ping`, end to end over stdio | — | **0.12 ms** (a do-nothing echo server measures 0.15 ms) |

A mutating call still rewrites the whole state file under the lock — that is what guarantees a crash mid-write cannot lose a memory — so writes stay at the cost of one atomic file replace. Reproduce any of it with `npm run bench` (`--save` / `--compare` to diff two runs); `engine.metrics()` reports loads vs parses when you want to know why a session feels slow.


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
| **Implementation** | `chadi-backend` · `chadi-frontend` · `chadi-integrator` · `graphcrew-builder` · `graphcrew-fixer` · `chadi-refactor` |
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
npx graphyloop install [--harness opencode|claude|codex|cursor|dsh|all]
                       [--force] [--skip-agents] [--skip-workflow]
                       [--no-config-merge] [--config-dir DIR] [--graphyloop-dir DIR]
npx graphyloop update [--check]     # refresh an existing install in place
npx graphyloop doctor              # what's detected on this machine + installed core version
npx graphyloop status [--json]     # swarm status via the graphyloop engine
npx graphyloop uninstall           # remove only what graphyloop added
npx graphyloop mcp                 # run the MCP server directly (stdio)
```

| Flag | Meaning |
|---|---|
| `--harness` | `opencode` / `claude` / `codex` / `cursor` / `dsh` / `all` — default: every detected harness |
| `--home DIR` | Install into a different home directory (testing, containers). Also wins over `$DSH_HOME`, so a sandboxed run cannot reach a real harness home |
| `--force` | Overwrite existing graphyloop files (previous copies backed up as `*.bak-<timestamp>`) |
| `--check` | `update` only: report version/file drift and exit without writing |
| `--skip-agents` / `--skip-workflow` | Skip agents/prompts or AGENTS.md |
| `--no-config-merge` | Never touch `opencode.json`, `.claude.json`, `config.toml`, `mcp.json`, `cordis.patch.yml` |

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

**Engine limits** — `GRAPHYLOOP_MAX_MEMORIES` caps the memory log (default 2000, oldest dropped first). `GRAPHYLOOP_LOCK_TIMEOUT_MS` is how long a command waits for the state lock (default 10000). `GRAPHYLOOP_PRETTY_STATE=1` writes `state.json` indented — the default is compact, which is ~46% fewer bytes per write.

**Default agent (OpenCode)** — setup sets `default_agent: agent-chadi` only when you don't have one. Change it any time.

**Skills** — 71 skills install with the squad. Eleven are graphyloop-authored and carry the workflow's own discipline:

| Skill | Loaded when |
|---|---|
| `graphyloop-waves` | the request spans layers — contract-first parallel dispatch |
| `api-contract-design` | two lanes share an interface — envelope, status codes, pagination, breaking-change rules |
| `api-hardening` | any endpoint, server action, webhook, upload, worker — per-route authz/IDOR, validation, rate limits, SSRF, JWT |
| `frontend-security` | client code renders user data, stores a token, adds an env var or a third-party script — XSS sinks, CSP, key leakage |
| `web-accessibility` | forms, dialogs, menus, tables — WCAG 2.2 AA, focus, names, axe + keyboard verification |
| `web-performance` | slow page, bundle growth, LCP/INP/CLS/TTFB — baseline, fix by payoff, prove, budget |
| `dependency-audit` | new dependency, lockfile diff, CVE alert — typosquat/install-script vetting, triage by reachability |
| `supabase-setup` | schema, RLS, migration order |
| `vercel-deploy` | gated deploy + rollback |
| `secrets-hygiene` | any key, token or connection string |
| `swarm-memory` | recall before planning, record after |

The rest is the curated library the squad's agent files already route on — design systems (`minimalist-ui`, `high-end-visual-design`, `image-to-code`, `redesign-existing-projects`), workflow (`brainstorming`, `tdd-workflow`, `systematic-debugging`, `writing-plans`, `verification-before-completion`, `security-review`, `security-scan`, `council`), data and delivery (`postgres-patterns`, `prisma-patterns`, `database-migrations`, `deployment-patterns`, `github-ops`, `terminal-ops`, `e2e-testing`, `error-handling`), research (`last30days`, `deep-research`, `exa-search`, `graphify`), plus GSAP, three.js and video/branding packs.

They land in `~/.config/opencode/skills/`, `~/.claude/skills/` and `~/.dsh/skills/` (where the DeepSeek Harness also gets `graphyloop-squad`, its stand-in for the agent files and slash commands dsh does not have).

An existing skill of the same name is **never** overwritten — not by `install --force`, not by `update`. Your copy wins, always.

Call `skills_status` to see exactly which skills are present on a machine and which the squad still expects. A handful of names agents reference are deliberately not bundled (`design-taste-frontend`, `api-connector-builder`, `benchmark-optimization-loop`, `ai-regression-testing`, `hyperframes`, `remotion-to-hyperframes`); agents state a missing skill in one line rather than faking it, and a test blocks any agent that starts routing on a skill nobody tracks.

---

## Updates

```bash
npx -y graphyloop@latest update           # refresh the install in place
npx graphyloop update --check             # report the drift, write nothing
npx graphyloop doctor                     # installed core version vs this package
```

`update` overwrites graphyloop-owned files (timestamped backup first), repairs a core tree that is missing newer modules, and leaves your config keys, your own plugins and your edited files alone. `--check` prints `up-to-date` / `update-available` / `incomplete` / `not-installed` (add `--json` for a machine-readable answer) without touching anything.

`doctor` prints the installed core version next to the package version — check it first when a graphyloop tool "does not exist" in a harness that is otherwise wired correctly. Re-running plain `npx graphyloop install` is still always safe (idempotent, never clobbers your config); `update` is the same operation with the graphyloop-owned files refreshed.

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
| "graphyloop skipped: ... not a project root" **in dsh** | Update the install (`npx -y graphyloop@latest update`) and restart dsh. dsh's cwd is its launch directory, not your project; the fix teaches the server to read the open workspace from `$DSH_HOME/storages/workspace.json`, which it can only do once the `graphyloop-mcp` row carries `env: GRAPHYLOOP_DSH_HOME`. Pin a project instead with `GRAPHYLOOP_PROJECT_ROOT` in that same `env:` block |
| MCP server not showing in Claude Code | `claude mcp list`; if missing, re-run install and restart Claude Code |
| Codex does not load the server | Check `~/.codex/config.toml` has `[mcp_servers.graphyloop]`; restart codex |
| dsh does not show the tools | `dsh --profile headless --dump-config` should print the `graphyloop-mcp` row; the tools are namespaced as `mcp__graphyloop__*`, not bare names |
| dsh fails at boot after an edit to `cordis.patch.yml` | The file must stay a top-level YAML array — dsh fails loud rather than skipping a patch it cannot parse. Restore the `*.bak-<timestamp>` copy next to it |
| Re-running setup "skips" files | Normal — that is the preserve-your-config behavior. Use `--force` to refresh (backups are made first) |
| Config merge warnings about `opencode.jsonc` | OpenCode gives `.jsonc` precedence; review it for the plugin/commands keys |
| I edited an agent and uninstall kept it | Intended — uninstall only removes byte-identical copies |
| `timed out ... waiting for the graphyloop state lock` | Another graphyloop command is mid-write. A lock orphaned by a killed process clears itself after 30s; raise `GRAPHYLOOP_LOCK_TIMEOUT_MS` if your swarm is very wide |
| My swarm history "disappeared" after updating | It moved: `.opencode/graphyloop/state.json` → `.graphyloop/state.json`, migrated on first use. `npx graphyloop status` prints the active `stateFile` path |
| `state.json.corrupt-<timestamp>` appeared | The engine found an unparsable state file, kept it for inspection, and started clean rather than failing every command |

---

## Development

```bash
npm test              # 184 tests across 11 suites
npm run test:fast     # everything except the installer/update suites (seconds)
npm run test:list     # list the suites
npm run test:secrets  # secrets suite only
npm run test:hotpath  # state-cache + transport invariants
npm run bench         # latency report (--save / --compare for a before/after)
npm pack              # build the publishable tarball
```

Suites are split by area and the runner takes a filter (`node scripts/run-tests.mjs planner mcp`), so iterating on one area does not pay for the installer suite.

**Structure:** `bin/` CLI entry · `lib/` engine + installers + MCP server + detection · `plugin/` OpenCode plugin · `adapter/cli.mjs` graphyloop engine · `agents/` squad sources · `workflow/AGENTS.md` rules · `templates/` per-harness files · `scripts/` test runner + CI smoke + benchmark · `assets/` logo + diagrams (SVG, light/dark pairs; referenced by absolute URL so npm renders them too, and kept out of the tarball).

`adapter/*.ts` is the original TypeScript design reference — nothing imports it and no build step compiles it, so it is neither published nor installed (CI fails the build if a `.ts` file reaches the tarball).

**CI** runs the full matrix (Windows/macOS/Linux × Node 20/22/24) on every push: syntax, tests, fresh-sandbox installer smoke, installed-MCP-server handshake, tarball contents.

**Git hooks** — `git config core.hooksPath hooks` in a fresh clone enables both: `prepare-commit-msg` adds the AI co-author trailers, and `pre-push` runs the suite and blocks the push if it fails (`--no-verify` to override).

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
| **0.4.0** | **Latency: the state file is no longer re-parsed on every tool call.** `state.json` is the swarm's memory, so it grows — at 800 memories a read-only `swarm_state` spent 2.9 ms in `JSON.parse` before doing anything, and every write paid it again. State is now cached against the file's **stat signature** (mtime + size + inode + ctime); writes are tmp + rename, so the inode changes on every write and anything else touching the file — a spawned CLI, a second harness, your editor — invalidates the cache on the next call. A wrong signature costs a redundant parse, never a stale answer · **`swarm_state` 2.9 → 0.013 ms, `memory_search` 6.8 → 0.97 ms (typed: 4.0 → 0.14 ms), `memory_store` 7.5 → 3.0 ms, `plan_feature` 7.7 → 2.8 ms**, measured with the old and new engine alternating in one process so machine drift hits both arms; end to end over stdio `swarm_state` 2.6 → 0.19 ms and throughput 311 → 26,062 calls/sec · recall builds each entry's searchable text **once** (`WeakMap` keyed by the entry, so nothing has to invalidate it) instead of re-stringifying the whole store per query · state is written **compact** (~46% fewer bytes per write; `GRAPHYLOOP_PRETTY_STATE=1` restores the indented form) · the lock costs **one syscall** uncontended and backs off from 0.25 ms instead of a flat 20 ms, with the mutex and its no-lost-writes guarantee unchanged · `detectStack()` is cached and shared by `plan_feature` / `env_sync` / `preflight` instead of re-scanning the project three times per plan · `ping` and `tools/list` answer from a pre-serialized template, and `readline` is replaced by a resumable newline splitter so a 1 MB `task_distribute` payload is reassembled in linear time · **`npm run bench`** (`--save` / `--compare`) and **`engine.metrics()`** so every number above is reproducible instead of asserted · deliberately unchanged: a write still rewrites the whole file under the lock (that is what makes a crash mid-write unable to lose a memory), and cold start stays ~60 ms — `enableCompileCache()` measured 0.93–0.99x in an interleaved A/B and was dropped · 18 new tests (184 total), all observational rather than timed, including a write from another OS process being visible to the next call and cached search text producing byte-identical ranking to a cold engine · includes the 0.3.1 dsh fix below, which was never published on its own |
| **0.3.1** | **Fix: every graphyloop tool failed in the DeepSeek Harness with "graphyloop skipped: `<your home>` is not a project root".** The server took its project root from `process.cwd()` at startup — right for a harness that spawns one MCP server per project, wrong for dsh: dsh is a long-lived host whose cwd is the directory you typed `dsh` in (usually your home), while the project is the **workspace** you pick in the UI and it lives in dsh's own store. So the root was the home directory, the guard refused it, and no tool ever ran — with the workspace open the whole time · The root is now resolved **per tool call**: `GRAPHYLOOP_PROJECT_ROOT` pin → dsh's workspace store (`storages/workspace.json`, newest first; `session_projcache.json` as fallback) → cwd. Switching workspace mid-session lands in the new project on the next call, each root gets its own engine and its own `<root>/.graphyloop/state.json`, and the chosen root is logged on stderr · The `graphyloop-mcp` patch row now carries `env: GRAPHYLOOP_DSH_HOME` — `dsh-mcp-client` scrubs every `DSH_*` name out of the child env, so an explicit entry is the only way the server can know which dsh home to read; `install`/`update` **upgrades an existing row in place** (backup first) instead of skipping it because the id was already there, and uninstall still recognises both shapes · a row you edited yourself is left alone, with the missing key named in the install report · the refusal message now says where dsh keeps the project and how to pin one · 6 new tests (166 total) |
| **0.3.0** | **The full skill library now ships — 71 skills, so every name an agent routes on resolves on a fresh install** (design systems, branding, video/AI, research, workflow, GSAP and three.js packs; `install-skills.mjs` discovers them, a skill you already have is still never overwritten) · **Six of them are new and graphyloop-authored — the frontend and backend-security discipline the squad already routed on but nobody shipped** (11 total, all graphyloop-authored): `frontend-security` (XSS sinks, token storage, `NEXT_PUBLIC_*` leakage caught in the build output, CSP verified with `curl -sI`, `postMessage`/iframe trust) · `api-hardening` (route-by-route authz and IDOR, boundary validation, rate limits, SSRF, upload magic bytes, JWT `alg`/`aud`, response allow-lists) · `api-contract-design` (one envelope, status-code table, error shape, cursor pagination, safe-vs-breaking change rules) · `web-accessibility` (WCAG 2.2 AA, focus trap/restore, names, live regions, axe-in-Playwright + a manual keyboard pass) · `web-performance` (baseline → fix by payoff → prove → CI budget) · `dependency-audit` (typosquat/install-script vetting, advisory triage by reachability). Each is embedded in the agents that own it — `chadi-frontend`, `chadi-backend`, `chadi-security`, `chadi-performance`, `chadi-reviewer`, `chadi-quality`, `chadi-test`, `chadi-architect`, `chadi-integrator`, `chadi-devops`, `graphcrew-builder` — plus the conductor's orchestrator-level pre-load list · **Fix: `skills_status` hid the very gap it exists to report** — the engine's referenced-skill list had drifted from the agent files, so twelve names the squad routes on (nine from other collections, three that exist nowhere public) were reported as `missing: []`; the list now covers every `Primary:`/`Supporting:` footer entry and a new test fails the build on the next drift · agent footers no longer hardcode the bundled list · **DeepSeek Harness (`dsh`) support** — `install` now wires dsh too, through its home-level patch layer (`$DSH_HOME/cordis.patch.yml`): one `insert` row mounting `@deepseek-ai/dsh-mcp-client` at `~/.graphyloop/mcp-server.mjs`, which applies to every profile, hot-reloads, and needs no pnpm step. Tools arrive namespaced as `mcp__graphyloop__*` · `$DSH_HOME/AGENTS.md` for the 5-gate rules, the bundled skills in `$DSH_HOME/skills`, and — because dsh has no agent files and no file-based slash commands — the squad as a prompt library plus a `graphyloop-squad` skill that delegates through dsh's own `subagent` tool · `skills_status` now reads the dsh and `~/.agents` skill roots · the patch layer stays the user's file: append-only, backed up first, comments and `!!js` expressions untouched, uninstall content-matched · 17 new tests (160 total), verified against `@deepseek-ai/dsh` 0.1.0-rc.6 including dsh's own MCP SDK and tool-schema gate |
| **0.2.1** | **Fix: `npm run dev` no longer hangs a Windows agent session forever.** The shell tool reads stdout until EOF, and EOF needs every handle to the pipe's write end closed — `Start-Process -RedirectStandardOutput/-RedirectStandardError` calls `CreateProcess` with `bInheritHandles=TRUE`, so the detached dev server inherited the tool's pipe and held it for its whole life. The workflow rules had recommended exactly that pattern as "the only safe detach". Measured with a self-exiting fixture: the launcher exited at 2.3 s, the caller's stdout EOF only arrived at 21.8 s — when the server died; with a real dev server, never · **`server-guard` plugin + `start-server.ps1` now ship with the kit** (they were documented in the rules but never installed): inline `npm run dev`/`node server.js`/`python -m http.server` are rewritten into a launcher that redirects inside a generated `.cmd` and starts it via ShellExecuteEx (`bInheritHandles=FALSE`) — EOF lag **19,498 ms → 8 ms**, server still serving after the call returns · `-Stop` now kills the whole process tree (npm's grandchildren survived a plain PID kill) and pid files are per-port · `Start-Process` with stdio redirects and no `-Wait` is blocked instead of whitelisted · 28 new tests (143 total) |
| **0.2.0** | **Bundled skills** — `graphyloop-waves`, `supabase-setup`, `vercel-deploy`, `secrets-hygiene`, `swarm-memory` install with the squad, so a fresh setup is usable immediately; a skill you already have is never overwritten, and `skills_status` reports what is actually present · **`chadi-integrator`**, the missing owner of the wave-2 join, with an explicit contract-drift policy · **Wave planner** (`plan_feature`) — "I want an inventory system" becomes contract → **database ∥ backend ∥ frontend ∥ tests** → integration → **test ∥ typecheck ∥ security ∥ performance ∥ review** → gated deploy, and `task_distribute` now enforces it: `wave` + `dependsOn` gate dispatch, `dispatchNow`/`blocked` say what may run, `task_record` reports what a result unblocked · **Supabase + Vercel credentials** — `secrets_status` (masked, never a value), `secrets_set` (chmod 600 store, git-ignored before the first write), `env_sync` (values move file-to-file into `.env.local`, public aliases for public keys only), `preflight` (`db`/`deploy` blockers + gated command plan, executes nothing) · **`graphyloop update [--check]`** — refresh an install in place, repair a core tree missing new modules, keep your config keys; `doctor` now prints the installed core version · `/chadi-waves`, `/chadi-db`, `/chadi-deploy` · Fix: a stale hardcoded tool count in the installer suite made a spawned MCP server hold its stdio pipes on failure, hanging the whole test run instead of reporting it · test suites split per area with a filterable runner (115 tests) |
| **0.1.3 / 0.1.4** | **MCP tools now run in-process** — the engine moved to `lib/engine.mjs` and is called directly instead of spawning a child process per tool call: **3.8 ms vs 73.7 ms** per call, and a slow call no longer blocks the server · **`memory_forget`** so a wrong memory can be corrected rather than recalled forever · memory search gains recency ranking and a `type` filter · Fix: the task queue grew without bound — settled tasks are capped (`GRAPHYLOOP_MAX_TASKS`, default 500), pending work never dropped · `initialize` echoes the client's protocol version instead of always asserting ours · npm metadata (repository, issues, homepage, keywords, author) · octopus mark + drawn 5-gate workflow diagram · CHANGELOG and contributor docs · 50 tests · a pre-push hook that blocks a push whose suite fails |
| **0.1.2** | **Fix: MCP tools worked only after a manual init** — the swarm now initializes lazily on the first tool call, so Claude Code / Codex / Cursor work in a fresh project out of the box · **Fix: re-init after `shutdown` erased the whole memory log** · **Fix: parallel agents silently dropped each other's writes** — state is now lock-guarded (measured: 6 of 12 concurrent writes lost before, 12 of 12 kept after) · state moved to `<project>/.graphyloop/` with automatic migration from `.opencode/graphyloop/` · project-root guard extended to the MCP server · crash-safe atomic writes, corrupt-state quarantine, capped memory log · engine input validation (`--flag=value`, unknown agent types, duplicate ids, malformed task payloads, empty queries) · plugin surfaces CLI crashes/timeouts instead of swallowing them · uninstall no longer skips `AGENTS.md` when `opencode.json` is unparsable · `adapter/*.ts` (1.3k unrunnable lines) no longer published or installed · release gate rejects a tag that disagrees with `package.json` · first test coverage for the OpenCode plugin · 25 new tests (44 total) |
| **0.1.1** | Complete rebrand to the GraphyLoop identity (engine, agents, tool names, config entries) · `graphcrew` agent squad · automatic npm releases via GitHub Actions (tag → test → publish) · copy-paste setup prompt for any AI harness · professional docs, CI matrix (Win/macOS/Linux × Node 20/22/24), AI co-author credits |
| **0.1.0** | Initial release — one-command install for OpenCode, Claude Code, Codex, Cursor · 25-agent squad · 5-gate workflow · MCP server (8 tools) · persistent memory + swarm engine · zero runtime dependencies |

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
