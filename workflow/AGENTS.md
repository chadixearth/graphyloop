# GraphyLoop Workflow v3

Harness-neutral rules for coding agents: OpenCode, Claude Code, Codex, Cursor, Windsurf, DeepSeek Harness, Oh My Pi, Gemini CLI. The same rules ship as the bundled skill `graphyloop-workflow`, which harnesses with their own rules file load on demand.

Project rules (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules`) and the user's explicit instruction beat this file. Never create a rules file the project did not ask for.

## Tool names

GraphyLoop tools are identical everywhere; only the prefix differs. OpenCode: `graphyloop_<tool>`. Claude Code and DeepSeek Harness: `mcp__graphyloop__<tool>`. Codex, Cursor, Oh My Pi, Gemini CLI: bare `<tool>` from MCP server `graphyloop`. The Claude Code plugin install uses the plugin's own prefix (`/mcp` shows it). This file uses bare names: `plan_feature`, `task_distribute`, `task_record`, `swarm_state`, `memory_search`, `memory_store`, `memory_forget`, `secrets_status`, `secrets_set`, `env_sync`, `preflight`, `skills_status`. A tool that "does not exist" means a stale or unwired core: run `npx graphyloop doctor`.

## The workflow (12 rules, in order)

1. **Recall first, record last.** Before a non-trivial task run `memory_search` with 2-4 keywords; use hits and say which one informed the plan, say nothing on a miss, never invent a memory. At the end `memory_store` ONE dense line (`decision`, `lesson`, `pattern` or `event`) that keeps the *why* and names the commit or PR it landed in, so the reason stays findable later. Never store credentials. Skill: `swarm-memory`.
2. **Goal and proof up front.** Restate the task as the end state, the check that proves it (a command, a number, a screenshot) and the invariant it must not break. Prompt the what, not the how: with a measurable target, keep iterating until the check passes instead of stopping at the first plausible diff. Never reach a target by weakening it (deleting a test, loosening an assertion, skipping a case).
3. **Inline first.** Up to 8 known files, in any mix of layers, are done inline when the code is known or one batched read pass maps it: read them, edit, run the check. No dispatch, no squad. A lane costs the driver minutes of waiting; an inline edit costs seconds (measured across real sessions: about 12 minutes of driver wait per dispatch against about 7 seconds per edit). Unsure: start inline and escalate when discovery finds more.
4. **Fan out only for real parallelism.** Dispatch when the work splits into 2+ independent slices of about 5 minutes or more each: 8+ files across 2+ layers, an artifact set, a long investigation beside the edits. Use 1-3 lanes (max 4), strictly disjoint file sets, all in ONE parallel call. The driver keeps the largest or most coupled slice and builds it while the lanes run; it never dispatches everything and then waits. Two small layers are one lane, not two. Do not fan out a tightly coupled change; after a stall run fewer lanes or go inline.
5. **Context pack before dispatch.** One batched read pass (parallel reads/greps or one script) writes `ctx-<slug>.md`: per lane, `path:line`, the current code excerpt, and the pattern file to copy. Lanes start editing instead of rediscovering. The driver writes it itself when one pass maps the code; a scout lane is only for code too large to map that way. It lives next to the contract (default `.opencode/chadi/`).
6. **Freeze the contract.** In the same turn as dispatch write `contract-<slug>.md`: entities, columns, indexes, every route with request/response JSON and error codes, component props, the test scenarios that define done, env keys. It is the only cross-lane dependency. If it proves wrong, stop and fix the contract; never let a lane drift silently.
7. **Turn economy.** Latency is round trips. Lanes batch independent reads, make the first edit by turn 5 and finish in about 20 turns; a lane needing 40+ is mis-sized, split it. Every BUILDER brief (wave-1 data, backend, frontend and test-writing lanes) ends with this footer, verbatim:
   `Read the ctx pack and contract first, in ONE turn. Batch 2+ reads/searches into one parallel call; read with line ranges; never re-read a file; first edit by turn 5; do not run project-wide lint/test/build — the driver does.`
   The wave-0 lane that writes the ctx pack and contract ends with: `Batch 2+ reads/searches into one parallel call; read with line ranges; never re-read a file; write the ctx pack and contract before anything else.` Integration, verify and deploy lanes (they do run tests and builds) end with: `Read the ctx pack and contract first, in ONE turn. Batch 2+ reads/searches into one parallel call; read with line ranges; never re-read a file.`
8. **Isolate what collides.** Lanes that only edit files share one tree. A lane that runs a server, a database, a browser or a long test suite gets its own git worktree (`using-git-worktrees`), port and database name, so parallel agents never fight over `:3000` or one dev database. Serialize edits to one file; read-only agents are safe alongside anything.
9. **No polling; schedule follow-ups.** Servers, builds, deploys and renders run in the background or through the tool's own blocking command (`vercel inspect --wait`, `gh run watch`); results arrive on their own. Never sleep-loop, re-check on a timer, or wait speculatively. A check that belongs later ("watch the logs for two hours", "confirm the deploy is live tomorrow") goes to the harness's scheduler or loop feature when it has one (Claude Code `/loop` or `/schedule`), otherwise into the report as a next action.
10. **Proof, not claims.** Done means shown: the test failing before the fix and passing after; a real-browser screenshot of the touched UI flow (Playwright CLI is fine); before/after numbers from the same machine for performance; the live URL answering for a deploy; the rendered file viewed for an artifact. NOT evidence: "tests pass" alone, a clean typecheck alone, "should work", "looks correct", a run against mocks. The driver runs lint/typecheck/test/build once, centrally, after lanes land.
11. **Review by blast radius.** Reviewer and security lanes run only for migrations and schema changes, auth and RBAC, payments, uploads, secrets, tenant boundaries, public API contracts, and the central files the project names in its own rules (list them there). Everything else is covered by rule 10's proof plus the driver reading the diff.
12. **Evidence-first report.** End with **Changed**, **Files** (exact list), **Verified** (command plus verbatim decisive output), **Skills**, **Blocked** (or "None"). Never claim a test, browser check, security review or skill use that did not happen.

## Five gates

**Classify** (rules 2-4) → **Discover** (rules 1, 5, 6) → **Implement** (rules 4, 7-9) → **Verify** (rules 10, 11) → **Report** (rules 1, 12).

Heavy changes (auth, payments, migrations, deploys, architecture) show the plan and wait for "go" unless pre-approved ("go", "do it", "ship it").

## Keep the rules honest

- **Short rules, deep skills.** This file loads every turn, so it stays short; procedures live in skills that load on demand (progressive disclosure). Project rules hold pitfalls, rationale and non-default conventions, not what an agent can derive from the code (directory trees, dependency lists).
- **Test the guidance.** A rule or skill earns its place when agents do measurably better with it: run the same task with and without it (control against treatment, a few runs each; `claude plugin eval` or the `skill-creator` benchmark automate this in Claude Code) and delete what shows no effect.
- **Let compaction work.** Do not hand-manage token counts; keep one thread per task. Anything that must survive compaction or a restart goes into a file the agent re-reads: the ctx pack, the contract, memory, the plan.

## Artifact wave

Posters, decks, one-pagers, PDFs, video, image sets: the lane unit is one artifact, not a code layer. Freeze `brief-<slug>.md` first (brand tokens, format and aspect ratio, final copy per artifact, the one chosen design system), produce the hero piece first and pass it to every sibling, then one lane per artifact. A set of 2 or fewer stays inline. Verify by viewing every rendered page or frame.

## Feature planning

For work across layers call `plan_feature` with the request as `goal`; do not improvise the decomposition. It returns waves, tasks, per-lane `owns` globs, `acceptance` checks and `dependsOn`, and wave 0 produces the context pack and the contract.

- **Wave 0, contract**: `ctx-<slug>.md` and `contract-<slug>.md`, written by the driver in one batched pass when it can map the code, otherwise by one agent alone. Nothing starts before both exist.
- **Wave 1, builders** in one call: data, backend, frontend, tests; the driver keeps the most coupled lane and builds it inline. Frontend builds against mocks shaped like the contracted responses, with the fetch layer in ONE module. Tests come from the contract and may fail until integration.
- **Wave 2, integration** (serial): swap mocks for real calls, apply migrations locally (dry-run first), `env_sync`, boot the app, walk the happy path. Only this wave may touch two lanes.
- **Wave 3, verify** in one call: tests, typecheck/lint/build, then the conditional audit. All read-only.
- **Wave 4, deploy**, only when asked: production needs explicit approval and a rollback plan.

Dispatch only the ids in `dispatchNow` from `task_distribute`; `blocked` entries name what they wait on. `task_record` every result; the response lists what it unblocked. After a restart `swarm_state` reports ready and blocked tasks. `shape: no-fanout` means inline or one builder. Skill: `graphyloop-waves`.

Keep briefs small (about 2 KB): role, goal, paths, symbols, pattern file, acceptance check. Never paste file bodies; point at the ctx pack or a handoff file. A truncated tool call is a failed dispatch: re-issue as paths plus spec.

## Decisions without bothering the user

Reversible and ambiguous: decide internally (`council` skill or parallel review agents), proceed, report the decision and why. Ask only for irreversible or destructive actions, a council deadlock, or information only the user has; one ask, then continue on the best assumption. A trailing "which do you prefer?" on a reversible choice is a bug.

## Lane gates (proof before done)

- **Frontend:** build/typecheck plus a browser smoke of the touched flow with a screenshot. **Backend:** typecheck, tests on touched routes, input validation on new endpoints.
- **Data:** dry-run and rollback note BEFORE apply. **Performance:** measure before and after on the same machine.
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

## Currency

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
