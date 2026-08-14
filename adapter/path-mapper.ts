/**
 * Path Mapper — translates .claude/ ↔ .opencode/ and env var shims
 * 
 * GraphyLoop core expects .claude/ paths and CLAUDE_* env vars.
 * This adapter provides transparent translation so graphyloop's core
 * can run unchanged while operating on OpenCode's directory structure.
 */

import { homedir } from 'os'
import { join, resolve } from 'path'
import fs from 'fs'

// ============================================================================
// Path Mappings
// ============================================================================

export const PATH_MAP: Record<string, string> = {
  // Project-level paths
  '.claude/':          '.opencode/',
  '.claude-plugin/':   '.opencode/graphyloop/plugins/',
  'CLAUDE.md':         'AGENTS.md',
  'CLAUDE.local.md':   'AGENTS.local.md',
  
  // User-global paths
  '.claude/CLAUDE.md': '.config/opencode/AGENTS.md',
  '.claude/settings.json': '.config/opencode/settings.json',
  '.claude/agents/':   '.config/opencode/agents/',
  '.claude/commands/': '.config/opencode/commands/',
  '.claude/skills/':   '.config/opencode/skills/',
  '.claude/helpers/':  '.config/opencode/helpers/',
  '.claude/plugins/':  '.config/opencode/plugins/',
  
  // GraphyLoop-specific
  '.claude-flow/':     '.opencode/graphyloop/',
}

/**
 * Translate a Claude Code path to OpenCode path
 */
export function claudeToOpeCode(claudePath: string): string {
  let result = claudePath
  
  // Project-relative paths (start with .claude or CLAUDE.md)
  for (const [from, to] of Object.entries(PATH_MAP)) {
    if (result.startsWith(from)) {
      result = result.replace(from, to)
      break
    }
  }
  
  // ~/.claude/ → ~/.config/opencode/
  const homeClaude = join(homedir(), '.claude')
  const homeOpenCode = join(homedir(), '.config', 'opencode')
  if (result.startsWith(homeClaude)) {
    result = result.replace(homeClaude, homeOpenCode)
  }
  
  return result
}

/**
 * Translate OpenCode path back to what graphyloop expects
 */
export function openCodeToClaude(openCodePath: string): string {
  let result = openCodePath
  
  // Reverse the mapping
  const reverse: Record<string, string> = {}
  for (const [from, to] of Object.entries(PATH_MAP)) {
    reverse[to] = from
  }
  
  for (const [from, to] of Object.entries(reverse)) {
    if (result.startsWith(from)) {
      result = result.replace(from, to)
      break
    }
  }
  
  const homeOpenCode = join(homedir(), '.config', 'opencode')
  const homeClaude = join(homedir(), '.claude')
  if (result.startsWith(homeOpenCode)) {
    result = result.replace(homeOpenCode, homeClaude)
  }
  
  return result
}

// ============================================================================
// Env Var Shim
// ============================================================================

/**
 * Shim CLAUDE_* env vars to OpenCode equivalents.
 * Call this at adapter startup so graphyloop core code that reads
 * CLAUDE_PROJECT_DIR etc. gets correct values.
 */
export function shimEnvVars(projectRoot: string): void {
  // Only set if not already present (respect user overrides)
  if (!process.env.CLAUDE_PROJECT_DIR) {
    process.env.CLAUDE_PROJECT_DIR = projectRoot
  }
  if (!process.env.CLAUDE_PLUGIN_ROOT) {
    process.env.CLAUDE_PLUGIN_ROOT = join(projectRoot, '.opencode', 'graphyloop', 'plugins')
  }
  
  // Map CLAUDE_FLOW_* to OPENDODE_FLOW_* equivalents
  const flowEnvMap: Record<string, string> = {
    'CLAUDE_FLOW_V3_ENABLED':     'OPENDODE_FLOW_ENABLED',
    'CLAUDE_FLOW_HOOKS_ENABLED':  'OPENDODE_FLOW_HOOKS',
    'CLAUDE_FLOW_MEMORY_BACKEND': 'OPENDODE_FLOW_MEMORY',
    'CLAUDE_FLOW_LOG_LEVEL':      'OPENDODE_FLOW_LOG',
  }
  
  for (const [claudeKey, openCodeKey] of Object.entries(flowEnvMap)) {
    if (!process.env[claudeKey] && process.env[openCodeKey]) {
      process.env[claudeKey] = process.env[openCodeKey]
    }
  }
}

/**
 * Get the project root directory.
 * Tries env vars, then walks up from cwd looking for .opencode/
 */
export function resolveProjectRoot(): string {
  // Check explicit env vars
  const candidates = [
    process.env.CLAUDE_PROJECT_DIR,
    process.env.OPENDODE_PROJECT_DIR,
    process.env.PROJECT_DIR,
  ]
  for (const c of candidates) {
    if (c) return resolve(c)
  }
  
  // Walk up from cwd
  let dir = process.cwd()
  const root = resolve('/')
  while (dir !== root) {
    try {
      if (fs.existsSync(join(dir, '.opencode'))) return dir
    } catch { /* ignore */ }
    dir = resolve(dir, '..')
  }
  
  return process.cwd()
}
