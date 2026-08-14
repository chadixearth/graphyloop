# GraphyLoop

One command. Full agentic workflow for OpenCode — swarm orchestration, persistent memory, 24-agent squad, 5-gate delivery.

## Features

- **GraphyLoop swarm + memory** — spawn, coordinate, and track a swarm of specialized agents with persistent, searchable memory. No API keys required. All state lives in `<project>/.opencode/graphyloop/state.json`.
- **Chadi squad** — 24 pre-built agents (explorer, backend, frontend, test, security, reviewer, architect, docs, data, devops, performance, quality, refactor, and more) dispatched as OpenCode task subagents.
- **5-gate workflow** — every task flows through `classify → discover → implement → verify → report`, with industry-style gates (intake, architecture/impact analysis, risk classification, parallel execution, testing, security review, final code review).
- **Auto-init on session start** — the graphyloop plugin initializes the swarm automatically when a session opens in a real project directory.
- **Optional DeepSeek direct mode** — set `DEEPSEEK_API_KEY` to let the graphyloop CLI make direct DeepSeek API calls, bypassing the OpenCode harness.

## Architecture

```
┌───────────────┐   graphyloop_* tools    ┌───────────────────┐   spawn    ┌────────────────────┐
│   OpenCode    │ ─────────────────► │    plugin.js      │ ─────────► │      cli.mjs       │
│  (opencode.ai)│                    │ plugins/graphyloop/    │            │ ~/.opencode/graphyloop/ │
└───────┬───────┘                    └─────────┬─────────┘            └─────────┬──────────┘
        │                                     │                                 │ read/write
        │ session.created / chat.message      │                                 ▼
        │ (auto-init guard)                   │                        ┌────────────────────┐
        │                                     │                        │     state.json     │
        ▼                                     │                        │ <project>/.opencode/│
┌───────────────┐                             │                        │      graphyloop/        │
│  agent-chadi  │                             │                        └────────────────────┘
│ (primary)     │                             │
└───────┬───────┘                             │
        │ dispatches as task subagents        │
        ▼                                     │
┌─────────────────────────────────────────────┴──────────────────────┐
│                  chadi squad — 24 agents                           │
│  explorer · backend · frontend · test · security · reviewer ·      │
│  architect · docs · data · devops · performance · quality ·        │
│  refactor · think · council · memory · vision · graphcrew-* · ...   │
└────────────────────────────────────────────────────────────────────┘
```

OpenCode loads the graphyloop plugin, which exposes `graphyloop_*` tools and auto-initializes the swarm. The tools drive the graphyloop CLI (`~/.opencode/graphyloop/cli.mjs`), which persists swarm + memory state in `<project>/.opencode/graphyloop/state.json`. `agent-chadi` orchestrates: it plans, then dispatches squad agents as OpenCode task subagents.

## Requirements

- [OpenCode](https://opencode.ai)
- Node.js >= 20
- git

## Quick install

```sh
git clone https://github.com/chadixearth/graphyloop.git
cd graphyloop
node setup.mjs
```

Then:

1. Restart OpenCode.
2. Open a real project (not your home directory or a system directory).
3. Ask the agent to run `/chadi-init`.

## What gets installed

| Source | Destination | Purpose |
| --- | --- | --- |
| `adapter/*` | `~/.opencode/graphyloop/` | GraphyLoop CLI + swarm/memory engine (`cli.mjs`, `swarm.ts`, `memory.ts`, …) |
| `plugin/graphyloop/*` | `~/.config/opencode/plugins/graphyloop/` | OpenCode plugin exposing `graphyloop_*` tools, auto-init on session start |
| `agents/*.md` | `~/.config/opencode/agents/` | 24-agent chadi squad (+ `operating-rules.md`) |
| `workflow/AGENTS.md` | `~/.config/opencode/AGENTS.md` | 5-gate workflow rules (skipped if already exists unless `--force`) |
| `config/opencode.commands.json` | merged into `opencode.json` | Slash commands (`chadi-init`, `chadi-fast`, …) |
| `config/opencode.plugin.json` | merged into `opencode.json` | Plugin entry enabling the graphyloop plugin |

Existing files are never overwritten unless `--force` is passed (originals are backed up as `*.bak`). The installer is idempotent — re-running it is safe.

## Usage

### GraphyLoop tools

The plugin exposes these tools to agents:

| Tool | Purpose |
| --- | --- |
| `graphyloop_init` | Initialize the swarm (leader agent + memory store). Idempotent. |
| `graphyloop_status` | Show swarm status: agents, tasks completed/failed, memory entries, pending tasks. |
| `graphyloop_spawn` | Spawn a swarm agent (`coder`, `tester`, `reviewer`, `architect`, `explorer`, `security`, `coordinator`, `frontend`, `data`). Max 8 agents. |
| `graphyloop_distribute` | Distribute tasks across swarm agents; returns assignments with agent type + prompt per task. |
| `graphyloop_record` | Record a task result (`completed` / `failed`); updates agent metrics + success rate. |
| `graphyloop_memory_store` | Store a persistent memory entry (`decision`, `pattern`, `lesson`, `event`, `task`). |
| `graphyloop_memory_search` | Keyword-search stored memories. |
| `graphyloop_shutdown` | Shut down the swarm (terminates agents, keeps memory). |

### Slash commands

Installed commands (all routed to `agent-chadi`):

`chadi-init` · `chadi-fast` · `chadi-review` · `chadi-plan` · `chadi-audit` · `chadi-release` · `chadi-research` · `chadi-confusing` · `chadi-discuss` · `chadi-go` · `chadi-recall` · `chadi-skills`

### The 5-gate workflow

1. **Classify** — risk-classify the request (trivial / standard / heavy) and decide execution lane.
2. **Discover** — explore the codebase: affected files, call paths, architecture, impact analysis.
3. **Implement** — parallel fan-out of squad agents; edits land against the plan.
4. **Verify** — run the real test/lint/typecheck gates; one targeted repair maximum, then stop with evidence.
5. **Report** — delivery summary: what changed, proof (command + decisive output), follow-ups.

## Agentic workflow

GraphyLoop ships a full agentic delivery process. `agent-chadi` is the primary agent and orchestrator; it plans once, then fans out to the squad in parallel, and verifies the result before reporting. All rules live in `workflow/AGENTS.md`, installed to `~/.config/opencode/AGENTS.md`.

Every non-trivial task runs through the 5 gates (above) with mandatory proof before done:

- **Parallel-first execution** — independent work fans out in one batch; independent reads/searches batch together; nothing serial that can run in parallel.
- **Internal-decision policy** — reversible ambiguous decisions are resolved internally via the council (`chadi-council`, four-voice deliberation) rather than bounced back to the user.
- **Lane gates** — frontend changes need a build/typecheck pass plus a Playwright smoke of the touched flow; backend changes need typecheck + tests + input-validation checks; migrations need a dry-run + rollback note before apply; security-sensitive changes require a `chadi-security` review.
- **Evaluator loop** — after implementation, a reviewer passes over the diff before the test gate; findings go back to the implementer for at most one repair cycle.
- **Memory recall** — memories are searched before planning and stored after completion (decisions, lessons, patterns), so the swarm learns across sessions.

### Squad agents

| Agent | Role |
| --- | --- |
| `agent-chadi` | Primary agent. Plans, dispatches, verifies, reports. Runs the 5-gate workflow. |
| `chadi-explorer` | Read-only repo explorer: architecture, affected files, dependencies, route maps. |
| `chadi-think` | Deep thinking/planning for complex reasoning, architecture design, hard problems. Returns a plan, never code. |
| `chadi-architect` | Architecture and integration planning for medium/high-risk changes. |
| `chadi-council` | Decision council: four voices (Architect, Skeptic, Pragmatist, Critic) deliberate ambiguous decisions. |
| `chadi-backend` | Backend/API implementation: routes, services, validation, auth, server behavior. |
| `chadi-frontend` | Frontend/UI implementation and verification: layout, forms, routing, responsiveness. |
| `chadi-test` | Testing and verification: unit, integration, e2e, build, lint, typecheck, regression. |
| `chadi-security` | Security review: auth, RBAC, inputs, uploads, secrets, APIs, DB access, XSS, CSRF, CSP, dependencies. |
| `chadi-reviewer` | Final code review: correctness, maintainability, regressions, config validity, missing tests. |
| `chadi-quality` | Code quality: linters, formatters, type-checkers, convention audits. |
| `chadi-performance` | Performance/reliability review: render, bundle size, API latency, queries, caching, retries. |
| `chadi-refactor` | Safe cross-file refactoring: renames, symbol extraction, module restructuring. |
| `chadi-docs` | Documentation: README, API docs, CHANGELOG, migration guides, inline comments. |
| `chadi-data` | Database/data-flow: schemas, migrations, queries, indexes, data integrity. |
| `chadi-devops` | DevOps/release: env config, deployment, CI, build commands, release notes, rollback plans. |
| `chadi-memory` | Memory subagent: recall before work, store after. |
| `chadi-vision` | Vision subagent: describes images/screenshots/sketches/diagrams (read-only). |
| `chadi-agent-writer` | Meta-agent builder: scaffolds new agents/commands/skills from existing patterns. |
| `story-video-automator` | Media automation: storyline, script, beat sheet, scenes, voiceover plan, render. |
| `graphcrew-builder` | Surgical 1-2 file edits: typo fixes, single-function rewrites, mechanical renames. |
| `graphcrew-fixer` | Minimal fix agent: reads error output, one-file surgical fix. |
| `graphcrew-investigator` | Read-only code locator: `file:line` tables for definitions, callers, usages. |
| `graphcrew-reviewer` | Diff/branch/file reviewer: one line per finding, severity-tagged. |

Plus `operating-rules.md` — universal guardrails applied to all agents.

## Configuration

### Model

Agents ship **without** a `model:` line, so they inherit the model configured in your `opencode.json`. To pin an agent to a specific model, add a `model:` line to its file, e.g.:

```yaml
# ~/.config/opencode/agents/agent-chadi.md
model: <your-model>
```

### Default agent

If your `opencode.json` has no `default_agent`, setup sets it to `agent-chadi` so the workflow activates by default. Change it any time.

### Optional skills

The agents reference skills from the [superpowers](https://github.com/obra/superpowers) collection (`brainstorming`, `systematic-debugging`, `tdd-workflow`), plus `last30days`, `security-review`, `council` and others. They are not bundled with GraphyLoop — install the skills you use (or rely on your existing setup); agents will note a missing skill rather than fake it. `story-video-automator` additionally expects the optional story-video plugin; skip or remove that agent file if you do not use it.

### DeepSeek direct mode (optional)

Set `DEEPSEEK_API_KEY` to let the graphyloop CLI make direct DeepSeek API calls (bypassing the OpenCode harness, e.g. for headless `ask` calls). Without it, all LLM work is routed through OpenCode task subagents. Optionally set `DEEPSEEK_MODEL` to override the default model.

## Uninstall

1. Remove the plugin: `~/.config/opencode/plugins/graphyloop/`
2. Remove the adapter: `~/.opencode/graphyloop/`
3. Remove agent files installed by setup: `~/.config/opencode/agents/` (only the ones setup copied — `chadi-*`, `graphcrew-*`, `agent-chadi.md`, `operating-rules.md`, `story-video-automator.md`)
4. Remove the plugin entry and installed commands from `~/.config/opencode/opencode.json` — or restore your pre-install config from the backup the installer created (`opencode.json.bak-<timestamp>`)
5. Optionally remove `~/.config/opencode/AGENTS.md` if it was installed by setup

## Troubleshooting

**"graphyloop skipped: not a project root"** — the plugin refuses to run in system directories, your home directory, or the OpenCode config directory (it would litter state files there and fail on Windows system dirs). Open a real repository instead.

**Where is the swarm state?** — `<project>/.opencode/graphyloop/state.json`. It is created per project on first init; delete it to reset the swarm for that project.

**"graphyloop CLI not found"** — the plugin expects the CLI at `~/.opencode/graphyloop/cli.mjs`. Re-run `node setup.mjs` to install it.

**Re-running setup is safe** — the installer is idempotent. Existing agent files are skipped (or backed up as `*.bak-<timestamp>` with `--force`), and your `opencode.json` keys are preserved; a timestamped backup is written before any merge.

**Installer flags** — `node setup.mjs [--config-dir DIR] [--graphyloop-dir DIR] [--force] [--skip-agents] [--skip-workflow] [--no-config-merge]`. Any failure prints `ERROR: ...` and exits with code 1; success prints `GRAPH_LOOP_INSTALLED`.

## License

MIT — see [LICENSE](LICENSE).
