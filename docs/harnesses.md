# Harness guide

GraphyLoop wires **7 harnesses**. `npx graphyloop` detects the ones you have and wires each; on a fresh machine it wires all seven. Target one or more with `--harness claude,omp`. Back to the [README](../README.md) · [reference](reference.md).

| Harness | Name | Detected when | MCP entry written to | Agents | Commands | Skills | Workflow rules |
|---|---|---|---|---|---|---|---|
| **OpenCode** | `opencode` | `~/.config/opencode/` | `opencode.json` plugin entries (`graphyloop_*` tools) + server-guard | `~/.config/opencode/agents/` — 26 files | 15 `/chadi-*` | `~/.config/opencode/skills/` | `AGENTS.md` |
| **Claude Code** | `claude` | `~/.claude.json` or `~/.claude/` | `~/.claude.json` → `mcpServers.graphyloop` | `~/.claude/agents/` — 26 files | 15 `/chadi-*` | `~/.claude/skills/` | `~/.claude/AGENTS.md` |
| **Codex** | `codex` | `~/.codex/` | `~/.codex/config.toml` → `[mcp_servers.graphyloop]` | 15 prompts | 15 prompts (`/prompts:chadi-init`) | — | `AGENTS.md` |
| **Cursor / Windsurf** | `cursor` | `~/.cursor/` | `~/.cursor/mcp.json` → `mcpServers.graphyloop` | — | — | — | `~/.cursor/rules/AGENTS.md` |
| **DeepSeek Harness** | `dsh` | `~/.dsh/` or `$DSH_HOME` | `~/.dsh/cordis.patch.yml` row `id: graphyloop-mcp` | 26 role prompts + `graphyloop-squad` skill | — (dsh commands are plugins) | `~/.dsh/skills/` | `~/.dsh/AGENTS.md` |
| **Oh My Pi** | `omp` | `~/.omp/` | `~/.omp/agent/mcp.json` → `mcpServers.graphyloop` (other keys, incl. `disabledServers`, kept) | `~/.omp/agent/agents/` — 26 squad files (`name` + `description` only, so they inherit your model) | — (omp has no file commands) | `~/.omp/agent/skills/` | `~/.omp/agent/AGENTS.md` **only when absent** |
| **Gemini CLI** | `gemini` | `~/.gemini/` | `~/.gemini/settings.json` → `mcpServers.graphyloop` | — | `~/.gemini/commands/<name>.toml` (`/chadi-init` …) | `~/.gemini/skills/` | `~/.gemini/GEMINI.md` **only when absent** |

Oh My Pi and Gemini CLI never lose a rules file you already wrote: if `~/.omp/agent/AGENTS.md` or `~/.gemini/GEMINI.md` exists and differs, GraphyLoop keeps it — even with `--force` — and the workflow loads on demand from the bundled `graphyloop-workflow` skill instead.

Uninstall removes only what GraphyLoop wrote: the MCP key (when it is GraphyLoop-shaped) and agents, commands, skills and rules files that are byte-identical to the shipped copies.

## Next steps after install

| Harness | Start the workflow |
|---|---|
| OpenCode, Claude Code | restart, open a real project, ask for `/chadi-init` |
| Codex | `/prompts:chadi-init` |
| Gemini CLI | `/chadi-init` |
| Oh My Pi, Cursor, Windsurf | ask: "run the graphyloop workflow init" |
| DeepSeek Harness | ask the agent to load the `graphyloop-squad` skill |

## Verify a harness

```bash
npx graphyloop doctor          # one row per harness: present, wired, and a fix: line when it is not
claude mcp list                # graphyloop ... √ Connected
codex mcp list                 # graphyloop ... enabled
```

`doctor` ends with `GRAPH_LOOP_DOCTOR_OK` when every present harness is wired and the core is up to date, otherwise `GRAPH_LOOP_DOCTOR_ISSUES <n>`.

## DeepSeek Harness (`dsh`) notes

In `dsh` the tools are namespaced by the MCP bridge, so they are called
`mcp__graphyloop__plan_feature`, `mcp__graphyloop__memory_search`, and so on. dsh
has no agent files and no file-based slash commands — agents are cordis
compositions, commands are plugins — so the squad installs as a prompt library
(`~/.dsh/graphyloop/{agents,commands}`) and the `graphyloop-squad` skill teaches
the conductor to delegate with dsh's own `subagent` tool.

dsh is also the one harness where the project is **not** the server's working
directory: it is a long-lived host launched from wherever you typed `dsh`, and the
project is the workspace you pick in the UI. So the patch row states
`GRAPHYLOOP_DSH_HOME`, and the server reads the open workspace from dsh's own
store on every tool call — switch workspace and the next call lands in the new
project, no restart. Pin one project instead by adding `GRAPHYLOOP_PROJECT_ROOT`
to the same `env:` block.
