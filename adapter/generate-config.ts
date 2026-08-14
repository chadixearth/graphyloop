/**
 * OpenCode Config Generator
 * 
 * Generates the graphyloop section of opencode.json / opencode.jsonc.
 * Run: npx tsx .opencode/graphyloop/generate-config.ts
 */

import { writeFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'

interface OpenCodeConfig {
  command?: Record<string, unknown>
  permission?: Record<string, unknown>
  mcpServers?: Record<string, unknown>
  env?: Record<string, string>
  graphyloop?: {
    enabled: boolean
    maxAgents: number
    topology: 'hierarchical' | 'mesh'
    memoryPath: string
    deepseekModel: string
  }
}

const DEFAULT_GRAPHYLOOP_CONFIG = {
  enabled: true,
  maxAgents: 8,
  topology: 'hierarchical' as const,
  memoryPath: '.opencode/graphyloop/memory',
  deepseekModel: 'deepseek-chat',
}

function generateOpenCodeConfig(projectRoot: string): OpenCodeConfig {
  const configPath = join(projectRoot, 'opencode.json')
  let existing: OpenCodeConfig = {}
  
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      console.warn('⚠ Existing opencode.json invalid, starting fresh')
    }
  }
  
  return {
    ...existing,
    graphyloop: DEFAULT_GRAPHYLOOP_CONFIG,
    permission: {
      ...(existing.permission ?? {}),
      // Allow graphyloop to use MCP tools
      'mcp__graphyloop__*': 'allow',
    },
  }
}

// Run directly
const projectRoot = process.argv[2] || process.cwd()
const config = generateOpenCodeConfig(projectRoot)
const configPath = join(projectRoot, 'opencode.json')

writeFileSync(configPath, JSON.stringify(config, null, 2))
console.log(`✅ GraphyLoop config written to ${configPath}`)
console.log(JSON.stringify(config.graphyloop, null, 2))
