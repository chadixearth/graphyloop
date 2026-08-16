# Changelog

All notable changes to this project are documented here. Versions follow
[Semantic Versioning](https://semver.org/); while the package is `0.x` a minor
bump may still change behaviour.

## [0.3.0] — 2026-08-16

### Added
- **Six new graphyloop-authored skills — the general frontend and backend-security
  discipline the squad routed on but nobody shipped.** Every agent named skills by
  name; only five of those names were graphyloop's own, and the frontend /
  backend-security ones lived in a private collection, so on any other machine
  those agents silently fell back:
  - `frontend-security` — client-side hardening: XSS sinks
    (`dangerouslySetInnerHTML`, `v-html`, `innerHTML`, markdown, inline SVG),
    `javascript:`/`data:` URL injection, token storage (httpOnly cookie vs
    `localStorage`), `NEXT_PUBLIC_*`/`VITE_*` secret leakage caught with a grep of
    the build output, CSP + headers verified with `curl -sI`, `postMessage` origin
    checks, iframe `sandbox`, SRI.
  - `api-hardening` — server-side pass, route by route: per-object authorization
    (IDOR/BOLA as the top finding), default-deny matchers, boundary validation with
    unknown-key rejection, rate limits on auth/OTP/export paths, SSRF (private-range
    and metadata-endpoint rejection), upload magic-byte checks, JWT `alg`/`iss`/`aud`
    verification, response allow-lists so `SELECT *` cannot leak a password hash.
  - `api-contract-design` — what "frozen contract" means in practice: one envelope,
    one casing, a status-code table, a machine-readable error shape, cursor
    pagination with a hard `limit` max, and an explicit safe-vs-breaking change list
    with the "grep the callers first" rule.
  - `web-accessibility` — WCAG 2.2 AA at implementation level: semantics before
    ARIA, focus trap and restore for dialogs, programmatic names,
    `aria-describedby` errors, live regions, contrast in both themes, target size,
    reduced motion — verified with axe in a Playwright spec plus a five-step manual
    keyboard pass.
  - `web-performance` — baseline first (Lighthouse + bundle analyzer), then
    LCP/INP/CLS/TTFB fixes ordered by payoff, then prove it with the same command
    and keep it with a CI budget. Names the anti-patterns (blanket `memo`, lazy
    hero image, preload everything).
  - `dependency-audit` — the 60-second vet before `npm i` (typosquats, install
    scripts, transitive weight, license) and advisory triage by **reachability**
    rather than count, with `overrides`/`resolutions` guidance and proof via
    `npm ls`.
- **The new skills are embedded in the agents that own them**, as MANDATORY routing
  lines and in the `Primary:`/`Supporting:` footers: `chadi-frontend`
  (frontend-security, web-accessibility, web-performance), `chadi-backend`
  (api-hardening, api-contract-design), `chadi-security` (api-hardening,
  frontend-security, dependency-audit), `chadi-performance` (web-performance),
  `chadi-reviewer`, `chadi-quality`, `chadi-test`, `chadi-architect`,
  `chadi-integrator`, `chadi-devops`, `graphcrew-builder`, plus the conductor's
  orchestrator-level pre-load list and the dsh `graphyloop-squad` skill.
- **Full skill library embedded (65 skills).** `skills/` now ships the complete
  personal collection from `chadixearth/opencode-skills`: design systems
  (high-end-visual-design, minimalist-ui, image-to-code, redesign-existing-projects),
  branding (lifewood-branding, ppt-master-branding), video/AI (ai-video-prompt-engineer,
  story-engineering, short-video-production, video-ai-automation, remotion-video-creation),
  research (last30days), workflow (caveman\*, cavecrew, council, tdd-workflow,
  systematic-debugging, writing-plans, verification-before-completion, terminal-ops,
  search-first, security-review, security-scan), domain packs (gsap-\*, threejs-\*,
  prisma/postgres/database/deployment patterns, graphify, github-ops, e2e-testing,
  error-handling). Every agent skill reference now resolves on a fresh install.
  `install-skills.mjs` discovers all of them automatically (`bundledSkills()`
  scans `skills/`); the never-overwrite rule per skill name is unchanged. With the
  six graphyloop-authored additions above, the bundle is **71 skills**.
- **DeepSeek Harness (`dsh`) support** — `npx graphyloop install` now wires
  `dsh` alongside OpenCode, Claude Code, Codex and Cursor. dsh composes its whole
  plugin tree from patch layers, so graphyloop installs into the home-level layer
  (`$DSH_HOME/cordis.patch.yml`, default `~/.dsh`): one `insert` row mounting
  `@deepseek-ai/dsh-mcp-client` against `~/.graphyloop/mcp-server.mjs`. That layer
  applies to **every** profile (web, headless, custom) and dsh hot-reloads it, so
  the 15 tools appear without touching a bundle and without a pnpm step — dsh
  already symlinks its dependency closure into `$DSH_HOME/profiles/node_modules`.
  The MCP bridge namespaces tools, so in this harness they are
  `mcp__graphyloop__<name>` (`mcp__graphyloop__plan_feature`, …).
  Also installed: `$DSH_HOME/AGENTS.md` (dsh loads it as user-global instructions
  for every session), the five bundled skills into `$DSH_HOME/skills`, and the
  squad as a prompt library at `$DSH_HOME/graphyloop/{agents,commands}`.
- **`graphyloop-squad` skill (dsh only).** dsh has no agent files and no
  file-based slash commands — agents are cordis compositions and commands are
  plugins — so a squad of 25 `.md` agents and 15 `/chadi-*` commands has nowhere to
  land. Instead one skill maps the workflow onto dsh's own primitives: the
  namespaced tool names, delegation through dsh's `subagent` tool with a role
  prompt from the installed library, and the wave protocol. It states plainly that
  this harness has no slash commands, so the model reads the matching workflow body
  rather than inventing a command that cannot exist.
- `skills_status` (and the engine's `skills` command) now also read the dsh skill
  roots — `<project>/.dsh/skills`, `<project>/.agents/skills`, `$DSH_HOME/skills`,
  `~/.agents/skills` — so a skill installed for dsh is reported as present instead
  of missing.

### Fixed
- **`skills_status` hid the gap it exists to report.** `REFERENCED_SKILLS` in the
  engine was a hand-maintained list that had drifted from the agent files: names
  the squad routes on (`deployment-patterns`, `github-ops`, `terminal-ops`,
  `prisma-patterns`, `security-scan`, `high-end-visual-design`, `image-to-code`,
  `redesign-existing-projects`, `finishing-a-development-branch`) plus three that
  exist in no public collection (`design-taste-frontend`, `api-connector-builder`,
  `benchmark-optimization-loop`) were absent from it, so the tool answered
  `referenced.missing: []` on a machine where a subagent had just been told to load
  a skill that was nowhere on disk. Most of those names are now bundled outright;
  the rest are tracked, and a new test fails the build when an agent routes on a
  skill that is neither bundled nor tracked — the drift cannot come back silently.
- Agent footers hardcoded the bundled skill names in prose, which is the same drift
  one level down. They now point at `skills_status` instead.
- `CHANGELOG.md` had been saved through a cp1252 round trip, which turned every em
  dash, arrow and ellipsis into mojibake (`Ã¢â‚¬â€`). Repaired; the pre-0.3.0
  sections are byte-identical to their pre-corruption text again.

### Notes
- Re-sync the vendored library from the live global set with
  `robocopy %USERPROFILE%\.config\opencode\skills .\skills /MIR /XD scripts\vendor`.
  The six graphyloop-authored skills above live in this repo, not in that tree — do
  not let a mirror delete them.
- The dsh patch layer is the user's own file: graphyloop appends one row, backs the
  file up first, never rewrites the document (comments and `!!js` expressions
  survive verbatim), and skips the merge entirely when its row is already there.
  The shipped `[]` template is replaced rather than appended to, because a list
  item after `[]` is invalid YAML and dsh fails loud at boot on a patch file it
  cannot parse. Uninstall removes the row only while it is still byte-identical to
  the installed copy, and leaves a parsable `[]` behind when nothing else remains.
- `--home <dir>` overrides `$DSH_HOME`, so a sandboxed or CI install can never
  reach a real harness home.
- 17 new tests (`test/dsh.test.mjs` plus the skill drift guards), 160 total. Verified against
  `@deepseek-ai/dsh` 0.1.0-rc.6: `dsh --dump-config` composes the row from the
  installed patch layer, and dsh's own MCP SDK plus its tool-schema gate
  (`assertObjectJsonSchema` / `assertSupportedJsonSchema` / `jsonSchemaToTs`)
  accept all 15 tools with unmangled names.

## [0.2.1] — 2026-08-16

### Fixed
- **`npm run dev` hung a Windows agent session forever.** The shell tool reads a
  command's stdout until EOF, and EOF only arrives once *every* handle to the
  pipe's write end is closed — not when the direct child exits. Detaching a dev
  server with `Start-Process -RedirectStandardOutput <out> -RedirectStandardError
  <err>` makes PowerShell call `CreateProcess` with `bInheritHandles=TRUE`, which
  duplicates every inheritable handle of the launching shell into the child, so
  the server inherited the tool's stdout pipe and held it open for its entire
  life. The turn printed `PID` and `SERVER_UP` and then never returned; the user
  had to cancel to get the session back, and the work had in fact already
  finished. Measured with a self-exiting fixture server: the launcher exited at
  2.3 s while the caller's stdout EOF only arrived at 21.8 s — the moment the
  child died. With a real dev server, "21.8 s" is "never".
  The launcher now writes the redirection into a generated per-port `.cmd`
  wrapper and starts that with no `-Redirect*` parameter, so PowerShell goes
  through `ShellExecuteEx`, which creates the process with
  `bInheritHandles=FALSE`. **EOF lag 19,498 ms → 8 ms**, with the server still
  answering `200` after the call returns.
- **The workflow rules recommended the broken pattern.** `workflow/AGENTS.md`
  called `Start-Process` with both redirects "the ONLY safe detach on Windows …
  zero pipe inheritance". The redirect parameters do give the child its own std
  handles, but they do not turn inheritance off. That section now explains the
  EOF/handle mechanism and points at the shipped launcher.
- **`server-guard` whitelisted the leak.** `isSafelyDetached()` treated any
  `Start-Process` with both redirects as already-safe and let it through
  un-rewritten. That pattern is now blocked with the measured explanation
  (`-Wait` stays allowed: a foreground run is meant to be waited on).
- **`-Stop` orphaned servers.** `npm run dev` reaches the listener through
  intermediate `cmd.exe` shims that are not children of the launched process, so
  killing the saved PID left the server alive. Stop now kills the saved PIDs as
  process *trees* (`taskkill /T`) plus any listener on the port, and the launcher
  records the resolved listener PID (`LISTENER_PID`) next to the wrapper PID in
  per-port pid files, so two servers in one project no longer overwrite each
  other's state.

### Added
- **`server-guard` plugin and `start-server.ps1` now ship with the kit.** Both
  were documented in the workflow rules but installed by nothing — the rules told
  agents to use a launcher that did not exist, flagged in-line as "[OPTIONAL —
  community scripts; create or skip]". `plugin/server-guard/` installs to
  `<config>/plugins/server-guard/` with the launcher beside it, and the plugin
  entry is merged into `opencode.json`. Inline server commands (`npm run
  dev|start|serve|preview`, `node server*.js`, `python -m http.server`) are
  rewritten into a detached, health-checked launch; ambiguous ones (pnpm/yarn/bun,
  `.cmd` shims, `--watch`, command chains) are blocked with instructions instead
  of stalling the turn. Windows-only by design — the launcher is PowerShell and
  the handle-inheritance trap is a Win32 behaviour, so the plugin installs no
  hooks elsewhere.
- The installer now copies **every** `plugin/<name>/` directory rather than only
  `plugin/graphyloop`, and refreshes a legacy `<config>/scripts/start-server.ps1`
  when one exists (backup kept) so older setups stop hanging without a manual
  edit. It never creates that legacy path — the plugin-local copy is canonical.
- 28 tests for the guard (143 total), including a regression that fails if
  `Start-Process` in the launcher ever regains a stdio redirect, and coverage of
  the rewrite, the blocks, the platform gate and the timeout backstop.

## [0.2.0] — 2026-08-16

### Added
- **Bundled skills.** Every agent routed on skills by name while graphyloop
  shipped none, so on a fresh machine the squad reported "skill missing" and fell
  back — a new install was weaker than the workflow it advertised. Five
  graphyloop-authored skills now install with the agents (`<config>/skills` for
  OpenCode, `~/.claude/skills` for Claude): `graphyloop-waves`, `supabase-setup`,
  `vercel-deploy`, `secrets-hygiene`, `swarm-memory`. An existing skill directory
  of the same name is **never** overwritten — not by `--force`, not by `update`;
  users install skills from several collections into one tree and clobbering one
  would be data loss dressed as an upgrade. Uninstall removes only skill files
  still byte-identical to ours.
- **`skills_status` (MCP) / `graphyloop_skills` (plugin) / `skills` (CLI).**
  Reports which skills exist across the project, OpenCode and Claude roots, which
  bundled ones are present, and which referenced ones are missing, so an agent
  can state a gap in one line instead of faking a skill it never loaded.
- **`chadi-integrator`** — the wave-2 join had no owner: the planner handed it to
  `chadi-backend`, which either widened one lane's file ownership or left the
  integration to nobody. The new agent swaps mocks for real calls, wires
  credentials, applies local migrations, boots the happy path, and carries an
  explicit contract-drift policy (fix cosmetic mismatches and record them; send
  semantic ones back to the lane that drifted; stop if the contract itself is
  wrong rather than silently redefining it).
- Each subagent `.md` now names its primary and supporting skills, so skill
  routing is a mapping rather than improvisation.
- **Wave planner — `plan_feature` (MCP) / `graphyloop_plan_feature` (plugin) /
  `plan --goal` (CLI).** "I want an inventory system" now decomposes into
  contract (one agent freezes schema + routes + props + test scenarios) →
  **database ∥ backend ∥ frontend ∥ tests** → integration → **test ∥ typecheck ∥
  security ∥ performance ∥ review** → gated deploy. Every task carries its
  exclusive file list, acceptance check and `dependsOn`, so the database lane
  runs alongside the UI lanes instead of blocking them, and no builder starts
  before the contract exists.
- **`wave` + `dependsOn` in `task_distribute`.** The plan is enforced, not just
  described: dispatch answers with `dispatchNow` (dependencies satisfied) and
  `blocked` (with `waitingOn`), `task_record` reports which tasks its result
  unblocked, and `swarm_state` reports ready/blocked counts per wave. A
  dependency on an id that does not exist blocks rather than dispatching early.
  Tasks without `wave`/`dependsOn` behave exactly as before.
- **Supabase + Vercel credential layer.** `secrets_status` (masked readiness
  report — which keys exist, where each comes from, what is missing; never
  returns a value), `secrets_set` (stores one key in
  `<project>/.graphyloop/secrets.json`, chmod 600, git-ignored *before* the first
  write), `env_sync` (copies values file-to-file into the env file the framework
  reads, adds `NEXT_PUBLIC_*`/`VITE_*` aliases for public keys **only**,
  refreshes a values-free `.env.example`, guards `.gitignore`), and `preflight`
  (`db`/`deploy` blockers, warnings and an ordered command plan where every
  destructive step carries its approval gate — it executes nothing).
  A credential is never echoed back to the model, and on the spawn path it
  travels through the environment instead of argv so it stays out of the process
  list.
- **`graphyloop update [--check]`.** Refreshes an existing install in place:
  overwrites graphyloop-owned files (timestamped backup first), repairs a core
  tree missing newer modules, preserves config keys, plugin lists and models.
  `--check` (plus `--json`) reports `up-to-date` / `update-available` /
  `incomplete` / `not-installed` and writes nothing. `doctor` now prints the
  installed core version next to the package version, which is the first thing
  to check when a tool "does not exist" in a wired harness.
- `/chadi-waves`, `/chadi-db` and `/chadi-deploy` commands, plus workflow rules
  for wave dispatch and secret/deploy discipline in `workflow/AGENTS.md` and
  `agents/agent-chadi.md`.
- `stack` CLI command (framework, package manager, database layer, deploy
  target, migrations, scripts) — evidence-based detection used by the planner and
  preflight.

### Changed
- Test suites are split per area (`adapter`, `secrets`, `planner`, `mcp`,
  `plugin`, `install`, `update`) and the runner takes filters
  (`node scripts/run-tests.mjs planner mcp`, `--fast`, `--list`) with matching
  `npm run test:*` scripts. Iterating on one area no longer pays for the
  installer suite. 105 tests.
- `install-core` exports `CORE_LIB_FILES` and installs every engine module
  (`engine`, `mcp`, `secrets`, `stack`, `planner`); the MCP server, installer and
  update checks all read that one list, so a new module cannot be left out of an
  installed tree.

### Fixed
- **A failing assertion in the installer suite hung the entire test run.** The
  installed-MCP-server test asserted a hardcoded tool count and, on failure,
  skipped `stdin.end()` — the spawned server kept its stdio pipes open and
  `node --test` waited on the handle forever, so a stale expectation looked like
  an infinite hang instead of a reported failure. The count now comes from the
  shipped tool registry (`TOOL_NAMES`) and the child is closed in a `finally`.
- Planner lane detection matches whole words, so "review the diff" no longer
  triggers the frontend lane via "view" and a one-file rename is reported as
  `no-fanout` instead of being handed a squad.

## [0.1.4] — 2026-08-14

### Fixed
- **Republish.** `0.1.3` was already live on the registry and cannot be
  overwritten, so the identical tree ships as `0.1.4` to make `npm publish`
  succeed. No functional changes.

## [0.1.3] — 2026-08-14

### Added
- **`memory_forget`** (MCP) / **`graphyloop_memory_forget`** (OpenCode plugin) /
  `memory-forget --id` (CLI). An append-only store repeats a wrong lesson
  forever; this is the correction path.
- `memory_search` accepts a `type` filter (`decision | pattern | lesson | event | task`).
- Octopus mark and a drawn 5-gate workflow diagram (`assets/`, light and dark).
- npm metadata: `repository`, `bugs`, `homepage`, `keywords`, `author`.
- `CHANGELOG.md`, `CONTRIBUTING.md`, issue and pull-request templates.
- `hooks/pre-push` runs the test suite and blocks the push if it fails. A commit
  with a failing test once reached `main` because the runner had been piped into
  another command, so the shell reported that command's exit code; the hook runs
  it unpiped and gates on its real status.

### Changed
- **MCP tools run in-process.** The engine moved to `lib/engine.mjs` and is now
  called directly instead of spawning a child process per tool call. Measured
  over 25 calls: **3.8 ms per call against 73.7 ms** on the spawn path, and one
  slow call no longer blocks every other tool call on the server. Setting
  `GRAPHYLOOP_CLI` still pins the server to a specific engine build.
- `memory_search` ranks by match quality with a recency bias, so a fresh lesson
  outranks a stale one that matched equally well.
- `initialize` echoes the client's protocol version when it is one we speak,
  instead of always asserting our own.

### Fixed
- **The task queue grew without bound.** `distribute` pushed every task and
  nothing removed finished ones, so a long-lived project re-read and re-wrote
  its whole history on every command. Settled tasks are capped
  (`GRAPHYLOOP_MAX_TASKS`, default 500); pending and in-progress work is never
  dropped, so `pendingTasks` and load balancing stay correct.

## [0.1.2] — 2026-08-14

### Fixed
- **MCP tools were inert until a manual init.** The contracted tool set has no
  init tool and the engine refused every state command until `init` had run, so
  a fresh project answered every call with `{"error":"not initialized"}` —
  graphyloop was dead on arrival in Claude Code, Codex and Cursor. The swarm now
  initializes lazily on the first tool call.
- **Re-init after `shutdown` erased the whole memory log.** `init` replaced the
  memory array instead of appending, so the documented "call `shutdown` at
  session end" flow destroyed every stored decision and lesson.
- **Parallel agents silently dropped each other's writes.** Every command is
  load → mutate → save, so concurrent writers raced. Measured on an 1800-entry
  store with 12 concurrent writes: 6 of 12 lost. State is now guarded by an
  atomic `mkdir` lock with a stale-lock break — same run after the fix: 12 of 12.
- Corrupt state bricked the engine permanently; it is now quarantined as
  `state.json.corrupt-<timestamp>` and the engine continues from a clean state.
- Uninstall skipped `AGENTS.md` when `opencode.json` was unparsable.
- The OpenCode plugin swallowed engine crashes and timeouts, and kept a stale
  init cache after `shutdown`.

### Changed
- State moved to `<project>/.graphyloop/state.json`, with automatic migration
  from `.opencode/graphyloop/`. Memories, counters and roster are preserved and
  the legacy file is removed so the two cannot drift.
- The project-root guard now covers the MCP server, so auto-init cannot write
  into a home, system or harness-config directory.
- The memory log is capped (`GRAPHYLOOP_MAX_MEMORIES`, default 2000).
- Engine input validation: `--flag=value`, unknown agent types, duplicate agent
  ids, malformed task payloads, empty search queries.
- `adapter/*.ts` (~1.3k lines of unrunnable design reference) is no longer
  published or installed; CI fails if a `.ts` file reaches the tarball.
- The release workflow rejects a `v*` tag that disagrees with `package.json`.

## [0.1.1] — 2026-08-14

- Complete rebrand to the GraphyLoop identity (engine, agents, tool names,
  config entries).
- `graphcrew` agent squad.
- Automatic npm releases via GitHub Actions (tag → test → publish).
- Copy-paste setup prompt for any AI harness.
- CI matrix: Windows/macOS/Linux × Node 20/22/24.

## [0.1.0]

- Initial release — one-command install for OpenCode, Claude Code, Codex and
  Cursor · 24-agent squad · 5-gate workflow · MCP server · persistent memory and
  swarm engine · zero runtime dependencies.

[Unreleased]: https://github.com/chadixearth/graphyloop/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/chadixearth/graphyloop/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/chadixearth/graphyloop/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/chadixearth/graphyloop/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/chadixearth/graphyloop/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/chadixearth/graphyloop/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/chadixearth/graphyloop/releases/tag/v0.1.1
