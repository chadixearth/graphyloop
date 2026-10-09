# Contributing

Thanks for looking. This started as a personal setup and is shared as-is —
issues and pull requests are welcome.

## Ground rules

**Zero runtime dependencies.** The package installs with `npx` on a fresh
machine and must keep working with nothing but Node ≥ 20. No npm packages at
runtime, no shell scripts, no build step. Dev-time tooling is fine if it is not
needed to run or install the thing.

**Never destroy a user's config.** Every installer writes a timestamped backup
before touching a file, adds missing keys only, and never overwrites an existing
value. Uninstall removes only files that are byte-identical to what was shipped.
If a change could clobber something a user wrote by hand, it is wrong.

**Evidence before claims.** A fix without a test that fails before it is not
finished. When you fix a bug, revert the fix and confirm the new test actually
fails — several tests here were caught being vacuous that way.

## Getting set up

```bash
git clone https://github.com/chadixearth/graphyloop.git
cd graphyloop
git config core.hooksPath hooks            # enables the repo's git hooks
npm test                                   # the full suite: no network, no deps
node bin/graphyloop.mjs install --home /tmp/sandbox --harness all --force
```

`core.hooksPath hooks` turns on the `pre-push` hook: it runs the suite and
refuses to push if it fails. It exists because a commit with a failing test once reached
`main` — the suite had been piped into another command, so the shell reported
*that* command's exit code and a `&&` gate passed vacuously. Never pipe the
runner when you are gating on it; the hook runs it unpiped for exactly this
reason. `git push --no-verify` bypasses it when you genuinely mean to.

Always install into a `--home` sandbox while developing. Installing into your
real home directory mid-change is how you end up debugging your own editor.

## Layout

| Path | What it is |
|---|---|
| `lib/engine.mjs` | Swarm + memory rules. The single source of truth; both entry points call it. |
| `adapter/cli.mjs` | Thin CLI wrapper — argv in, one JSON object out. |
| `lib/mcp.mjs` | MCP stdio server. Calls the engine in-process; spawns the CLI only when `GRAPHYLOOP_CLI` pins a build. |
| `lib/install-*.mjs` | One installer per harness (`opencode`, `claude`, `codex`, `cursor`, `dsh`, `omp`, `gemini`). Each exports `install(ctx)` and returns a report. |
| `plugin/graphyloop/plugin.js` | OpenCode plugin (`graphyloop_*` tools). |
| `agents/`, `workflow/`, `config/`, `templates/` | The squad, the workflow v2 rules, and per-harness files that get installed. |
| `assets/` | Logo and diagrams. Generated SVG, committed; not published to npm. |

The installed tree mirrors the repo's relative shape on purpose:

```
~/.graphyloop/lib/engine.mjs
~/.graphyloop/lib/mcp.mjs         -> ./engine.mjs
~/.graphyloop/graphyloop/cli.mjs  -> ../lib/engine.mjs
```

so both entry points resolve the engine with one import specifier and no path
juggling. If you move a file, keep that shape.

## Tests

```bash
npm test                       # everything
node --test test/adapter.test.mjs  # or one file
```

- `test/adapter.test.mjs` — engine state: durability, migration, concurrency, validation.
- `test/mcp.test.mjs` — the real MCP server over JSON-RPC, in-process and spawned.
- `test/plugin.test.mjs` — the OpenCode plugin, against a stubbed `@opencode-ai/plugin`.
- `test/install.test.mjs` — installers for every harness (OpenCode, Claude Code, Codex, Cursor, DeepSeek Harness, Oh My Pi, Gemini CLI) against a sandbox HOME with pre-seeded user config.

Adding a harness: add its name to `HARNESS_NAMES` in `lib/cli.mjs`, write `lib/install-<name>.mjs`, teach `lib/detect.mjs` to find it, add uninstall coverage, then list it in `README.md`, `docs/harnesses.md`, `docs/SETUP-PROMPT.md`, `docs/index.html` and `llms.txt`.

No test may touch the network or your real home directory.

## Pull requests

1. Keep the change small and say what problem it solves.
2. Add a test that fails without it.
3. Run `npm test` and paste the result.
4. Update `CHANGELOG.md` under *unreleased*.

CI runs Windows, macOS and Linux × Node 20, 22 and 24, plus a real install, an
MCP handshake and a tarball-contents check. All of it has to pass.

## Releasing

Maintainers only:

```bash
npm test
npm version minor          # or patch — commits and creates the v* tag
git push --follow-tags
```

The publish workflow (`publish.yml`) re-runs the tests, rejects a tag that
disagrees with `package.json`, and publishes through npm trusted publishing
(OIDC, with provenance). One-time setup on npmjs.com: the package's
*Settings* → *Trusted publishing* → *GitHub Actions*, repository
`chadixearth/graphyloop`, workflow `publish.yml`. An `NPM_TOKEN` secret is an
optional fallback. *Run workflow* (`workflow_dispatch`) takes an `otp` input
and `dry_run=true` to validate the pipeline without shipping.

When writing release smoke tests: a bare unknown flag with no command
(`graphyloop --doctor`) exits 1 and writes nothing, and `install` has no
dry-run (`install --check` / `--dry-run` exit 1) — preview with
`graphyloop doctor`.
