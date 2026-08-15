---
name: swarm-memory
description: Use this skill at the start and end of every non-trivial task to recall and record durable project knowledge through graphyloop memory - what to search before planning, what is worth storing, what must never be stored, and how to correct a wrong memory.
---

# Swarm memory

Memory is only useful if it is read before deciding and written after learning.
A store that is written but never searched is a diary; one that is searched but
never corrected repeats its mistakes forever.

## When to activate

- START of any non-trivial task, before planning.
- END of any task that produced a decision, a gotcha, or a reusable approach.
- When a past decision is being revisited ("why is it done this way?").

## Procedure

1. **Recall first.** `memory_search` with 2-4 concrete keywords from the task
   (component names, error text, feature nouns). Optional `type` filter:
   `decision`, `pattern`, `lesson`, `event`, `task`.
   - Results exist → use them, and say which memory informed the plan.
   - Nothing → say nothing and proceed. Never invent a recalled memory.
2. **Store at the end, one entry.** `memory_store` with the right type:
   - `decision` — a choice made and why (the alternative rejected matters more than the choice).
   - `lesson` — a gotcha hit and how it was resolved. This is the highest-value type.
   - `pattern` — a reusable approach with the file that demonstrates it.
   - `event` — something that happened (a deploy, a migration, an incident).
3. **Correct, do not accumulate.** A wrong or outdated memory gets `memory_forget`
   with its id, then a corrected entry. Leaving both means the next session gets
   contradictory advice with no way to pick.

## What makes an entry worth keeping

Good: one dense line, searchable nouns, an anchor.
```
decision: state lives in <project>/.graphyloop/state.json (was .opencode/graphyloop) — three of four harnesses are not opencode; migration in lib/engine.mjs
lesson: node --test hangs when a failing assert skips stdin.end() on a spawned server — the child holds the stdio pipes; close it in a finally
pattern: file-to-file credential sync (env_sync) keeps values out of the model context — see lib/secrets.mjs
```

Bad, and why:
- `"fixed the bug"` — unsearchable, no anchor, no cause.
- A pasted 200-line diff — the repo already has it; memory is for the *why*.
- `"user prefers dark mode"` when it was said once about one screen — over-generalized preferences become wrong rules.

## Never store

- Credentials, tokens, connection strings, or anything from a `.env` file — not
  even partially. Store the key NAME if it matters.
- Personal data about the user or third parties beyond what the work needs.
- Speculation stated as fact. If it was not verified, either verify it or label it.

## Rules

- One entry per task, not one per file touched. A flooded store ranks badly.
- Write the entry yourself at the end; do not delegate it to a subagent whose
  context is narrower than the task.
- Memory survives `shutdown` and restarts. State does not — re-read
  `swarm_state` after a restart instead of trusting recall for live task status.
- Blocked roots (home directory, harness config dirs, system dirs) refuse memory
  writes by design. Accept the skip; do not retry in another directory.
