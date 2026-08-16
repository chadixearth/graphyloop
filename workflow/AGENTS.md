# Global OpenCode Rules

GraphyLoop workflow rules for OpenCode + agent-chadi. Installed by setup.mjs to ~/.config/opencode/AGENTS.md.

The user uses OpenCode, not Claude Code.

Default agent:
- agent-chadi

Hard rules:
- Do not create CLAUDE.md.
- Do not create .claude folders.
- Do not propose Claude Code setup.
- Do not use Claude-style agents like everything-claude-code:* or claude-code:*.
- Do not use anthropic/claude-* models.
- Use AGENTS.md for project rules.
- Use .opencode/ for project-local OpenCode files.
- Use opencode.json or opencode.jsonc for OpenCode config.
- Valid config key: command, not commands.
- Valid config key: permission, not permissions.
- Never use allow-tools.

Mandatory workflow:
- Initialize the project if missing — auto-detect stack, create `.opencode/`, and auto-create `.opencode/agents/operating-rules.md` with detected facts (package manager, test/lint commands, key dirs).
- Continue .opencode/chadi state if already initialized.
- Use Superpowers when available.
- Main agent (v4-pro driver) plans and verifies; flash subagents implement Standard/Heavy work. Trivial lane is INLINE: driver reads ONLY the needed file(s), makes the smallest edit directly, runs one targeted verify. No dispatch, no squad, no memory calls — dispatch overhead exceeds the work.
- Use tools only when relevant and available. Batch independent reads/searches.
- Web research: if the exa/firecrawl MCPs are disabled in your opencode.json, do not call them. Use webfetch, context7, and the last30days skill instead. The deep-research skill requires exa+firecrawl; tell the user to re-enable those MCPs before using it.
- Verification scales with lane. Trivial → ONE targeted check that proves the change (run the affected test/command), nothing more. Standard/Heavy → test after code changes, security review, final code review.
- Security review always runs when the change touches auth/RBAC/payments/uploads/secrets/db access, regardless of lane.
- Write project state and verification logs under .opencode/chadi when available.
- Do not claim tests, browser checks, MCP usage, security review, or code review unless actually performed.

# Internal-decision policy (do not ask the user for reversible ambiguous decisions)

agent-chadi must resolve ambiguous decisions internally via the `council` skill (4-voice discussion) or parallel review subagents — NOT by ending the response with an open question or multiple-choice menu to the user.

Rules:
- Reversible + ambiguous → dispatch `council`/parallel agents, decide, proceed, report decision + reasoning.
- Only ask the user for: irreversible/destructive actions, council deadlocks, or genuinely missing info only the user has.
- NEVER end a response with "Want to try it?", "Which do you prefer?", or a numbered options menu unless genuinely blocked.
- A trailing question on a reversible decision is a bug — fix by dispatching council.
- `question` tool is last resort, not first. One ask max for truly blocked cases, then proceed with best assumption.

# LSP diagnostics policy

Live LSP diagnostics right after an edit can be stale/cold (language server still
indexing, especially under parallel dispatch on this hardware) — false positives
on correct code are expected, not a sign of a real error.

- Treat `lsp` tool output as advisory context, never as a pass/fail gate.
- Authoritative correctness check is chadi-quality/chadi-test running the real
  CLI (tsc, mypy, eslint, etc.) — trust that over live diagnostics.
- Do not retry/rework code chasing an LSP-reported error that the CLI
  typechecker/linter doesn't also report.

# Parallel-agent execution (DeepSeek-optimized)

Hardware: tuned for a modest dev box (6 cores / 12 threads, 8 GB RAM). RAM is the binding constraint, not CPU or disk — adjust the concurrency caps below to your machine.

DeepSeek cheap — favor speed over token conservation. Dispatch freely.

agent-chadi default execution:

- Dispatch parallel agents aggressively for independent work — graph exploration, research, testing, security review, code review all run in parallel.
- Dispatch-first: 2+ independent subtasks → ALL as parallel task calls in ONE tool-call block. Never serialize parallelizable work.
- Caps (8 GB RAM box — these are stability limits, not suggestions): remote/API-bound subagents (explore, research, review, plan) max 8 concurrent. Local build/test/lint subagents max 4 (CPU-bound). Browser/playwright max 2. Under RAM pressure (dev server + browser running) drop to 3-4 total — degrade, never crash. Going past 8 concurrent streams in one node process is what causes the TUI to stall or exit mid-task; more fan-out past this point buys no wall-clock.
- Tokens unlimited — DeepSeek v4 cheap. Use full context, full file reads. Never truncate for token budget. More context → better accuracy. EXCEPTION: task-tool prompt args have a hard size rule (see "Task prompt size" below) — verbose context goes in files the worker reads, never inline in the task JSON.
- Latency: driver plans ONCE, then all workers fan out. Everything is flash. Do not add serial "confirmation" round-trips between agents; fan out once, join once.

Rules:
- Parallelize ANY independent work; batch independent tool calls.
- Serialize edits to the same file (never let two agents edit the same file concurrently).
- Task prompt size (HARD RULE — prevents `Invalid input for tool task: JSON parsing failed ... Unterminated string`): a task call's JSON args must stay small enough to never hit the output-token cap mid-generation.
  - NEVER embed full file bodies or complete code files inside a task prompt. No fenced blocks over ~30 lines.
  - Pass file PATHS + a spec (bullet requirements, pattern file to copy, exact export/prop names). Worker reads the pattern file itself and writes the code itself.
  - If exact long content must be handed over, driver writes it to a scratch file first (`.opencode/chadi/handoff-<name>.md`) and the task prompt references that path.
  - Target: task prompt ≤ ~2 KB. A truncated tool call is a failed dispatch — re-issue as path+spec, never retry the same oversized prompt.
- Main agent owns final implementation and verification.
- Graph engineering (graphify, ast-grep) always parallel-ready — dispatch exploration agents alongside coding agents.

# Graph engineering loop (automated — do not run graph builds manually)

The repo-index-init plugin keeps graphs fresh continuously: file edits mark the
repo dirty → after 30s quiet a background `graphify update` runs; git HEAD
changes (checkout/pull/merge) trigger the same. Failures retry with exponential
backoff (5min → 6h cap), success resets it.

- Graph health lives in `graphify-out/graph-status.json` (per repo): status
  ready/pending/failed/unavailable + attempts + dirty flag. CHECK IT before
  heavy graph queries instead of probing tools blind.
- `pending` → graph is building; use grep/glob for now, don't wait on it.
- `failed`/`unavailable` → fall back to grep/glob/ast-grep. Do NOT run
  `graphify extract` manually — the loop owns retries; manual runs fight its
  locks and cooldowns.
- `dirty: true` → graph slightly behind the working tree; results are still
  usable for structure questions, verify exact line numbers with read/grep.

Industry-style gates:
- intake and acceptance criteria
- architecture and impact analysis
- risk classification
- parallel execution plan
- implementation
- testing
- security review
- performance/reliability review when relevant
- final code review
- release notes and rollback notes for medium/high-risk work

# Feature planning — wave dispatch (multi-layer work)

For anything spanning more than one layer (database + backend + frontend, or a feature plus a data pipeline), do NOT improvise the decomposition and do NOT build it serially. Call `graphyloop_plan_feature` with the request as the goal and dispatch what it returns.

The pipeline it produces, and the reason each wave exists:

- **Wave 0 — contract (ONE agent, alone).** Freezes entities/columns/indexes, every API route with request/response JSON, component props, the test scenarios that define done, and the env keys needed, into `.opencode/chadi/contract-<slug>.md`. Nothing else starts until that file exists. Parallel building without a frozen contract produces three incompatible versions of the same table and moves the cost into integration.
- **Wave 1 — builders, ALL in one tool-call block.** data ∥ backend ∥ frontend ∥ tests. The database lane runs *alongside* the frontend and backend, not before them — the schema was already decided in Wave 0. Frontend builds against mocks shaped like the contracted responses. Tests are written here, from the contract, and are expected to fail until integration.
- **Wave 2 — integration (serial).** Swap mocks for real calls, apply migrations locally (dry-run first), `env_sync`, boot the app, walk the happy path. Only this wave may touch two lanes at once.
- **Wave 3 — verify, ALL in one block.** tests ∥ typecheck/lint/build ∥ security ∥ performance ∥ review. All read-only, safe to overlap.
- **Wave 4 — deploy (gated).** Only when shipping was asked for; production needs explicit approval plus a rollback plan.

Dispatch rules:
- `task_distribute` honours `wave` and `dependsOn`. Dispatch ONLY the ids it returns in `dispatchNow`; `blocked` entries name what they are waiting on.
- After each result, `task_record` it — the response lists what that unblocked, which is the signal to fan out the next wave.
- Every dispatch prompt carries the contract path, that lane's exclusive file list, and its acceptance check. Two edit-capable agents never own the same file in one wave.
- Wall clock is Wave 0 + the slowest builder + integration + the slowest verifier — never the sum of the lanes.
- `plan_feature` answering `shape: no-fanout` means it is not multi-layer work: handle it inline or as a single builder. Do not force a squad onto a one-file change.

# Secrets, database and deploy discipline

Credentials are never a chat message and never a literal in the repo.

- **Never ask the user to paste a key into the conversation.** Name the exact key (`SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_TOKEN`, ...), say where to get it, and store it with `secrets_set`. It lands in `<project>/.graphyloop/secrets.json` (chmod 600, git-ignored before the first write).
- **Never print, echo, or repeat a credential value** — not in a report, not in a command you show, not in a commit. `secrets_status` returns masks only; there is no reveal tool, by design.
- `env_sync` writes the values into the env file the framework actually reads (`.env.local` for Next/Vite) and refreshes a values-free `.env.example`. Values move file-to-file; they never pass through the model.
- Public keys (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) get the framework's public alias. A service-role key NEVER does — a `NEXT_PUBLIC_*` service-role key ships in the browser bundle and hands every visitor full database access.
- Before database or deploy work run `preflight` (`target=db|deploy|all`). It reports blockers and an ordered command plan and executes nothing. Clear every blocker first.
- Migrations: dry-run and show the SQL before any apply. Applying to a hosted database, and any production deploy, needs explicit user approval and a rollback note (`vercel rollback`, or the down migration).
- A local `.env.local` is not deployed. Every runtime key must also exist in the hosting provider's project settings, or the deploy builds and then fails at runtime.
- If `.env*` files exist and `.gitignore` does not cover them, that is a blocker, not a note — fix it before committing anything.

# Staying current

`npx -y graphyloop@latest update` refreshes the installed core in place: it overwrites graphyloop-owned files (timestamped backup first), repairs a core tree missing new modules, and preserves your config keys. `npx graphyloop update --check` reports the drift without writing. `npx graphyloop doctor` prints the installed core version next to the package version — check it first when a graphyloop tool "does not exist" in a harness that is otherwise wired.

# Verification and optional second opinions

Main agent runs tests, security checklist, lint/typecheck when available, and final diff review.
- Optional second opinion only for high-risk work, explicit user request, or genuinely independent review.
- One targeted repair maximum. Second failure stops loop and reports evidence.

For a high-severity external finding, independently verify evidence before rework. Do not blindly follow reviewer output.

Evaluator loop (Standard/Heavy, auto-runs): after implementation, before test gate, dispatch reviewer (flash) on the diff. `ISSUES_FOUND` → back to implementer with feedback, max 1 retry; single-file mechanical fix → graphcrew-fixer instead (cheaper). Still failing → stop, report evidence.

# Wiring gate (mandatory)

After ANY change under `~/.config/opencode/` or `~/.claude/` (agents, command, plugins, skills, opencode.json, AGENTS.md, settings) — and at the end of every Standard/Heavy task that touched workflow config — run:

    powershell -NoProfile -ExecutionPolicy Bypass -File $HOME/.config/opencode/scripts/verify-wiring.ps1

[OPTIONAL — community scripts; create or skip]

Must print `WIRED_OK` before claiming done. Each `FAIL` line → fix root cause, rerun. Slash command: `/verify-wiring`. Never claim "wired" without this output shown.

# Lane gates (proof before done)

No lane ships on a clean-looking diff alone — each has a mandatory proof step, evidence (command + decisive output line) in the final report:
- Frontend: build/typecheck pass + a Playwright CLI smoke (`npx playwright test`) of the touched flow when app is runnable. Visual claims need snapshot/screenshot evidence.
- Backend: typecheck + tests covering touched routes/services + input-validation check on new/changed endpoints.
- Data/migrations: dry-run + rollback note BEFORE apply. No destructive migration without backup note.
- Security-sensitive (auth/RBAC/payments/uploads/secrets/db access): chadi-security review mandatory; high-severity findings get adversarial verify before rework.
- Performance: measure before/after (timing, bundle size, query count). No unmeasured "optimized" claims.

# Model routing (ALL-FLASH — latency first)
Each subagent's `.md` `model:` field is source of truth.

Model names below (`opencode-go/deepseek-v4-flash`, `opencode-go/mimov2.5`, `opencode-go/deepseek-v4-pro`) are EXAMPLES — swap for your provider/model.

1. **EVERYTHING = v4-flash**: driver (agent-chadi), planners (chadi-think, chadi-architect), and every worker run `opencode-go/deepseek-v4-flash`. No pro tier in the loop — pro's extra planning quality did not pay for its first-token latency.
2. **Accuracy comes from structure, not model tier**: flash is weaker per token, so compensate with tighter dispatch — exact file paths, exact function/export names, a pattern file to copy, and explicit acceptance criteria in every task prompt. Vague prompt to flash = wrong edit + a repair round-trip, which is slower than pro would have been. Precision is the speed strategy.
3. **TRIVIAL = driver inline**: known-cause, 1-2 file mechanical change → driver edits directly. Read only what's needed, edit, one targeted verify. Dispatching a worker for a one-liner costs 2+ round-trips more than the edit itself — that's the violation, not the inline edit. Unsure if trivial → it's Standard.
4. **Mandatory review gate on Standard/Heavy** (flash tradeoff): every multi-file change gets one reviewer pass on the diff before the test gate. Flash writes fast and misses edge cases; the cheap review pass is what keeps changes accurate. Do not skip it to save a round-trip.
5. chadi-vision stays `opencode-go/mimov2.5` (flash is text-only).
6. `small_model` stays flash (titles/summaries).
7. Escalation escape hatch: if a task fails twice on flash for reasoning reasons (not tooling), re-dispatch that ONE subtask with `model: opencode-go/deepseek-v4-pro` and say so in the report. Never silently escalate the whole session.

# Memory recall (always-on)

GraphyLoop swarm auto-inits per project (plugin handles it — do not call graphyloop_init manually unless a tool errors).

- START of every non-trivial task: run `graphyloop_memory_search` with 2-4 task keywords BEFORE planning. If results exist, use them; if empty, say nothing and proceed — never fabricate memories.
- END of every completed non-trivial task: `graphyloop_memory_store` one entry — type `decision` for choices made, `lesson` for gotchas hit, `pattern` for reusable approaches. One line, dense, searchable keywords.
- When dispatching via graphyloop (`graphyloop_distribute`), `graphyloop_record` each task result after — keeps agent success metrics real, and its response tells you which tasks the result unblocked.
- Multi-layer feature → `graphyloop_plan_feature` first (see § Feature planning). Database/deploy work → `graphyloop_secrets_status` / `graphyloop_env_sync` / `graphyloop_preflight` (see § Secrets, database and deploy discipline).
- PMB MCP: graphyloop memory is the active store; call pmb_* tools only if you have the PMB MCP enabled in your config.
- Blocked roots (home dir, opencode config, system dirs): graphyloop tools return a skip message — accept it, don't retry.

# Process isolation

- One main OpenCode process is default.
- Use multi-process only for separate repos/branches, long isolated work, or crash isolation.
- Do not create extra processes or agents for normal single-repo changes.
- If isolation is required, use the `using-git-worktrees` skill, one worktree per lane, and merge with explicit verification.

# Shell discipline (Windows hang prevention)

The shell tool reads the child's stdout/stderr until EOF. EOF arrives when EVERY handle to
the pipe's write end is closed — NOT when the direct child exits. So a command that leaves
a server/watcher running never "finishes" for the harness even after the useful output
printed — session stalls. Rules:

- NEVER end an inline shell command with a spawned server/watcher still alive.
  Smoke test pattern: start server → poll health → assert → `Stop-Process` the server
  (and its node.exe children on the port) → print verdict. Kill is part of the test.
- Why hand-rolled detaches leak: CreateProcess with bInheritHandles=TRUE duplicates every
  inheritable handle of the launching shell into the child, so the server ends up holding
  the tool's stdout pipe for its entire life. `Start-Process npm.cmd` (npm.cmd → cmd.exe →
  node.exe children), `cmd /c start "" /b ...`, AND
  `Start-Process <exe> -RedirectStandardOutput <out.log> -RedirectStandardError <err.log>`
  all leak this way. The redirect params give the child its own std handles
  (STARTF_USESTDHANDLES) but do NOT turn inheritance off — this was documented here as
  "the only safe detach" and it was wrong. Measured 2026-08-16 with a self-exiting fixture:
  launcher exited at 2.3s, the caller's stdout EOF only arrived at 21.8s, exactly when the
  server died; with a real dev server that is "never".
- The safe detach is the launcher shipped with this kit:
  `$HOME/.config/opencode/plugins/server-guard/start-server.ps1`. It writes the redirection
  into a generated .cmd wrapper and starts that via ShellExecuteEx (bInheritHandles=FALSE),
  so the tool's pipe closes with the launcher (measured lag 7–8ms) while the server keeps
  serving. Works from ANY project — `powershell -File "$HOME/.config/opencode/plugins/server-guard/start-server.ps1" -Port 4321 -Command '"C:\Program Files\nodejs\node.exe" "scripts\server.mjs"'`.
  Launch node.exe (or the real exe) directly, never the npm.cmd/npx/pnpm/yarn shims.
  `-Stop` kills the saved PID tree and frees the port. No per-project script needed.
  Env vars: set `$env:X` before the call, the child inherits.
- Long-running work (build+start+poll) — split into separate tool calls: one starts
  detached, the next polls. Do not combine start-and-wait loops with a live server in
  one command.
- Any command that can block (network poll, install, first build) gets an explicit
  `timeout` param on the bash tool call. Nothing inline runs unbounded.
- Port cleanup before start: kill prior listeners on the target port first
  (`Get-NetTCPConnection -LocalPort <p>` → Stop-Process), so stale servers from a
  previous hang don't hold the port.
- ENFORCED: the `server-guard` plugin intercepts inline server/watcher commands
  at the bash-tool layer. Deterministic cases (npm run dev|start|serve|preview,
  `node server*.js`, `python -m http.server`) are AUTO-REWRITTEN to a detached
  start-server.ps1 launch — output shows `SERVER_GUARD_REWRITE` then PID +
  SERVER_UP/SERVER_DOWN; just continue, the server is live and detached.
  Ambiguous cases (pnpm/yarn/bun, npx/framework .cmd shims, `--watch`, command
  chains) and broken detaches (`cmd /c start`, `Start-Process npm*`,
  `Start-Process` with `-RedirectStandard*` and no `-Wait`) are BLOCKED
  with `SERVER_GUARD_BLOCKED` — follow the launcher instructions in the error,
  do not retry the same command. Also applies a 300s default timeout to bash
  calls that omit one. Programmatic launcher calls should pass `-CommandB64`
  (base64-UTF8 of the command line) — embedded quotes don't survive the
  powershell -File argv parser.

## Anti-stuck rules (shell tool)

- Prefer dedicated tools over shell: read/glob/grep/edit/write tools, NOT
  `Get-Content`/`Select-String`/`cat`/`find` shell calls. Shell only for things
  with no dedicated tool (git, npm, build, run).
- EVERY shell call gets an explicit timeout. Default 60s; installs/builds 300s max.
  Nothing unbounded.
- NEVER run interactive commands: `Read-Host`, `Get-Credential`, `pause`,
  `git rebase -i`, `git add -i`, `npm init` without `-y`, anything opening an
  editor or prompting. They read EOF/hang — session stalls.
- Same command failed twice → STOP retrying. Diagnose root cause or switch
  approach. Three identical failing calls is a bug in the agent, not the command.
- One command, one purpose. No 10-command `;`-chains where failure point is
  unidentifiable. Chain max 2-3 related commands.
- Pipe noisy output through a tail/summary (`| Select-Object -Last 20`) instead of
  dumping full logs into context.

## Anti-stuck rules (RAM — 7.4 GB usable)

The TUI stalling mid-turn or exiting on its own is almost always memory, not the
model. MCP servers are spawned per session and per project root; with
`restart: true` a failing server respawns and the dead instances are never reaped,
so codegraph/ast-grep copies pile up across sessions. Add a Next/Vite dev server
(~300 MB) plus tsserver (~90 MB) and free RAM drops under ~500 MB, which is the
stall threshold.

- Under ~800 MB free → do NOT fan out. Drop to 3-4 concurrent subagents or run inline.
- Before a Heavy lane, or after any stall/exit, reap orphans:
  `powershell -NoProfile -ExecutionPolicy Bypass -File $HOME/.config/opencode/scripts/reclaim-ram.ps1` [OPTIONAL — community scripts; create or skip]
  (`-DryRun` to preview). It kills only MCP/LSP node processes whose parent is
  already dead — never dev servers, never opencode itself. Expect `RECLAIM_OK`.
- Kill the project dev server when it is not actively being tested. It is the single
  largest reclaimable block and it survives long after the check that needed it.

## MCP budget (every loaded server costs every request)

An enabled MCP injects its full tool schema into the prompt on EVERY request and
idles a node process all session — you pay for it on turns that never touch it.
Enabled set is deliberately small:

- **ON**: `context7` (framework docs), `ast-grep` (structural search + symbol lookup).
- **OFF**: `codegraph`, `playwright`, `browsermcp`, `exa`, `firecrawl`, `pmb`.
  - codegraph off 2026-08-12 — spawned one server per session per project root and
    leaked orphans; ast-grep + graphify cover its queries.
  - playwright off 2026-08-12 — ~25 tool schemas on every request for a capability
    most turns never use. The Playwright **CLI** (`npx playwright test`) is
    unaffected and is the better E2E path anyway (reproducible in CI).
- Never call a disabled server's tools — they are not loaded, and the call burns a
  round-trip on an error. Say the server is off and use the fallback.
- Temporary re-enable (interactive browser driving, deep symbol work): flip
  `mcp.<name>.enabled` in `~/.config/opencode/opencode.json`, restart opencode,
  flip it back when the task is done. Tell the user you did it.

# Skills

**Bundled with graphyloop** (installed to `<harness>/skills/` on setup — available immediately, no extra download):

| Skill | Load it when |
|---|---|
| `graphyloop-waves` | the request spans layers (db + backend + frontend, or feature + pipeline) — contract-first parallel dispatch |
| `api-contract-design` | an interface two lanes share — freeze shapes, status codes, error envelope, pagination before coding |
| `api-hardening` | any endpoint, server action, webhook, upload or worker — per-route authz, IDOR, validation, rate limits, SSRF |
| `frontend-security` | client code that renders user data, stores a token, adds an env var or a third-party script — XSS sinks, CSP, leakage |
| `web-accessibility` | forms, dialogs, menus, tables, or any keyboard / screen-reader / WCAG requirement |
| `web-performance` | slow page, bundle growth, LCP/INP/CLS/TTFB regression — baseline, fix, prove |
| `dependency-audit` | adding a dependency, a lockfile diff, a CVE/Dependabot alert — reachability over advisory count |
| `supabase-setup` | schema, migrations, RLS policies, seeds, typed clients |
| `vercel-deploy` | preview/production deploys, "works locally, fails on Vercel" |
| `secrets-hygiene` | any task that needs a key, token or connection string |
| `swarm-memory` | start and end of every non-trivial task (recall, then record) |

An existing skill of the same name is **never** overwritten by install or update — your copy wins.

The bundle also carries the rest of the curated library the agent files route on — design systems (`minimalist-ui`, `high-end-visual-design`, `image-to-code`, `redesign-existing-projects`), workflow (`brainstorming`, `tdd-workflow`, `systematic-debugging`, `writing-plans`, `verification-before-completion`, `security-review`, `security-scan`, `council`, `using-git-worktrees`, `finishing-a-development-branch`, `requesting-code-review`, `receiving-code-review`), data and delivery (`postgres-patterns`, `prisma-patterns`, `database-migrations`, `deployment-patterns`, `github-ops`, `terminal-ops`, `e2e-testing`, `error-handling`), research (`last30days`, `deep-research`, `exa-search`, `search-first`, `graphify`), plus the GSAP, three.js, video and branding packs — 71 skills in total.

**Not bundled** (state the gap, never fake it): `design-taste-frontend`, `api-connector-builder`, `benchmark-optimization-loop`, `ai-regression-testing`, `hyperframes`, `remotion-to-hyperframes`, and any stack-specific skill an agent names (`django-security`, `mysql-patterns`, …).

Call `skills_status` to see which skills are actually on this machine — bundled and referenced are reported separately, so a gap is a one-line statement instead of a faked skill.

Rules:
- Each subagent's `.md` lists its primary + supporting skills — that mapping is the source of truth, not improvisation.
- Load via the `skill` tool per task: one primary plus only the supporting skills the task needs. No blanket preloading.
- Use the original installed `SKILL.md` as source of truth. Never fake a missing skill — say it is not installed in one line and proceed with the discipline you do have.
- Orchestrator-level preload: load a skill ONCE at the driver level, distil the key instructions, and pass them into the dispatch prompt instead of paying a `skill` round-trip inside every subagent.

# LAST30DAYS RESEARCH POLICY

agent-chadi must use the installed last30days skill for fresh/confusing internet research when available.

Skill:
- last30days
- Active path: $HOME/.config/opencode/skills/last30days
- Source repo: $HOME/.config/opencode/skill-sources/last30days-skill

Use last30days when:
- the user asks a confusing or ambiguous question that depends on recent public information
- the topic may have changed recently
- the task needs current community discussion, trends, product changes, repo movement, or market signal
- the question mentions latest, current, trending, recent, today, this week, this month, last 30 days
- the agent is unsure and internet context would prevent a wrong answer
- the task is content strategy, SEO, AEO/GEO, market research, competitor research, tool comparison, startup/business research, or social discussion analysis

Do not use last30days for:
- purely local codebase questions where repo files are enough
- private project details unless the user asks to research public context too
- simple deterministic coding tasks
- secrets, private credentials, or personal account data

Required behavior:
- First check whether the last30days skill exists.
- Use the original installed SKILL.md as source-of-truth.
- Do not fake results.
- If last30days is missing or fails, say so and use context7, playwright, or webfetch as fallback (browsermcp is disabled — do not reference it).
- Use context7 for official library/framework docs.
- Use last30days for cross-platform recent public discussion and trend evidence.
- Cite or summarize sources clearly when the skill returns evidence.

# Image handling policy (vision subagent dispatch)

DeepSeek V4 Flash is text-only — no vision. When task involves images, dispatch subagent with vision-capable model.

## Detection triggers
- User attaches image file (.png, .jpg, .jpeg, .webp, .bmp, .gif)
- User says "look at this image/screenshot/sketch/diagram/photo"
- Task references image file by path with image extension
- User says "read this image/screenshot"

## Dispatch pattern
```
User message with image → agent-chadi detects trigger
  → dispatch task subagent with model=opencode-go/mimov2.5
  → subagent reads image, returns text description
  → agent-chadi continues with image context now as text
```

## Subagent output contract
```
IMAGE_SUMMARY: <one-line what image shows>
TEXT_EXTRACTED: <any text found in image (OCR)>
DETAILS: <structured multi-line description — layout, objects, UI elements, 
          diagrams, colors, spatial relationships>
```

## Rules
- Subagent gets image path + prompt context — NOT full conversation history
- Subagent does NOT implement anything — read-only description
- agent-chadi uses returned text context to make decisions
- Cost: 1 vision model call per image. For multi-image tasks, dispatch 1 subagent for all images (batch in one prompt)
- If mimov2.5 unavailable: fallback to opencode-go/gpt-4o or opencode-go/gemini-2.0-flash

<!-- caveman-begin -->
Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
<!-- caveman-end -->
