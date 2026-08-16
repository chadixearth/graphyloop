---
name: graphyloop-squad
description: Use this skill in the DeepSeek Harness whenever a task is worth more than one edit - anything you would plan, split across roles, verify, or remember. It maps the graphyloop 5-gate workflow onto dsh's own primitives: the mcp__graphyloop__* tools for swarm, memory and wave planning, and the subagent tool for delegation with a squad role prompt.
---

# GraphyLoop squad in dsh

dsh gives you delegation (`subagent`), skills, goals, todos and a real tool
sandbox. graphyloop adds the parts dsh deliberately leaves to composition:
a persistent memory that survives the session, a swarm ledger with wave
dependencies, and a squad of role prompts. This skill is the bridge — without
it the tools are present but nothing tells you the workflow they belong to.

## When to activate

- Any request touching more than one file or more than one layer.
- Before planning anything: recall first (`mcp__graphyloop__memory_search`).
- Whenever you are about to delegate: pick a role prompt instead of improvising.
- After a decision, a fix, or a surprise: record it (`mcp__graphyloop__memory_store`).

Skip it for a one-line answer or a single obvious edit — say so and just do it.

## Tool names in this harness

The MCP bridge namespaces every tool, so the names are prefixed here and
nowhere else in the graphyloop docs:

| Purpose | Tool |
|---|---|
| Recall before planning | `mcp__graphyloop__memory_search` |
| Record a decision / lesson / pattern | `mcp__graphyloop__memory_store` |
| Correct a wrong memory | `mcp__graphyloop__memory_forget` |
| Multi-layer feature -> wave plan | `mcp__graphyloop__plan_feature` |
| Dispatch a wave (honours `dependsOn`) | `mcp__graphyloop__task_distribute` |
| Close the loop on a task | `mcp__graphyloop__task_record` |
| Swarm + memory state | `mcp__graphyloop__swarm_state` |
| Roster | `mcp__graphyloop__agent_spawn` / `mcp__graphyloop__agent_list` |
| Credentials (masked, never a value) | `mcp__graphyloop__secrets_status` / `mcp__graphyloop__secrets_set` / `mcp__graphyloop__env_sync` |
| Database / deploy readiness | `mcp__graphyloop__preflight` |
| Which skills exist on this machine | `mcp__graphyloop__skills_status` |

If a call answers `graphyloop CLI not found`, the core is missing: tell the user
to run `npx graphyloop install` and stop guessing.

## The squad, as dsh sees it

dsh has no agent files and no file-based slash commands: agents are compositions
and commands are plugins. So the squad ships as prompt text you pass to dsh's own
delegation tool.

```
~/.dsh/graphyloop/agents/<role>.md      role prompts (the squad)
~/.dsh/graphyloop/commands/chadi-*.md   the 15 workflow bodies
~/.dsh/AGENTS.md                        the 5-gate rules, loaded automatically
```

To delegate:

1. Read `~/.dsh/graphyloop/agents/<role>.md`. Its YAML header describes when the
   role applies; the body is the role prompt.
2. Call `subagent` with that body plus the concrete task, the files the child owns
   exclusively, and the acceptance check it must satisfy.
3. Start independent delegations in one message (background by default) and keep
   working; settle each with `mcp__graphyloop__task_record`.

Pick by job, not by habit: `chadi-explorer` / `graphcrew-investigator` to map
unknown code · `chadi-backend`, `chadi-frontend`, `graphcrew-builder` to build ·
`chadi-integrator` to join parallel lanes · `chadi-test`, `chadi-quality`,
`chadi-reviewer`, `chadi-security` to verify · `chadi-architect`, `chadi-think`,
`chadi-council` to decide · `chadi-data`, `chadi-devops` for schema and shipping ·
`chadi-docs`, `chadi-memory`, `chadi-performance` for the rest. `agent-chadi` is
the conductor prompt — that is you, right now.

The 15 `chadi-*` files under `commands/` are the workflows those slash commands
run elsewhere. In dsh, read the one that matches the request ("audit this repo" ->
`chadi-audit.md`, "ship it" -> `chadi-deploy.md`) and follow it. Do not invent a
`/chadi-*` command: this harness has none, and pretending otherwise wastes a turn.

## Multi-layer work

Do not fan out before the contract is frozen. `mcp__graphyloop__plan_feature`
returns wave 0 (one agent freezes schema, API, props and test scenarios), then
wave 1 builders in parallel, wave 2 integration, wave 3 verifiers in parallel,
wave 4 gated deploy. Hand that `tasks` array straight to
`mcp__graphyloop__task_distribute`, which answers `dispatchNow` for what may run
and `blocked` with `waitingOn` for what may not. Respect it — a lane dispatched
early is the drift you will spend the integration wave undoing. The
`graphyloop-waves` skill has the full protocol.

## Report honestly

Evidence, not narration: the command you ran, its output, what it proves. dsh's
own `goal` tool holds the completion contract; graphyloop's memory holds why you
made each choice. A skill you do not have is stated in one line — check with
`mcp__graphyloop__skills_status` rather than claiming one you never loaded.
