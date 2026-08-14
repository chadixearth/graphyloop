# Changelog

All notable changes to this project are documented here. Versions follow
[Semantic Versioning](https://semver.org/); while the package is `0.x` a minor
bump may still change behaviour.

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

[0.1.4]: https://github.com/chadixearth/graphyloop/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/chadixearth/graphyloop/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/chadixearth/graphyloop/releases/tag/v0.1.2
[0.1.1]: https://github.com/chadixearth/graphyloop/releases/tag/v0.1.1
