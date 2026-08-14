#!/usr/bin/env node
// graphyloop - npx CLI entry point (B6).
//
// Zero-dependency ESM (Node >= 20). Delegates to lib/cli.mjs run().
//
// Usage:
//   graphyloop install [--harness opencode|claude|codex|cursor|all] [flags]
//   graphyloop doctor | status [--json] | uninstall [--harness ...] | mcp
//   graphyloop --version | --help

import { run } from '../lib/cli.mjs';

const exitCode = await run(process.argv.slice(2));
process.exitCode = exitCode;
