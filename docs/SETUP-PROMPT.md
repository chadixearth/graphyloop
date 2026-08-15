# GraphyLoop Setup Prompt

Copy everything between the markers below and paste it as one message into any AI
coding harness (OpenCode, Claude Code, Codex, Cursor, Windsurf, ...). The AI will
install, verify, and report back.

```
You are setting up GraphyLoop (github.com/chadixearth/graphyloop, npm package `graphyloop`) — a one-command agentic workflow kit for AI harnesses: graphyloop swarm + memory engine, a 25-agent squad, a 5-gate delivery workflow, and an MCP server that works in any harness.

Goal: install it for THIS machine's harness(es), verify the install actually works, and report. Do NOT edit any config file by hand — run only the installer. Do NOT run npm publish, npm login, or anything unrelated.

Steps:
1. Prerequisites:
   - Run `node --version` — must be 20 or newer. If older, tell the user to install Node.js 20+ and stop there.
   - Detect which harnesses exist on this machine (check for any of): ~/.config/opencode/  (OpenCode), ~/.claude.json or ~/.claude/  (Claude Code), ~/.codex/  (Codex), ~/.cursor/  (Cursor). On Windows, ~ = %USERPROFILE%.
2. Install:
   - Any harness detected:  npx --yes graphyloop install
   - None detected (fresh machine):  npx --yes graphyloop install --harness all
   - If npx asks "Ok to proceed?", answer yes. If npx is missing, stop and tell the user to install Node.js 20+ (npx ships with npm).
3. Verify — every applicable check must pass:
   - `npx --yes graphyloop doctor` prints the harness table.
   - Core engine files exist: ~/.graphyloop/graphyloop/cli.mjs , ~/.graphyloop/mcp-server.mjs , ~/.graphyloop/lib/mcp.mjs , ~/.graphyloop/lib/engine.mjs .
   - OpenCode (if present): ~/.config/opencode/opencode.json contains a plugin entry "./plugins/graphyloop/plugin.js", and ~/.config/opencode/agents/ contains 26 .md files.
   - Claude Code (if present): ~/.claude.json has an mcpServers.graphyloop entry, and ~/.claude/agents/ is populated.
   - Codex (if present): ~/.codex/config.toml contains a [mcp_servers.graphyloop] section.
   - Cursor (if present): ~/.cursor/mcp.json has a "graphyloop" entry.
   - If any check fails: re-run the install with --force (automatic backups) and re-verify. Still failing? Report the exact error and stop.
4. Wrap up: tell the user to RESTART their harness (close/reopen the terminal or editor), open a real project (not their home directory), and ask the agent to run /chadi-init. Give a one-line summary of what was installed.

Do not ask permission for reversible steps — proceed. Stop only for: Node < 20, an install failure, or a prompt you cannot answer.
```
