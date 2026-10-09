# GraphyLoop Setup Prompt

Copy everything inside the code block below and paste it as one message into any AI
coding harness (OpenCode, Claude Code, Codex, Cursor, Windsurf, DeepSeek Harness,
Oh My Pi, Gemini CLI, ...). The AI will install, verify, and report back.

```
You are setting up GraphyLoop (github.com/chadixearth/graphyloop, npm package `graphyloop`) — a one-command agentic workflow kit for AI coding agents: a 25-agent squad, parallel wave planning, persistent memory, a harness-neutral workflow and an MCP server that works in any harness. Zero dependencies.

Goal: install it for THIS machine's harness(es), verify the install actually works, and report. Do NOT edit any config file by hand — run only the installer. Do NOT run npm publish, npm login, or anything unrelated.

Steps:
1. Prerequisites:
   - Run `node --version` — must be 20 or newer. If older, tell the user to install Node.js 20+ and stop there.
   - Detect which harnesses exist on this machine (check for any of): ~/.config/opencode/  (OpenCode), ~/.claude.json or ~/.claude/  (Claude Code), ~/.codex/  (Codex), ~/.cursor/  (Cursor / Windsurf), ~/.dsh/ or $DSH_HOME  (DeepSeek Harness / `dsh`), ~/.omp/  (Oh My Pi / `omp`), ~/.gemini/  (Gemini CLI). On Windows, ~ = %USERPROFILE%.
2. Install:
   - Run:  npx --yes graphyloop
     (a bare `graphyloop` is the install command: it wires every detected harness, or all 7 on a fresh machine.)
   - To target specific harnesses:  npx --yes graphyloop --harness claude,omp   (names: opencode, claude, codex, cursor, dsh, omp, gemini)
   - If npx asks "Ok to proceed?", answer yes. If npx is missing, stop and tell the user to install Node.js 20+ (npx ships with npm).
3. Verify — every applicable check must pass:
   - `npx --yes graphyloop doctor` prints one row per harness (present / wired) and its LAST line must be GRAPH_LOOP_DOCTOR_OK. If it prints GRAPH_LOOP_DOCTOR_ISSUES <n>, run the `fix:` command it shows for each unwired row, then run doctor again.
   - Core engine files exist: ~/.graphyloop/graphyloop/cli.mjs , ~/.graphyloop/mcp-server.mjs , ~/.graphyloop/lib/mcp.mjs , ~/.graphyloop/lib/engine.mjs .
   - OpenCode (if present): ~/.config/opencode/opencode.json contains plugin entries "./plugins/graphyloop/plugin.js" and "./plugins/server-guard/plugin.js", and ~/.config/opencode/agents/ contains 26 .md files.
   - Claude Code (if present): ~/.claude.json has an mcpServers.graphyloop entry, and ~/.claude/agents/ is populated.
   - Codex (if present): ~/.codex/config.toml contains a [mcp_servers.graphyloop] section.
   - Cursor (if present): ~/.cursor/mcp.json has a "graphyloop" entry.
   - DeepSeek Harness (if present): ~/.dsh/cordis.patch.yml contains a row `id: graphyloop-mcp` naming '@deepseek-ai/dsh-mcp-client', ~/.dsh/AGENTS.md exists, and ~/.dsh/skills/ holds graphyloop-squad. Optional deeper check: `dsh --profile headless --dump-config` prints that row. In dsh the tools are namespaced — call them as mcp__graphyloop__<name> (e.g. mcp__graphyloop__swarm_state).
   - Oh My Pi (if present): ~/.omp/agent/mcp.json has mcpServers.graphyloop, and ~/.omp/agent/agents/ holds the squad .md files. An existing ~/.omp/agent/AGENTS.md is intentionally kept — the workflow then loads from the bundled skill graphyloop-workflow.
   - Gemini CLI (if present): ~/.gemini/settings.json has mcpServers.graphyloop, ~/.gemini/commands/chadi-init.toml exists, and ~/.gemini/skills/graphyloop-workflow/ exists. An existing ~/.gemini/GEMINI.md is intentionally kept.
   - If any check fails: re-run the install with --force (automatic backups) and re-verify. Still failing? Report the exact error and stop.
4. Wrap up: tell the user to RESTART their harness (close/reopen the terminal or editor), open a real project (not their home directory), and start the workflow: ask for /chadi-init (OpenCode, Claude Code, Gemini CLI), /prompts:chadi-init (Codex), or "run the graphyloop workflow init" (Oh My Pi, Cursor, Windsurf). In the DeepSeek Harness there are no slash commands: ask the agent to load the `graphyloop-squad` skill instead. Give a one-line summary of what was installed.

Do not ask permission for reversible steps — proceed. Stop only for: Node < 20, an install failure, or a prompt you cannot answer.
```
