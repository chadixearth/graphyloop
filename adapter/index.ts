/**
 * GraphyLoop-OpenCode Adapter — Main Entry
 * 
 * Layers graphyloop's meta-harness (swarm coordination, memory, neural routing)
 * on top of agent-chadi's 5-gate workflow and OpenCode's tool ecosystem.
 * 
 * Usage:
 *   import { GraphyLoopAdapter } from './.opencode/graphyloop/index'
 *   const graphyloop = new GraphyLoopAdapter({ projectRoot: process.cwd() })
 *   await graphyloop.init()
 *   // ... use graphyloop.swarm, graphyloop.memory, graphyloop.deepseek ...
 * 
 * Integration with agent-chadi:
 *   - Gate 2 (Discovery): graphyloop.memory.search() for relevant context
 *   - Gate 3 (Implement): graphyloop.swarm.prepareExecution() to dispatch tasks
 *   - Gate 3 (AutoFix): graphyloop.swarm.recordResult() on task completion
 *   - Gate 5 (Report): graphyloop.memory.store() to persist decisions/lessons
 */

export { SwarmAdapter } from './swarm'
export { MemoryBackend } from './memory'
export { DeepSeekProvider, ModelRouter } from './deepseek-provider'
export { claudeToOpeCode, openCodeToClaude, shimEnvVars, resolveProjectRoot } from './path-mapper'
export type * from './types'

import { SwarmAdapter } from './swarm'
import { MemoryBackend } from './memory'
import { DeepSeekProvider } from './deepseek-provider'
import { shimEnvVars, resolveProjectRoot } from './path-mapper'
import type { SwarmConfig, DeepSeekConfig } from './types'

export interface GraphyLoopAdapterConfig {
  projectRoot?: string
  swarm?: SwarmConfig
  deepseek?: DeepSeekConfig  // Optional — only if you have DEEPSEEK_API_KEY
  memoryPath?: string
}

export class GraphyLoopAdapter {
  public swarm: SwarmAdapter
  public memory: MemoryBackend
  public deepseek?: DeepSeekProvider  // Optional — OpenCode handles model routing
  public projectRoot: string
  
  private initialized = false

  constructor(config: GraphyLoopAdapterConfig = {}) {
    this.projectRoot = config.projectRoot ?? resolveProjectRoot()
    
    this.swarm = new SwarmAdapter({
      topology: 'hierarchical',
      maxAgents: 8,
      ...config.swarm,
    })
    
    this.memory = new MemoryBackend(
      config.memoryPath ?? `${this.projectRoot}/.opencode/graphyloop/memory/store.json`
    )
    
    // DeepSeek provider is OPTIONAL — only if bypassing OpenCode harness
    if (config.deepseek?.apiKey || process.env.DEEPSEEK_API_KEY) {
      this.deepseek = new DeepSeekProvider(config.deepseek)
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return
    
    // Shim env vars so any graphyloop core code that reads CLAUDE_* gets correct values
    shimEnvVars(this.projectRoot)
    
    // Initialize subsystems
    await Promise.all([
      this.swarm.initialize(),
      this.memory.initialize(),
    ])
    
    await this.memory.storeEvent('system', 'GraphyLoop-OpenCode adapter initialized', 'event', {
      projectRoot: this.projectRoot,
      swarmTopology: this.swarm.getState().topology,
      timestamp: Date.now(),
    })
    
    this.initialized = true
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.swarm.shutdown(),
      this.memory.close(),
    ])
    this.initialized = false
  }

  /**
   * Get comprehensive status for agent-chadi's Gate 5 report
   */
  async getStatus() {
    return {
      initialized: this.initialized,
      projectRoot: this.projectRoot,
      swarm: this.swarm.getState(),
      swarmMetrics: this.swarm.getMetrics(),
      memory: this.memory.getStats(),
      deepseekHealth: this.deepseek ? await this.deepseek.healthCheck().catch(() => false) : 'n/a (OpenCode harness)',
    }
  }
}
