# GraphyLoop reference

Long-form reference material that used to live in the README. Back to the [README](../README.md) · [Harness guide](harnesses.md) · [Landing page](https://chadixearth.github.io/graphyloop/)

## Contents

- [MCP server internals](#mcp-server-internals)
- [Configuration and skills](#configuration)
- [Troubleshooting](#troubleshooting)
- [Development and releasing](#development)
- [What's New](#whats-new)

## MCP server internals

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

## Configuration

**Model** — agents ship without a pinned model so they inherit your harness's default. To pin one (OpenCode):

```yaml
# ~/.config/opencode/agents/agent-chadi.md
model: <your-model>
```

**DeepSeek direct mode** — optional: set `DEEPSEEK_API_KEY` to let the graphyloop engine call DeepSeek directly (bypasses the harness). Model comes from `--model` or `DEEPSEEK_MODEL`; `deepseek-v4-flash` (default) and `deepseek-v4-pro` are the current ids. Not required for anything.

**Engine limits** — `GRAPHYLOOP_MAX_MEMORIES` caps the memory log (default 2000, oldest dropped first). `GRAPHYLOOP_LOCK_TIMEOUT_MS` is how long a command waits for the state lock (default 10000). `GRAPHYLOOP_PRETTY_STATE=1` writes `state.json` indented — the default is compact, which is ~46% fewer bytes per write.

**Default agent (OpenCode)** — setup sets `default_agent: agent-chadi` only when you don't have one. Change it any time.

**Skills** — 70 skills install with the squad (69 curated + `graphyloop-workflow`, the on-demand workflow v2 doctrine). Twelve are graphyloop-authored and carry the workflow's own discipline:

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
| `graphyloop-workflow` | Workflow v2 on demand — how harnesses with their own rules file (Oh My Pi, Gemini CLI, Claude Code) load the doctrine |

The rest is the curated library the squad's agent files already route on — design systems (`minimalist-ui`, `high-end-visual-design`, `image-to-code`, `redesign-existing-projects`), workflow (`brainstorming`, `tdd-workflow`, `systematic-debugging`, `writing-plans`, `verification-before-completion`, `security-review`, `security-scan`, `council`), data and delivery (`postgres-patterns`, `prisma-patterns`, `database-migrations`, `deployment-patterns`, `github-ops`, `terminal-ops`, `e2e-testing`, `error-handling`), research (`last30days`, `deep-research`, `exa-search`, `graphify`), plus GSAP, three.js and video packs.

They land in `~/.config/opencode/skills/`, `~/.claude/skills/`, `~/.omp/agent/skills/`, `~/.gemini/skills/` and `~/.dsh/skills/` (where the DeepSeek Harness also gets `graphyloop-squad`, its stand-in for the agent files and slash commands dsh does not have).

An existing skill of the same name is **never** overwritten — not by `install --force`, not by `update`. Your copy wins, always.

Call `skills_status` to see exactly which skills are present on a machine and which the squad still expects. A handful of names agents reference are deliberately not bundled (`design-taste-frontend`, `api-connector-builder`, `benchmark-optimization-loop`, `ai-regression-testing`, `hyperframes`, `remotion-to-hyperframes`); agents state a missing skill in one line rather than faking it, and a test blocks any agent that starts routing on a skill nobody tracks.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `graphyloop CLI not found at ...` from an MCP tool | Run `npx graphyloop install` — the core engine is missing |
| "graphyloop skipped: not a project root" | Open a real project — the engine deliberately refuses home/system directories |
| "graphyloop skipped: ... not a project root" **in dsh** | Update the install (`npx -y graphyloop@latest update`) and restart dsh. dsh's cwd is its launch directory, not your project; the fix teaches the server to read the open workspace from `$DSH_HOME/storages/workspace.json`, which it can only do once the `graphyloop-mcp` row carries `env: GRAPHYLOOP_DSH_HOME`. Pin a project instead with `GRAPHYLOOP_PROJECT_ROOT` in that same `env:` block |
| Oh My Pi does not list graphyloop | `~/.omp/agent/mcp.json` must have `mcpServers.graphyloop`; run `npx graphyloop doctor` (it prints a `fix:` line for any present-but-unwired harness) and restart `omp` |
| Gemini CLI does not list graphyloop | `~/.gemini/settings.json` must have `mcpServers.graphyloop` (if the file has comments or is otherwise unparsable, install warns and prints the JSON entry to add by hand); `/chadi-init` comes from `~/.gemini/commands/chadi-init.toml`. Re-run `npx graphyloop install --harness gemini` and restart |
| I already have an `AGENTS.md` / `GEMINI.md` in omp / gemini | Kept, never clobbered — even with `--force`. The workflow loads on demand from the bundled `graphyloop-workflow` skill instead |
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
npm test              # the full suite (no network, no deps)
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

**Git hooks** — `git config core.hooksPath hooks` in a fresh clone enables `pre-push`, which runs the suite and blocks the push if it fails (`--no-verify` to override).

### Releasing (automatic)

```bash
npm test                          # 1. verify locally
npm version minor                 # 2. bump (patch | minor | major) — commits and creates the v* tag
git push --follow-tags            # 3. GitHub Actions tests, then publishes to npm
```

`.github/workflows/publish.yml` publishes with **npm trusted publishing** (OIDC, with provenance) — no long-lived token needed. One-time setup on npmjs.com: the `graphyloop` package → *Settings* → *Trusted publishing* → *GitHub Actions*, repository `chadixearth/graphyloop`, workflow `publish.yml`. An `NPM_TOKEN` secret (granular access token, scope graphyloop, read+write) is an optional fallback. The *Run workflow* action (`workflow_dispatch`) also accepts an `otp` input (your current npm one-time password) and `dry_run=true`, which validates the pipeline without shipping. Users update with `npx -y graphyloop@latest install --force`.

CLI behaviour worth knowing when scripting a release smoke test: a bare unknown flag with no command (`graphyloop --doctor`) exits 1 with `ERROR: unknown option "--doctor" (no command given)` and writes nothing, and `install` has no dry-run — `graphyloop install --check` / `--dry-run` exit 1; preview with `graphyloop doctor`.

---

## What's New

| Version | Highlights |
|---|---|
| **0.5.0** | **Workflow v2 — modern agent workflow, any harness, one command.** Bare `npx graphyloop` now installs · two new harnesses: **Oh My Pi** (`omp`) and **Gemini CLI** (`gemini`) — 7 in total · `graphyloop doctor` shows present/wired per harness with a one-line `fix:` and ends in `GRAPH_LOOP_DOCTOR_OK` · `--harness claude,omp` accepts a comma list · harness-neutral workflow v2 (recall → size → context pack + contract → one wave → verify → report) and the bundled `graphyloop-workflow` skill · `plan_feature` now writes a `ctx-<slug>.md` context pack next to the contract and ends every builder lane brief with a turn-economy footer · discovery: llms.txt, landing page, FAQ |
| **0.4.1** | **Fix: the project-root guard compared paths textually, so the home directory reached through a symlink was not recognised as the home directory** — on macOS `process.cwd()` returns the resolved path (`/private/var/...`) while a symlinked `HOME` is the link (`/var/...`), so a server whose cwd *was* the home directory passed the guard and auto-init wrote `<home>/.graphyloop/state.json`, which is precisely what the guard exists to prevent. Both guards (MCP server + the mirrored OpenCode plugin) now compare canonical paths (`realpathSync.native`, falling back to `resolve()` for a path that does not exist yet), cached per root so it costs one realpath per root rather than one per call · caught by the macOS CI matrix on the v0.4.0 tag, which was never published — 0.4.1 is that release plus this fix · the regression test uses a junction on Windows (no elevation needed) so it runs on every platform, and was verified to fail under the old comparison |
| **0.4.0** | **Latency: the state file is no longer re-parsed on every tool call.** `state.json` is the swarm's memory, so it grows — at 800 memories a read-only `swarm_state` spent 2.9 ms in `JSON.parse` before doing anything, and every write paid it again. State is now cached against the file's **stat signature** (mtime + size + inode + ctime); writes are tmp + rename, so the inode changes on every write and anything else touching the file — a spawned CLI, a second harness, your editor — invalidates the cache on the next call. A wrong signature costs a redundant parse, never a stale answer · **`swarm_state` 2.9 → 0.013 ms, `memory_search` 6.8 → 0.97 ms (typed: 4.0 → 0.14 ms), `memory_store` 7.5 → 3.0 ms, `plan_feature` 7.7 → 2.8 ms**, measured with the old and new engine alternating in one process so machine drift hits both arms; end to end over stdio `swarm_state` 2.6 → 0.19 ms and throughput 311 → 26,062 calls/sec · recall builds each entry's searchable text **once** (`WeakMap` keyed by the entry, so nothing has to invalidate it) instead of re-stringifying the whole store per query · state is written **compact** (~46% fewer bytes per write; `GRAPHYLOOP_PRETTY_STATE=1` restores the indented form) · the lock costs **one syscall** uncontended and backs off from 0.25 ms instead of a flat 20 ms, with the mutex and its no-lost-writes guarantee unchanged · `detectStack()` is cached and shared by `plan_feature` / `env_sync` / `preflight` instead of re-scanning the project three times per plan · `ping` and `tools/list` answer from a pre-serialized template, and `readline` is replaced by a resumable newline splitter so a 1 MB `task_distribute` payload is reassembled in linear time · **`npm run bench`** (`--save` / `--compare`) and **`engine.metrics()`** so every number above is reproducible instead of asserted · deliberately unchanged: a write still rewrites the whole file under the lock (that is what makes a crash mid-write unable to lose a memory), and cold start stays ~60 ms — `enableCompileCache()` measured 0.93–0.99x in an interleaved A/B and was dropped · 18 new tests (184 total), all observational rather than timed, including a write from another OS process being visible to the next call and cached search text producing byte-identical ranking to a cold engine · includes the 0.3.1 dsh fix below, which was never published on its own |
| **0.3.1** | **Fix: every graphyloop tool failed in the DeepSeek Harness with "graphyloop skipped: `<your home>` is not a project root".** The server took its project root from `process.cwd()` at startup — right for a harness that spawns one MCP server per project, wrong for dsh: dsh is a long-lived host whose cwd is the directory you typed `dsh` in (usually your home), while the project is the **workspace** you pick in the UI and it lives in dsh's own store. So the root was the home directory, the guard refused it, and no tool ever ran — with the workspace open the whole time · The root is now resolved **per tool call**: `GRAPHYLOOP_PROJECT_ROOT` pin → dsh's workspace store (`storages/workspace.json`, newest first; `session_projcache.json` as fallback) → cwd. Switching workspace mid-session lands in the new project on the next call, each root gets its own engine and its own `<root>/.graphyloop/state.json`, and the chosen root is logged on stderr · The `graphyloop-mcp` patch row now carries `env: GRAPHYLOOP_DSH_HOME` — `dsh-mcp-client` scrubs every `DSH_*` name out of the child env, so an explicit entry is the only way the server can know which dsh home to read; `install`/`update` **upgrades an existing row in place** (backup first) instead of skipping it because the id was already there, and uninstall still recognises both shapes · a row you edited yourself is left alone, with the missing key named in the install report · the refusal message now says where dsh keeps the project and how to pin one · 6 new tests (166 total) |
| **0.3.0** | **The full skill library now ships — 71 skills, so every name an agent routes on resolves on a fresh install** (design systems, branding, video/AI, research, workflow, GSAP and three.js packs; `install-skills.mjs` discovers them, a skill you already have is still never overwritten) · **Six of them are new and graphyloop-authored — the frontend and backend-security discipline the squad already routed on but nobody shipped** (11 total, all graphyloop-authored): `frontend-security` (XSS sinks, token storage, `NEXT_PUBLIC_*` leakage caught in the build output, CSP verified with `curl -sI`, `postMessage`/iframe trust) · `api-hardening` (route-by-route authz and IDOR, boundary validation, rate limits, SSRF, upload magic bytes, JWT `alg`/`aud`, response allow-lists) · `api-contract-design` (one envelope, status-code table, error shape, cursor pagination, safe-vs-breaking change rules) · `web-accessibility` (WCAG 2.2 AA, focus trap/restore, names, live regions, axe-in-Playwright + a manual keyboard pass) · `web-performance` (baseline → fix by payoff → prove → CI budget) · `dependency-audit` (typosquat/install-script vetting, advisory triage by reachability). Each is embedded in the agents that own it — `chadi-frontend`, `chadi-backend`, `chadi-security`, `chadi-performance`, `chadi-reviewer`, `chadi-quality`, `chadi-test`, `chadi-architect`, `chadi-integrator`, `chadi-devops`, `graphcrew-builder` — plus the conductor's orchestrator-level pre-load list · **Fix: `skills_status` hid the very gap it exists to report** — the engine's referenced-skill list had drifted from the agent files, so twelve names the squad routes on (nine from other collections, three that exist nowhere public) were reported as `missing: []`; the list now covers every `Primary:`/`Supporting:` footer entry and a new test fails the build on the next drift · agent footers no longer hardcode the bundled list · **DeepSeek Harness (`dsh`) support** — `install` now wires dsh too, through its home-level patch layer (`$DSH_HOME/cordis.patch.yml`): one `insert` row mounting `@deepseek-ai/dsh-mcp-client` at `~/.graphyloop/mcp-server.mjs`, which applies to every profile, hot-reloads, and needs no pnpm step. Tools arrive namespaced as `mcp__graphyloop__*` · `$DSH_HOME/AGENTS.md` for the 5-gate rules, the bundled skills in `$DSH_HOME/skills`, and — because dsh has no agent files and no file-based slash commands — the squad as a prompt library plus a `graphyloop-squad` skill that delegates through dsh's own `subagent` tool · `skills_status` now reads the dsh and `~/.agents` skill roots · the patch layer stays the user's file: append-only, backed up first, comments and `!!js` expressions untouched, uninstall content-matched · 17 new tests (160 total), verified against `@deepseek-ai/dsh` 0.1.0-rc.6 including dsh's own MCP SDK and tool-schema gate |
| **0.2.1** | **Fix: `npm run dev` no longer hangs a Windows agent session forever.** The shell tool reads stdout until EOF, and EOF needs every handle to the pipe's write end closed — `Start-Process -RedirectStandardOutput/-RedirectStandardError` calls `CreateProcess` with `bInheritHandles=TRUE`, so the detached dev server inherited the tool's pipe and held it for its whole life. The workflow rules had recommended exactly that pattern as "the only safe detach". Measured with a self-exiting fixture: the launcher exited at 2.3 s, the caller's stdout EOF only arrived at 21.8 s — when the server died; with a real dev server, never · **`server-guard` plugin + `start-server.ps1` now ship with the kit** (they were documented in the rules but never installed): inline `npm run dev`/`node server.js`/`python -m http.server` are rewritten into a launcher that redirects inside a generated `.cmd` and starts it via ShellExecuteEx (`bInheritHandles=FALSE`) — EOF lag **19,498 ms → 8 ms**, server still serving after the call returns · `-Stop` now kills the whole process tree (npm's grandchildren survived a plain PID kill) and pid files are per-port · `Start-Process` with stdio redirects and no `-Wait` is blocked instead of whitelisted · 28 new tests (143 total) |
| **0.2.0** | **Bundled skills** — `graphyloop-waves`, `supabase-setup`, `vercel-deploy`, `secrets-hygiene`, `swarm-memory` install with the squad, so a fresh setup is usable immediately; a skill you already have is never overwritten, and `skills_status` reports what is actually present · **`chadi-integrator`**, the missing owner of the wave-2 join, with an explicit contract-drift policy · **Wave planner** (`plan_feature`) — "I want an inventory system" becomes contract → **database ∥ backend ∥ frontend ∥ tests** → integration → **test ∥ typecheck ∥ security ∥ performance ∥ review** → gated deploy, and `task_distribute` now enforces it: `wave` + `dependsOn` gate dispatch, `dispatchNow`/`blocked` say what may run, `task_record` reports what a result unblocked · **Supabase + Vercel credentials** — `secrets_status` (masked, never a value), `secrets_set` (chmod 600 store, git-ignored before the first write), `env_sync` (values move file-to-file into `.env.local`, public aliases for public keys only), `preflight` (`db`/`deploy` blockers + gated command plan, executes nothing) · **`graphyloop update [--check]`** — refresh an install in place, repair a core tree missing new modules, keep your config keys; `doctor` now prints the installed core version · `/chadi-waves`, `/chadi-db`, `/chadi-deploy` · Fix: a stale hardcoded tool count in the installer suite made a spawned MCP server hold its stdio pipes on failure, hanging the whole test run instead of reporting it · test suites split per area with a filterable runner (115 tests) |
| **0.1.3 / 0.1.4** | **MCP tools now run in-process** — the engine moved to `lib/engine.mjs` and is called directly instead of spawning a child process per tool call: **3.8 ms vs 73.7 ms** per call, and a slow call no longer blocks the server · **`memory_forget`** so a wrong memory can be corrected rather than recalled forever · memory search gains recency ranking and a `type` filter · Fix: the task queue grew without bound — settled tasks are capped (`GRAPHYLOOP_MAX_TASKS`, default 500), pending work never dropped · `initialize` echoes the client's protocol version instead of always asserting ours · npm metadata (repository, issues, homepage, keywords, author) · octopus mark + drawn 5-gate workflow diagram · CHANGELOG and contributor docs · 50 tests · a pre-push hook that blocks a push whose suite fails |
| **0.1.2** | **Fix: MCP tools worked only after a manual init** — the swarm now initializes lazily on the first tool call, so Claude Code / Codex / Cursor work in a fresh project out of the box · **Fix: re-init after `shutdown` erased the whole memory log** · **Fix: parallel agents silently dropped each other's writes** — state is now lock-guarded (measured: 6 of 12 concurrent writes lost before, 12 of 12 kept after) · state moved to `<project>/.graphyloop/` with automatic migration from `.opencode/graphyloop/` · project-root guard extended to the MCP server · crash-safe atomic writes, corrupt-state quarantine, capped memory log · engine input validation (`--flag=value`, unknown agent types, duplicate ids, malformed task payloads, empty queries) · plugin surfaces CLI crashes/timeouts instead of swallowing them · uninstall no longer skips `AGENTS.md` when `opencode.json` is unparsable · `adapter/*.ts` (1.3k unrunnable lines) no longer published or installed · release gate rejects a tag that disagrees with `package.json` · first test coverage for the OpenCode plugin · 25 new tests (44 total) |
| **0.1.1** | Complete rebrand to the GraphyLoop identity (engine, agents, tool names, config entries) · `graphcrew` agent squad · automatic npm releases via GitHub Actions (tag → test → publish) · copy-paste setup prompt for any AI harness · professional docs, CI matrix (Win/macOS/Linux × Node 20/22/24) |
| **0.1.0** | Initial release — one-command install for OpenCode, Claude Code, Codex, Cursor · 25-agent squad · 5-gate workflow · MCP server (8 tools) · persistent memory + swarm engine · zero runtime dependencies |
