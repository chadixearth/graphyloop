---
name: graphyloop-workflow
description: Use this skill at the start of any non-trivial coding task, build or multi-file change to follow GraphyLoop Workflow v2 - recall, size the work, context pack, frozen contract, one parallel wave, no polling, verify by running, evidence report.
---

# GraphyLoop Workflow v2 (condensed)

The full rules live in the installed rules file (`AGENTS.md`) when your harness loads one. This is the same workflow in one page, for harnesses that do not: Oh My Pi, Gemini CLI, Claude Code and others. The user's explicit instruction and the project's own rules always win.

Tool names: OpenCode `graphyloop_<tool>`; Claude Code and DeepSeek Harness `mcp__graphyloop__<tool>`; Codex, Cursor, Oh My Pi, Gemini CLI bare `<tool>`. Below: bare names. If one is missing, run `npx graphyloop doctor`.

## The 11 rules

1. **Recall first, record last.** `memory_search` with 2-4 keywords before planning; use hits, stay silent on a miss, never invent one. At the end `memory_store` ONE dense line (`decision` / `lesson` / `pattern` / `event`). Never store credentials. See `swarm-memory`.
2. **Size the work.** 3 or fewer known files: do it inline (read, smallest edit, one targeted check, no dispatch, no memory calls). 4+ files or unmapped code is a build: rules 3-9.
3. **Context pack.** One batched read pass writes `ctx-<slug>.md`: per lane `path:line`, the current code excerpt, the pattern to copy. Lanes start editing instead of rediscovering.
4. **Freeze the contract.** Same turn as dispatch, write `contract-<slug>.md` (entities and columns, routes with request/response JSON and error codes, props, the test scenarios that define done, env keys). It is the only cross-lane dependency; if wrong, fix the contract, never drift.
5. **One wave.** All independent lanes in ONE parallel dispatch, one lane per layer (data, backend, frontend, tests, UI), strictly disjoint file sets, max 4 concurrent by default. Data runs alongside backend and frontend.
6. **Turn economy.** Lanes batch reads, first edit by turn 5, done in about 25 turns; 40+ means mis-sized. End every BUILDER brief with:
   `Read the ctx pack and contract first, in ONE turn. Batch 2+ reads/searches into one parallel call; read with line ranges; never re-read a file; first edit by turn 5; do not run project-wide lint/test/build — the driver does.`
   Wave-0 (writes ctx + contract): `Batch 2+ reads/searches into one parallel call; read with line ranges; never re-read a file; write the ctx pack and contract before anything else.` Integration/verify/deploy lanes: `Read the ctx pack and contract first, in ONE turn. Batch 2+ reads/searches into one parallel call; read with line ranges; never re-read a file.`
7. **No polling.** Servers, builds, deploys and renders run in the background or via the tool's own blocking command (`vercel inspect --wait`, `gh run watch`). Never sleep-loop.
8. **Verify by running.** Smoke the changed path and quote the decisive output line. Tests alone are not proof; check UI in a real browser; check artifacts by viewing the rendered file. Run lint/typecheck/test/build once, centrally, after lanes land.
9. **Audit is conditional.** Reviewer and security agents only for auth, RBAC, payments, uploads, secrets, data/tenant boundaries, or a diff you cannot read end to end.
10. **Artifact wave** (posters, decks, PDFs, video): freeze `brief-<slug>.md`, hero piece first, one lane per artifact.
11. **Evidence-first report:** **Changed** / **Files** / **Verified** (command plus verbatim output) / **Skills** / **Blocked**. Never claim a check that did not run.

Five gates: Classify (2) → Discover (1, 3, 4) → Implement (5-7) → Verify (8, 9) → Report (1, 11).

## Multi-layer features

Call `plan_feature` with the request as `goal`. It returns waves, tasks, per-lane `owns` globs, `acceptance` checks and `dependsOn`; `shape: no-fanout` means inline. Wave 0 writes the ctx pack and contract alone; wave 1 builders in one call; wave 2 integration (the only wave that touches two lanes: real calls for mocks, local migrations dry-run first, `env_sync`, boot, happy path); wave 3 verify in one call; wave 4 deploy only when asked, with approval and a rollback plan. Dispatch only `dispatchNow` ids from `task_distribute`; `task_record` each result. See `graphyloop-waves`.

Keep briefs to about 2 KB: role, goal, paths, symbols, pattern file, acceptance check. Never paste file bodies.

## Always

- **Decide reversible ambiguity yourself** (`council` or parallel review), report the decision. Ask only for irreversible or destructive actions or facts only the user has.
- **Secrets:** never ask for a key in chat, never print a value. Name the key, store with `secrets_set`, materialize with `env_sync`, check `secrets_status`. Run `preflight` (`target=db|deploy|all`) before database or deploy work. Migrations: dry-run and show SQL before apply; hosted-database applies and production deploys need explicit approval and a rollback note.
- **Shell:** never leave a server or watcher attached to the tool's output; background it or start, probe and stop in one bounded command. Explicit timeouts on anything that can block, no interactive commands, stop after the same command fails twice. Probe `127.0.0.1`, not `localhost`, on Windows. (Windows + OpenCode: the `server-guard` plugin rewrites inline dev-server commands for you.)
- **Currency:** check the manifest and current docs before writing library code.
- **Skills:** load one primary skill per task and only what it needs; an uninstalled skill is one line, then proceed. `skills_status` lists what is on this machine.

## Proof per lane

Frontend: build/typecheck plus a browser smoke of the touched flow. Backend: typecheck, tests on touched routes, input validation. Data: dry-run and rollback note before apply. Security-sensitive: review is mandatory; try to refute a high-severity finding before rework. Performance: measure before and after. One targeted repair on failure; a second failure stops and reports evidence.
