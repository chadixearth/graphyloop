# Changelog

All notable changes to this project are documented here. Versions follow
[Semantic Versioning](https://semver.org/); while the package is `0.x` a minor
bump may still change behaviour.

## [0.4.2] — 2026-08-17

### Fixed
- **`--force` backed up and rewrote every graphyloop-owned file even when the
  bytes already matched the source.** A forced re-install of all five harnesses
  wrote 143 files and minted 143 `*.bak-<timestamp>` copies of content that had
  not changed — on every run. Nothing ever prunes those backups, so they
  accumulate: a real machine had 582 stale ones (282 under `~/.claude`, 221 under
  `~/.config/opencode`, 79 under `~/.graphyloop`), 176 of them in a single
  `agents/` directory. A forced re-install over an unchanged tree now writes
  nothing and leaves no backup, and stays at zero across repeated runs.
  - `graphyloop update` forces internally, so an update carried the same cost:
    the core path alone left 7 fresh backups every time it ran, which is exactly
    what had filled `~/.graphyloop`.
  - Two paths needed the check, and missing the second one is what made this
    survive a first pass: `copyDir` (agents, commands, plugins, workflow files)
    and `copyFile` (the `CORE_LIB_FILES` set plus `package.json`).
  - The comparison is byte-for-byte, not decoded text: agent and skill files are
    copied verbatim, so a string compare would treat a real CRLF or BOM
    difference as "unchanged" and leave a stale file in place.
  - A file whose content *did* change is still backed up before it is replaced —
    the recovery net that makes `--force` safe is unchanged, and is now covered
    by its own regression test.

### Internal
- New `lib/fsutil.mjs` holds the shared `matchesContent` / `matchesFile` /
  `backupFile` helpers (plus async twins for the `fs/promises` installers). It
  also absorbs the `timestamp()` and `backupFile()` copies that had been
  duplicated across four installers, so the change is net smaller than the fix it
  carries. `install-opencode` had a local `const backupFile` shadowing the new
  import; it is now `backupPath`, which is what it always held.

### Tests
- 2 new (187 total): a forced re-install over an unchanged tree writes nothing,
  creates no backup and reports every harness as `copied 0`; and a file that was
  hand-edited is still backed up before it is replaced, with the backup holding
  the replaced content.

## [0.4.1] — 2026-08-17

### Fixed
- **The project-root guard compared paths textually, so the same directory reached
  through a symlink was not recognised as the home directory.** On macOS
  `process.cwd()` answers with the resolved path (`/private/var/...`) while an
  env-provided or symlinked `HOME` is the link (`/var/...`), so a server whose cwd
  *was* the home directory passed the guard and auto-init wrote
  `<home>/.graphyloop/state.json` — exactly what the guard exists to prevent. Both
  guards (the MCP server and the mirrored OpenCode plugin) now compare canonical
  paths via `realpathSync.native`, falling back to `resolve()` for a path that
  does not exist yet. The verdict is cached per root, so this costs one realpath
  per root rather than one per tool call.
  - Caught by the macOS matrix on the v0.4.0 tag, which was therefore never
    published: 0.4.1 is that release plus this fix.
  - Regression test added and verified to discriminate: with the old comparison a
    junction to the home directory reads as a different directory (`false`), with
    the new one it does not (`true`). Junctions need no elevation on Windows, so
    the test runs on every platform instead of being macOS-only.

### Tests
- 1 new (185 total): a symlinked path to the home directory is refused, and
  nothing is written into it.

## [0.4.0] — 2026-08-17

### Changed
- **Every MCP tool call re-read and re-parsed the whole state file before doing
  any work.** `<project>/.graphyloop/state.json` is the swarm's memory, so it
  grows: at 800 memories (~220 KB) a read-only `swarm_state` cost 2.9 ms of
  `JSON.parse` before it looked at anything, and every write paid the same cost
  again on the way in. A session makes hundreds of calls, and the parse dominated
  all of them.
  - State is now cached in the engine and validated against the file's **stat
    signature** — mtime + size + inode + ctime — never against a timer. Writes are
    tmp-file + rename, which changes the inode every time, so a write by anything
    (this engine, a spawned CLI, a second harness, an editor) invalidates the
    cache on the next call. The failure mode of a wrong signature is a redundant
    re-parse, never a stale answer.
  - A write **re-stamps** the cache with what it just wrote instead of dropping
    it, because the call right after a write is almost always a read of it.
  - A write body that mutated the loaded state but returned before saving (an
    error path such as `spawn` past `maxAgents`) drops the cache, so an unsaved
    mutation can never be served as state.
- **Recall re-stringified and re-lowercased the entire store on every query.**
  `memory_search` built `content + JSON.stringify(metadata)` per entry per call.
  The searchable text is now built once per entry and kept in a `WeakMap` keyed by
  the entry object — nothing has to invalidate it, since entries are immutable and
  a re-parse produces new objects that get their own text.
- **State is written compact.** Two-space indentation added ~46% to the bytes of
  every mutation (319,511 → 218,675 bytes at 800 memories) and ~0.4 ms to each
  `JSON.stringify`, for a file that is machine state rather than a config anyone
  edits. `GRAPHYLOOP_PRETTY_STATE=1` restores the readable form.
- **The state lock costs one syscall when uncontended**, down from three: the
  parent directory is created from the `ENOENT` path instead of an unconditional
  recursive `mkdir` per write. A contended writer now backs off on an escalating
  schedule (0.25 ms → 20 ms) instead of sleeping a flat 20 ms — a state write
  takes about 1 ms, so every waiter used to wait an order of magnitude longer than
  the work it was waiting for. The mutex itself is unchanged, and concurrent
  writers still lose nothing (6 writers × 20 stores = 320/320 memories kept).
- **Project detection is no longer repeated per call.** `detectStack()` reads
  package.json, lockfiles, config files and the schema tree; `plan_feature`,
  `env_sync` and `preflight` each called it fresh, so planning one feature
  re-scanned the project three times. It is cached against package.json's stat
  signature and passed into `preflight()` rather than re-detected there. The MCP
  server likewise resolves `cwd` and the project-root guard verdict once per root
  instead of once per call.
- **`ping` and `tools/list` answer from a pre-serialized template.** `tools/list`
  re-serialized ~9 KB of tool schema on every call. `readline` is gone from the
  server: a stdio JSON-RPC server only needs "split on `\n`", and the splitter
  resumes scanning where the previous chunk stopped, so a 1 MB `task_distribute`
  payload is reassembled in linear time instead of being rescanned per chunk.

Measured on Windows / Node 24 with 800 seeded memories. Per-call numbers are the
old and new engine **alternating in one process** (300 iterations per arm), so
machine drift hits both arms equally:

| operation | before | after | |
|---|---|---|---|
| `swarm_state` / `agent_list` | 2.910 ms | 0.013 ms | 217x |
| `memory_search` (typed) | 3.991 ms | 0.138 ms | 29x |
| `memory_search` | 6.779 ms | 0.972 ms | 7.0x |
| `preflight` | 0.720 ms | 0.180 ms | 4.0x |
| `plan_feature` | 7.678 ms | 2.824 ms | 2.7x |
| `memory_store` | 7.488 ms | 2.977 ms | 2.5x |
| `task_record` | 7.166 ms | 3.132 ms | 2.3x |

End to end over real stdio, the same suite before and after: `swarm_state`
2.615 → 0.193 ms, `memory_search` 3.128 → 0.393 ms, `memory_store`
5.851 → 2.596 ms, `plan_feature` 6.835 → 3.371 ms. Pipelined throughput:
`swarm_state` 311 → 26,062 calls/sec, `memory_search` 226 → 2,624 calls/sec,
`ping` 181,574 calls/sec. `ping` at 0.119 ms sits at the floor of a Node stdio
round trip on this machine (an echo server that does nothing measures 0.151 ms),
so the protocol layer adds nothing measurable.

**What is deliberately not faster.** A mutating call still rewrites the whole
state file under the lock: at 800 memories that is 0.77 ms to serialize, 0.50 ms
to write the temp file, 0.83 ms to rename and 0.37 ms of lock, and it is what
guarantees that no memory is ever lost and that a crash mid-write cannot leave an
unparsable file. Trading that for an append-only journal or a deferred write would
buy ~2 ms per write by weakening the one property the memory store exists for, so
it was not done. Cold start (~60 ms, dominated by Node's own boot) is unchanged:
`module.enableCompileCache()` was tried and measured 0.93–0.99x in an interleaved
A/B — no gain — so it is not shipped.

### Added
- `npm run bench` (`scripts/bench-mcp.mjs`) — cold start, per-call round trip over
  real stdio, pipelined throughput and in-process engine cost, with `--save` /
  `--compare` so a change can be measured against a baseline instead of asserted.
  It verifies each call really did work before timing it: a tool that fails
  validation or the project-root guard answers in microseconds, which reads as
  spectacular throughput and measures nothing.
- `engine.metrics()` — loads, parses, writes, lock waits, searches, plus the state
  file it describes. This is what makes "the cache works" a test assertion rather
  than a claim, and it answers "why is this session slow" with a parse count.
- `preflight({ stack })` in `lib/stack.mjs` accepts an already-detected stack.

### Tests
- 18 new (184 total), all observational rather than timing-based, so they are
  deterministic on a loaded CI box: 40 reads cost exactly one parse; a write
  re-stamps rather than drops; **a write from another OS process is visible to the
  next call**; an outside `spawn` changes the roster mid-session; a rejected write
  publishes nothing; a state file corrupted underneath a live engine is quarantined
  instead of served from cache; cached search text produces byte-identical ranking
  and `searched` counts to a cold engine across five queries × two type filters;
  an entry stored after the cache warmed is still searchable, metadata included;
  compact by default and pretty on request, both re-readable by a separate process;
  six engines interleaving writes lose nothing; an edited package.json re-detects
  the stack; `ping` / `tools/list` keep numeric **and string** ids and the prebuilt
  payload matches the real tool list; a burst of 12 requests in one write gets 12
  answers in order; a 300 KB single request spanning many pipe chunks arrives
  intact; a request with no trailing newline is still answered at EOF.

## [0.3.1] — 2026-08-17

Documented and tested, but never published on its own: it ships inside 0.4.0.



### Fixed
- **Every graphyloop tool failed in the DeepSeek Harness with `graphyloop skipped:
  <your home> is not a project root`, with a real project open the whole time.**
  The MCP server resolved its project root once, at startup, from
  `process.cwd()`. That is correct for a harness that spawns one server per
  project (Claude Code, Codex, Cursor, OpenCode), and wrong for dsh: dsh is a
  long-lived host whose cwd is the directory you typed `dsh` in — usually your
  home — while the project is the **workspace** picked in the UI and recorded in
  dsh's own store. So the root was the home directory, the project-root guard
  refused it (correctly — auto-init writes `<root>/.graphyloop/state.json`), and
  no tool ever ran. Reproduced against the installed server: `swarm_state` with
  cwd at `C:\Users\<user>` returned the refusal while
  `storages/workspace.json` named an open project.
  - The root is now resolved **per tool call**, in order: an explicit
    `GRAPHYLOOP_PROJECT_ROOT` pin (still guarded, so pinning your home is refused
    rather than obeyed) → the dsh workspace store
    (`$DSH_HOME/storages/workspace.json`, most recently updated workspace first,
    with `session_projcache.json`'s per-session `identity.cwd` as the fallback for
    a host that has a live session but no workspace row yet) → cwd.
  - Per call, not per process, so switching workspace in dsh lands in the new
    project on the next tool call without restarting the harness. Each root keeps
    its own engine and its own `<root>/.graphyloop/state.json` (bounded to 8), and
    the resolved root is logged on stderr — `graphyloop: project root <path> (from
    dsh workspace)` — so a wrong guess is visible instead of silent.
  - The dsh store reads are cached on mtime + size, so the common case costs two
    `stat` calls per tool call rather than two JSON parses.
- **The `graphyloop-mcp` patch row now states the dsh home** —
  `env: GRAPHYLOOP_DSH_HOME: '<$DSH_HOME>'`. It cannot be inferred at runtime:
  `dsh-mcp-client` builds the child env from `scrubbedParentEnv()`, which drops
  every `DSH_*` name (case-insensitively), so an explicit `env` entry is the only
  channel into the server. It doubles as the "this is dsh" marker — the workspace
  store is never consulted for any other harness, so a Claude Code session started
  in a home directory still fails loudly instead of silently adopting a dsh
  project. `GRAPHYLOOP_HARNESS=dsh` is the hand-written equivalent.
- **`install` / `update` upgrade an existing dsh row in place** instead of
  skipping it because `id: graphyloop-mcp` was already present — a row written by
  0.3.0 would otherwise keep failing forever, and the user cannot be expected to
  hand-apply a bug fix. The old block is matched byte-for-byte before it is
  replaced, the file is backed up first, and every other row, comment and `!!js`
  expression is untouched. A row you edited yourself is still left alone, with the
  missing key named in the install report. `uninstall` recognises both the current
  and the 0.3.0 block shape.
- **The refusal message is now actionable under dsh**: it says that dsh keeps the
  open project in its workspace store rather than the working directory, names the
  store it looked in, and gives the `GRAPHYLOOP_PROJECT_ROOT` pin and the
  `cordis.patch.yml` row to add it to.

### Tests
- 6 new (166 total): the workspace store beating the host cwd, a mid-session
  workspace switch being followed, the `session_projcache.json` fallback, the
  actionable refusal when no workspace is usable, the env marker in the installed
  row, the in-place upgrade of a 0.3.0 row (and uninstall still matching it), and
  a user-edited row surviving with the missing key reported.

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

[Unreleased]: https://github.com/chadixearth/graphyloop/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/chadixearth/graphyloop/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/chadixearth/graphyloop/compare/v0.2.1...v0.4.0
[0.2.1]: https://github.com/chadixearth/graphyloop/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/chadixearth/graphyloop/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/chadixearth/graphyloop/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/chadixearth/graphyloop/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/chadixearth/graphyloop/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/chadixearth/graphyloop/releases/tag/v0.1.1
