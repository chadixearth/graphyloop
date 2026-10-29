---
name: graphyloop-workflow
description: Use this skill at the start of any non-trivial coding task, build or multi-file change to follow GraphyLoop Workflow v3 - recall, goal and proof up front, inline first (up to 8 files), fan out only for 2+ independent slices, context pack, frozen contract, no polling, proof not claims, review by blast radius, evidence report.
---

# GraphyLoop Workflow v3 (condensed)

The full rules live in the installed rules file (`AGENTS.md`) when your harness loads one. This is the same workflow in one page, for harnesses that do not: Oh My Pi, Gemini CLI, Claude Code and others. The user's explicit instruction and the project's own rules always win.

Tool names: OpenCode `graphyloop_<tool>`; Claude Code and DeepSeek Harness `mcp__graphyloop__<tool>` (the Claude Code plugin adds its own prefix, see `/mcp`); Codex, Cursor, Oh My Pi, Gemini CLI bare `<tool>`. Below: bare names. If one is missing, run `npx graphyloop doctor`.

## The 12 rules

1. **Recall first, record last.** `memory_search` with 2-4 keywords before planning; use hits, stay silent on a miss, never invent one. At the end `memory_store` ONE dense line (`decision` / `lesson` / `pattern` / `event`) with the *why* and the commit or PR it landed in. Never store credentials. See `swarm-memory`.
2. **Goal and proof up front.** State the end state, the check that proves it and the invariant it must not break. Iterate until the check passes; never weaken a test or assertion to get there.
3. **Inline first.** Up to 8 known files, any mix of layers, when the code is known or one batched read pass maps it: read, edit, check. No dispatch. A lane costs the driver minutes of waiting, an inline edit seconds.
4. **Fan out only for real parallelism.** 2+ independent slices of about 5+ minutes each: 1-3 lanes (max 4), disjoint files, ONE parallel call. The driver keeps the largest or most coupled slice and builds it while lanes run. Never fan out a tightly coupled change.
5. **Context pack.** One batched read pass writes `ctx-<slug>.md`: per lane `path:line`, the current code excerpt, the pattern to copy. The driver writes it when one pass maps the code.
6. **Freeze the contract.** Same turn as dispatch, write `contract-<slug>.md` (entities and columns, routes with request/response JSON and error codes, props, the test scenarios that define done, env keys). It is the only cross-lane dependency; if wrong, fix the contract, never drift.
7. **Turn economy.** Lanes batch reads, first edit by turn 5, done in about 20 turns; 40+ means mis-sized. End every BUILDER brief with:
   `Read the ctx pack and contract first, in ONE turn. Batch 2+ reads/searches into one parallel call; read with line ranges; never re-read a file; first edit by turn 5; do not run project-wide lint/test/build — the driver does.`
   Wave-0 (writes ctx + contract): `Batch 2+ reads/searches into one parallel call; read with line ranges; never re-read a file; write the ctx pack and contract before anything else.` Integration/verify/deploy lanes: `Read the ctx pack and contract first, in ONE turn. Batch 2+ reads/searches into one parallel call; read with line ranges; never re-read a file.`
8. **Isolate what collides.** A lane that runs a server, database, browser or long suite gets its own worktree, port and database name. Serialize edits to one file.
9. **No polling; schedule follow-ups.** Background jobs or the tool's own blocking command (`vercel inspect --wait`, `gh run watch`). Never sleep-loop. Later checks go to the harness scheduler (`/loop`, `/schedule`) or into the report as a next action.
10. **Proof, not claims.** Failing-before/passing-after test; real-browser screenshot for UI; before/after numbers on the same machine for performance; the live URL for a deploy; the rendered file for an artifact. NOT evidence: "tests pass" alone, typecheck alone, "should work", a mocked run. Run lint/typecheck/test/build once, centrally, after lanes land.
11. **Review by blast radius.** Reviewer and security agents only for migrations, auth/RBAC, payments, uploads, secrets, tenant boundaries, public API contracts and the project's named central files.
12. **Evidence-first report:** **Changed** / **Files** / **Verified** (command plus verbatim output) / **Skills** / **Blocked**. Never claim a check that did not run.

Five gates: Classify (2-4) → Discover (1, 5, 6) → Implement (4, 7-9) → Verify (10, 11) → Report (1, 12). Artifact sets (posters, decks, PDFs, video): freeze `brief-<slug>.md`, hero piece first, one lane per artifact.

Keep the rules honest: short always-loaded rules, procedures in on-demand skills; keep a rule only if a with/without run shows it helps; let compaction work and persist what must survive it in files (ctx pack, contract, memory).

## Multi-layer features

Call `plan_feature` with the request as `goal`. It returns waves, tasks, per-lane `owns` globs, `acceptance` checks and `dependsOn`; `shape: no-fanout` means inline. Wave 0 writes the ctx pack and contract (the driver itself when one read pass maps the code); wave 1 builders in one call, the driver keeping the most coupled lane; wave 2 integration (the only wave that touches two lanes: real calls for mocks, local migrations dry-run first, `env_sync`, boot, happy path); wave 3 verify in one call; wave 4 deploy only when asked, with approval and a rollback plan. Dispatch only `dispatchNow` ids from `task_distribute`; `task_record` each result. See `graphyloop-waves`.

Keep briefs to about 2 KB: role, goal, paths, symbols, pattern file, acceptance check. Never paste file bodies.

## Always

- **Decide reversible ambiguity yourself** (`council` or parallel review), report the decision. Ask only for irreversible or destructive actions or facts only the user has.
- **Secrets:** never ask for a key in chat, never print a value. Name the key, store with `secrets_set`, materialize with `env_sync`, check `secrets_status`. Run `preflight` (`target=db|deploy|all`) before database or deploy work. Migrations: dry-run and show SQL before apply; hosted-database applies and production deploys need explicit approval and a rollback note.
- **Shell:** never leave a server or watcher attached to the tool's output; background it or start, probe and stop in one bounded command. Explicit timeouts on anything that can block, no interactive commands, stop after the same command fails twice. Probe `127.0.0.1`, not `localhost`, on Windows. (Windows + OpenCode: the `server-guard` plugin rewrites inline dev-server commands for you.)
- **Currency:** check the manifest and current docs before writing library code.
- **Skills:** load one primary skill per task and only what it needs; an uninstalled skill is one line, then proceed. `skills_status` lists what is on this machine.

## Proof per lane

Frontend: build/typecheck plus a browser smoke of the touched flow with a screenshot. Backend: typecheck, tests on touched routes, input validation. Data: dry-run and rollback note before apply. Security-sensitive: review is mandatory; try to refute a high-severity finding before rework. Performance: measure before and after on the same machine. One targeted repair on failure; a second failure stops and reports evidence.
