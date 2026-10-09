# GraphyLoop Workflow v2

Harness-neutral rules for coding agents: OpenCode, Claude Code, Codex, Cursor, Windsurf, DeepSeek Harness, Oh My Pi, Gemini CLI. The same rules ship as the bundled skill `graphyloop-workflow`, which harnesses with their own rules file load on demand.

Project rules (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules`) and the user's explicit instruction beat this file. Never create a rules file the project did not ask for.

## Tool names

GraphyLoop tools are identical everywhere; only the prefix differs. OpenCode: `graphyloop_<tool>`. Claude Code and DeepSeek Harness: `mcp__graphyloop__<tool>`. Codex, Cursor, Oh My Pi, Gemini CLI: bare `<tool>` from MCP server `graphyloop`. This file uses bare names: `plan_feature`, `task_distribute`, `task_record`, `swarm_state`, `memory_search`, `memory_store`, `memory_forget`, `secrets_status`, `secrets_set`, `env_sync`, `preflight`, `skills_status`. A tool that "does not exist" means a stale or unwired core: run `npx graphyloop doctor`.

## The workflow (11 rules, in order)

1. **Recall first, record last.** Before a non-trivial task run `memory_search` with 2-4 keywords; use hits and say which one informed the plan, say nothing on a miss, never invent a memory. At the end `memory_store` ONE dense line (`decision`, `lesson`, `pattern` or `event`). Never store credentials. Skill: `swarm-memory`.
2. **Size the work.** A goal touching 3 or fewer known files is done inline: read them, make the smallest edit, run one targeted check. No dispatch, no squad, no memory calls. 4+ files or unmapped code is a build (rules 3-9). Unsure: start inline, escalate when discovery finds more files.
3. **Context pack before dispatch.** One batched read pass (parallel reads/greps or one script) writes `ctx-<slug>.md`: per lane, `path:line`, the current code excerpt, and the pattern file to copy. Lanes start editing instead of rediscovering. It lives next to the contract (default `.opencode/chadi/`).
4. **Freeze the contract.** In the same turn as dispatch write `contract-<slug>.md`: entities, columns, indexes, every route with request/response JSON and error codes, component props, the test scenarios that define done, env keys. It is the only cross-lane dependency. If it proves wrong, stop and fix the contract; never let a lane drift silently.
5. **One wave.** Dispatch all independent lanes in ONE parallel call: one lane per layer (data, backend, frontend, tests, UI), strictly disjoint file sets named in each brief. Max 4 concurrent by default. The data lane runs alongside backend and frontend, not before. Two edit-capable agents never own one file in the same wave.
6. **Turn economy.** Latency is round trips. Lanes batch independent reads, make the first edit by turn 5 and finish in about 25 turns; a lane needing 40+ is mis-sized, split it. Every BUILDER brief (wave-1 data, backend, frontend and test-writing lanes) ends with this footer, verbatim:
   `Read the ctx pack and contract first, in ONE turn. Batch 2+ reads/searches into one parallel call; read with line ranges; never re-read a file; first edit by turn 5; do not run project-wide lint/test/build — the driver does.`
   The wave-0 lane that writes the ctx pack and contract ends with: `Batch 2+ reads/searches into one parallel call; read with line ranges; never re-read a file; write the ctx pack and contract before anything else.` Integration, verify and deploy lanes (they do run tests and builds) end with: `Read the ctx pack and contract first, in ONE turn. Batch 2+ reads/searches into one parallel call; read with line ranges; never re-read a file.`
7. **No polling.** Servers, builds, deploys and renders run in the background or through the tool's own blocking command (`vercel inspect --wait`, `gh run watch`). Never sleep-loop, re-check on a timer, or wait speculatively; the result arrives on its own.
8. **Verify by running.** Smoke the changed path and quote the decisive output line. Tests alone are not proof; UI is checked in a real browser (Playwright CLI is fine); artifacts are verified by viewing the rendered file. The driver runs lint/typecheck/test/build once, centrally, after lanes land.
9. **Audit wave is conditional.** Reviewer and security agents run only for auth, RBAC, payments, uploads, secrets, data or tenant boundaries, or a diff the driver cannot read end to end. A small readable diff is reviewed by the driver.
10. **Artifact wave** (posters, decks, PDFs, video, image sets): freeze `brief-<slug>.md`, produce the hero piece first, then one lane per artifact.
11. **Evidence-first report.** End with **Changed**, **Files** (exact list), **Verified** (command plus verbatim decisive output), **Skills**, **Blocked** (or "None"). Never claim a test, browser check, security review or skill use that did not happen.

## Five gates

**Classify** (rule 2) → **Discover** (rules 1, 3, 4) → **Implement** (rules 5-7) → **Verify** (rules 8, 9) → **Report** (rules 1, 11).

Heavy changes (auth, payments, migrations, deploys, architecture) show the plan and wait for "go" unless pre-approved ("go", "do it", "ship it").

## Feature planning

For work across layers call `plan_feature` with the request as `goal`; do not improvise the decomposition. It returns waves, tasks, per-lane `owns` globs, `acceptance` checks and `dependsOn`, and wave 0 produces the context pack and the contract.

- **Wave 0, contract** (one agent, alone): `ctx-<slug>.md` and `contract-<slug>.md`. Nothing starts before both exist.
- **Wave 1, builders** in one call: data, backend, frontend, tests. Frontend builds against mocks shaped like the contracted responses, with the fetch layer in ONE module. Tests come from the contract and may fail until integration.
- **Wave 2, integration** (serial): swap mocks for real calls, apply migrations locally (dry-run first), `env_sync`, boot the app, walk the happy path. Only this wave may touch two lanes.
- **Wave 3, verify** in one call: tests, typecheck/lint/build, then the conditional audit. All read-only.
- **Wave 4, deploy**, only when asked: production needs explicit approval and a rollback plan.

Dispatch only the ids in `dispatchNow` from `task_distribute`; `blocked` entries name what they wait on. `task_record` every result; the response lists what it unblocked. After a restart `swarm_state` reports ready and blocked tasks. `shape: no-fanout` means inline or one builder. Skill: `graphyloop-waves`.

Keep briefs small (about 2 KB): role, goal, paths, symbols, pattern file, acceptance check. Never paste file bodies; point at the ctx pack or a handoff file. A truncated tool call is a failed dispatch: re-issue as paths plus spec.

## Decisions without bothering the user

Reversible and ambiguous: decide internally (`council` skill or parallel review agents), proceed, report the decision and why. Ask only for irreversible or destructive actions, a council deadlock, or information only the user has; one ask, then continue on the best assumption. A trailing "which do you prefer?" on a reversible choice is a bug.

## Lane gates (proof before done)

- **Frontend:** build/typecheck plus a Playwright smoke of the touched flow; visual claims need a screenshot. **Backend:** typecheck, tests on touched routes, input validation on new endpoints.
- **Data:** dry-run and rollback note BEFORE apply. **Performance:** measure before and after.
- **Security-sensitive:** security review is mandatory; try to refute a high-severity finding before rework.
- **Failures:** one targeted repair; a second failure stops the loop and reports evidence. LSP diagnostics right after an edit can be stale: the real compiler/linter run is authoritative.

## Secrets, database and deploy

- **Never ask the user to paste a key into the chat.** Name the exact key (`SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_TOKEN`), say where to get it, store it with `secrets_set` (`<project>/.graphyloop/secrets.json`, chmod 600, git-ignored before the first write).
- **Never print, echo or repeat a credential value**, in a report, shown command or commit. `secrets_status` returns masks only.
- `env_sync` writes values into the env file the framework reads (`.env.local` for Next/Vite) and refreshes a values-free `.env.example`; values never pass through the model.
- Public keys get the framework's public alias; a service-role key NEVER does (`NEXT_PUBLIC_*` ships to the browser).
- Before database or deploy work run `preflight` (`target=db|deploy|all`): it reports blockers and an ordered plan, executes nothing. Clear every blocker first.
- Migrations: dry-run and show the SQL before any apply. A hosted-database apply or production deploy needs explicit approval and a rollback note (`vercel rollback` or the down migration).
- A local `.env.local` is not deployed: mirror every runtime key in the host's settings. `.env*` files not covered by `.gitignore` are a blocker.

## Shell discipline

A shell tool reads output until EOF, which only arrives when every handle to the pipe closes, not when the direct child exits. A command that leaves a server or watcher alive never "finishes" and stalls the session.

- Never end an inline command with a server or watcher attached: run it in the background, or start, probe, assert and stop inside one bounded command (the kill is part of the test).
- Every command that can block (network, install, first build) gets an explicit timeout.
- Prefer dedicated read/glob/grep/edit tools over shell `cat`/`find`. No interactive commands (`git rebase -i`, prompts, editors): they hang on EOF.
- The same command failing twice: stop, diagnose or change approach. Pipe noisy output through a tail.
- Probe `127.0.0.1`, not `localhost`, on Windows (`::1` is tried first); poll at most 30 s, then report the server is not up.

**Windows + OpenCode server-guard plugin.** Hand-rolled detaches (`Start-Process npm.cmd`, `cmd /c start`, `Start-Process -RedirectStandard*`) leak the tool's stdout handle. The bundled `server-guard` plugin auto-rewrites inline `npm run dev|start|serve|preview`, `node server*.js` and `python -m http.server` to a detached launch (`SERVER_GUARD_REWRITE`, PID, `SERVER_UP`/`SERVER_DOWN`) and refuses ambiguous or broken ones with `SERVER_GUARD_BLOCKED` plus instructions: follow them, never retry the same command. The launcher is `plugins/server-guard/start-server.ps1` in the OpenCode config dir (`-Port <p> -Command '<exe> <args>'`, `-Stop`); launch `node.exe` directly, never `npm`/`npx`/`pnpm` shims. Other harnesses use their own background-process feature.

## Isolation and currency

- One main process by default; git worktrees (`using-git-worktrees`), one per lane, only for separate branches or merge-prone refactors. Serialize edits to one file; read-only agents are safe alongside anything. Do not fan out a tightly coupled change or anything under 4 files; after a stall run fewer lanes or inline.
- Before writing library code read the manifest and lockfile and check current docs (context7, official docs, `search-first`); training data is stale. A repo pinned to an old major gets code for that major plus a "noticed, not changed" note.
- `npx -y graphyloop@latest update` refreshes the installed core (timestamped backup, your config keys kept); `update --check` reports drift; `npx graphyloop doctor` shows each harness, whether it is wired, and the fix command.
- Fresh public information (releases, trends, market or SEO research) goes through `last30days` when installed, with sources cited; if it is missing, say so and use the nearest fallback.

## Skills

Bundled with graphyloop (installed on setup; an existing skill of the same name is never overwritten, your copy wins). Core, load when the task matches:
- `graphyloop-workflow` (this file, condensed, for harnesses that did not load it), `graphyloop-waves` (layered request: context pack, contract-first dispatch), `swarm-memory` (start and end of every non-trivial task).
- `api-contract-design` (interface two lanes share), `api-hardening` (endpoint, server action, webhook, upload, worker), `frontend-security` (client code with user data, tokens, env vars, third-party scripts), `web-accessibility`, `web-performance`, `dependency-audit` (new dependency, lockfile diff, CVE), `supabase-setup`, `vercel-deploy`, `secrets-hygiene` (any key, token or connection string).
- `caveman`, `caveman-commit`, `caveman-compress`, `caveman-help`, `caveman-review`: optional terse output mode, only when the user asks. `cavecrew`: delegating to compressed-output helpers.

Also bundled: design (`minimalist-ui`, `high-end-visual-design`, `image-to-code`, `redesign-existing-projects`); workflow (`brainstorming`, `tdd-workflow`, `systematic-debugging`, `writing-plans`, `verification-before-completion`, `security-review`, `security-scan`, `council`, `using-git-worktrees`, `finishing-a-development-branch`, `requesting-code-review`, `receiving-code-review`); data and delivery (`postgres-patterns`, `prisma-patterns`, `database-migrations`, `deployment-patterns`, `github-ops`, `terminal-ops`, `e2e-testing`, `error-handling`); research (`last30days`, `deep-research`, `exa-search`, `search-first`, `graphify`); animation and 3D (`gsap-core`, `gsap-frameworks`, `gsap-performance`, `gsap-plugins`, `gsap-react`, `gsap-scrolltrigger`, `gsap-timeline`, `gsap-utils`, `threejs-animation`, `threejs-fundamentals`, `threejs-geometry`, `threejs-interaction`, `threejs-lighting`, `threejs-loaders`, `threejs-materials`, `threejs-postprocessing`, `threejs-shaders`, `threejs-textures`); video and story (`remotion-video-creation`, `short-video-production`, `story-engineering`, `video-ai-automation`, `ai-video-prompt-engineer`).

**Not bundled** (state the gap, never fake it): `design-taste-frontend`, `api-connector-builder`, `benchmark-optimization-loop`, `ai-regression-testing`, `hyperframes`, `remotion-to-hyperframes`, and stack-specific skills an agent names (`django-security`, `mysql-patterns`). `skills_status` shows what is on this machine.

Each agent file lists its primary and supporting skills; use that mapping, one primary plus only what the task needs, no blanket preloading. The installed `SKILL.md` is the source of truth; a missing skill is one line ("not installed"), then proceed. A driver may load a skill once and pass the distilled rules in the brief.

Blocked roots (home directory, harness config dirs, system dirs) make graphyloop tools return a skip message by design: accept it. After a restart re-read `swarm_state`; live task state does not survive one.
