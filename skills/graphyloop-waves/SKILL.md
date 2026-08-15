---
name: graphyloop-waves
description: Use this skill when a request spans more than one layer (database + backend + frontend, or a feature plus a data pipeline). Turns the request into contract-first parallel waves with enforced dependencies, exclusive file ownership and per-lane acceptance checks, using the graphyloop planner and swarm.
---

# Wave dispatch (contract-first fan-out)

Multi-layer work fails two ways: built serially it takes the sum of its lanes, and
fanned out without a frozen contract it produces three incompatible versions of
the same table. This skill is the third option.

## When to activate

- The request names two or more of: schema/data, API/server, UI/pages, import/export pipeline.
- Words like "system", "app", "platform", "management", "dashboard + data".
- NOT for a one-file change, a rename, or a single endpoint — fan-out only adds integration cost there.

## The pipeline

```
Wave 0  contract      ONE agent, alone. Nothing else starts until it lands.
Wave 1  builders      data ∥ backend ∥ frontend ∥ tests   (ONE tool-call block)
Wave 2  integration   drop mocks, real calls, env wiring, boot the happy path
Wave 3  verify        test ∥ typecheck/lint ∥ security ∥ performance ∥ review
Wave 4  deploy        preflight → preview → GATED production
```

Wall clock = Wave 0 + slowest builder + integration + slowest verifier. Never the sum.

## Procedure

1. **Plan, do not improvise.** Call `plan_feature` / `graphyloop_plan_feature`
   with the user's request verbatim as `goal`. It returns waves, tasks, per-lane
   `owns` globs, `acceptance` checks and `dependsOn`.
   - `shape: no-fanout` → stop. This is inline or single-builder work.
2. **Freeze the contract (Wave 0).** One agent writes
   `.opencode/chadi/contract-<slug>.md`:
   - entities: columns, types, nullability, foreign keys, indexes
   - every route: method, path, request shape, response JSON, error codes
   - components/pages: props and route paths
   - test scenarios that define done (happy path + 2 edge cases per entity)
   - the env keys the feature needs
   No implementation code in this wave. If the contract is wrong later, stop and
   fix the contract — never let a lane drift from it silently.
3. **Dispatch by dependency, not by optimism.** Pass `plan.tasks` to
   `task_distribute`. Dispatch ONLY the ids in `dispatchNow`. `blocked` entries
   name what they are waiting on.
4. **Fan out a whole wave in ONE tool-call block.** Every prompt carries: the
   contract path, that lane's exclusive file list, its acceptance check.
5. **Record every result.** `task_record` returns what the result unblocked —
   that is the trigger for the next wave. After a restart or compaction,
   `swarm_state` reports `readyTasks`, `blockedTasks` and per-wave counts.
6. **Integration is one wave, not a habit.** Only Wave 2 may touch two lanes at
   once. Everywhere else, file ownership is exclusive.

## Rules that keep it honest

- The database lane runs *alongside* backend and frontend, not before them — the
  schema was already decided in Wave 0. "DB first, then the rest" is the serial
  trap this skill exists to avoid.
- Tests are written in Wave 1 from the contract's scenarios. A test authored
  after the code asserts whatever the code happens to do.
- Frontend builds against mocks shaped like the contracted responses, with the
  fetch layer in ONE module so the integration swap is a single file.
- Two edit-capable agents never own the same file in the same wave. Assign the
  ownership table before dispatch.
- Local build/test agents cap at 4 concurrent (RAM-bound); read-only verifiers
  up to 8; browser max 2.
- A wave is not done because its agents returned. It is done when its acceptance
  check has been run and its output quoted.

## Reporting

Report the wave table, then per lane: files touched, acceptance check run, and
the decisive output line. Store one memory entry with the shape and wall time
(`PLAN shape=... lanes=... wall=...`) so the next same-shape request can be
compared instead of re-argued.
