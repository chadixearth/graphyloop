/**
 * Swarm Adapter — GraphyLoop-style SwarmCoordinator adapted for OpenCode
 * 
 * Key difference: graphyloop spawns real Claude CLI processes per agent.
 * This adapter maps swarm agents → OpenCode `task` subagent dispatches.
 * 
 * Swarm agents are coordination objects (~1 KB each). Task execution
 * delegates to OpenCode's native subagent system (chadi-backend, chadi-test, etc.).
 */

import type {
  AgentConfig, AgentState, AgentStatus, AgentRole, AgentType,
  SwarmTask, TaskResult, TaskAssignment,
  SwarmTopology, SwarmConfig, SwarmState,
} from './types'

// Agent type → OpenCode subagent_type mapping
const AGENT_TO_OPENCODE: Record<string, string> = {
  coder:        'chadi-backend',
  tester:       'chadi-test',
  reviewer:     'chadi-reviewer',
  architect:    'chadi-architect',
  explorer:     'chadi-explorer',
  security:     'chadi-security',
  coordinator:  'general',
  frontend:     'chadi-frontend',
  data:         'chadi-data',
}

const DEFAULT_CAPABILITIES: Record<string, string[]> = {
  coder:        ['code', 'debug', 'implement', 'refactor'],
  tester:       ['test', 'validate', 'e2e', 'coverage'],
  reviewer:     ['review', 'analyze', 'audit'],
  architect:    ['design', 'plan', 'architecture'],
  explorer:     ['explore', 'search', 'map', 'analyze'],
  security:     ['audit', 'scan', 'harden', 'review'],
  coordinator:  ['coordinate', 'route', 'manage', 'orchestrate'],
  frontend:     ['ui', 'layout', 'component', 'style'],
  data:         ['schema', 'migration', 'query', 'seed'],
}

export class SwarmAdapter {
  private topology: SwarmTopology
  private maxAgents: number
  private agents: Map<string, AgentState> = new Map()
  private taskQueue: SwarmTask[] = []
  private initialized = false
  private metrics = { tasksCompleted: 0, tasksFailed: 0 }

  constructor(config: SwarmConfig = { topology: 'hierarchical', maxAgents: 8 }) {
    this.topology = config.topology
    this.maxAgents = config.maxAgents ?? 8
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<SwarmState> {
    if (this.initialized) return this.getState()
    
    // Create leader agent
    await this.spawnAgent({
      id: 'swarm-leader',
      type: 'coordinator',
      capabilities: ['coordinate', 'route', 'orchestrate'],
      role: 'leader',
    })
    
    this.initialized = true
    return this.getState()
  }

  async shutdown(): Promise<void> {
    this.agents.clear()
    this.taskQueue = []
    this.initialized = false
  }

  // ============================================================================
  // Agent Management
  // ============================================================================

  async spawnAgent(config: AgentConfig): Promise<AgentState> {
    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Max agents (${this.maxAgents}) reached. Scale up or terminate idle agents.`)
    }
    
    const state: AgentState = {
      id: config.id || `${config.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: config.type,
      status: 'active',
      capabilities: config.capabilities ?? DEFAULT_CAPABILITIES[config.type] ?? [],
      role: config.role ?? (this.topology === 'hierarchical' ? 'worker' : 'peer'),
      parent: config.parent,
      metadata: config.metadata,
      createdAt: Date.now(),
      lastActive: Date.now(),
      tasksCompleted: 0,
      tasksFailed: 0,
      successRate: 1.0,
      health: 'healthy',
    }
    
    this.agents.set(state.id, state)
    return state
  }

  async terminateAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.status = 'terminated'
      this.agents.delete(agentId)
    }
  }

  async listAgents(): Promise<AgentState[]> {
    return Array.from(this.agents.values())
  }

  async getAgent(agentId: string): Promise<AgentState | undefined> {
    return this.agents.get(agentId)
  }

  // ============================================================================
  // Task Distribution
  // ============================================================================

  /**
   * Distribute tasks across agents using capability-matching + load-balancing.
   * Returns OpenCode dispatch instructions (agent type → task description).
   */
  async distributeTasks(tasks: SwarmTask[]): Promise<TaskAssignment[]> {
    const assignments: TaskAssignment[] = []
    const agentLoads = new Map<string, number>()
    
    for (const [id] of this.agents) {
      agentLoads.set(id, 0)
    }
    
    // Sort by priority
    const sorted = [...tasks].sort((a, b) => {
      const prio = { high: 0, medium: 1, low: 2 }
      return (prio[a.priority] ?? 1) - (prio[b.priority] ?? 1)
    })
    
    for (const task of sorted) {
      // Find capable agents
      const capable = Array.from(this.agents.values()).filter(a =>
        a.status === 'active' && this.agentCanHandle(a, task.type)
      )
      
      if (capable.length === 0) continue
      
      // Load-balance: pick agent with fewest tasks
      let best = capable[0]
      let lowest = agentLoads.get(best.id) ?? 0
      for (const a of capable) {
        const load = agentLoads.get(a.id) ?? 0
        if (load < lowest) { lowest = load; best = a }
      }
      
      assignments.push({
        taskId: task.id,
        agentId: best.id,
        assignedAt: Date.now(),
        priority: task.priority,
      })
      
      agentLoads.set(best.id, (agentLoads.get(best.id) ?? 0) + 1)
    }
    
    return assignments
  }

  /**
   * Translate swarm agent → OpenCode subagent type
   */
  getOpenCodeAgentType(agentId: string): string {
    const agent = this.agents.get(agentId)
    if (!agent) return 'general'
    return AGENT_TO_OPENCODE[agent.type] ?? 'general'
  }

  /**
   * Build an OpenCode `task` dispatch prompt for a swarm task
   */
  buildDispatchPrompt(task: SwarmTask, agentId: string): string {
    const agent = this.agents.get(agentId)
    const agentType = agent?.type ?? 'general'
    const capabilities = agent?.capabilities?.join(', ') ?? 'general'
    
    return [
      `[Swarm Task: ${task.id}]`,
      `Agent: ${agentId} (type: ${agentType}, capabilities: ${capabilities})`,
      `Priority: ${task.priority}`,
      `Task: ${task.description}`,
      task.metadata ? `Metadata: ${JSON.stringify(task.metadata)}` : '',
      ``,
      `Execute this task as a ${agentType} agent. Return results with file paths and verification.`,
    ].filter(Boolean).join('\n')
  }

  // ============================================================================
  // Execution (OpenCode bridge)
  // ============================================================================

  /**
   * Execute a task via OpenCode's task dispatch.
   * This is the bridge: swarm agent → OpenCode subagent.
   * 
   * In production, the main agent-chadi calls this to dispatch
   * a task subagent. The swarm handles coordination; agent-chadi
   * handles the actual OpenCode `task` tool call.
   */
  async prepareExecution(taskId: string, agentId: string): Promise<{
    agentId: string
    openCodeAgentType: string
    prompt: string
    task: SwarmTask | undefined
  }> {
    const task = this.taskQueue.find(t => t.id === taskId)
    if (!task) throw new Error(`Task ${taskId} not found in queue`)
    
    const agent = this.agents.get(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)
    
    // Mark as in-progress
    task.status = 'in-progress'
    task.assignedTo = agentId
    agent.status = 'busy'
    agent.lastActive = Date.now()
    
    return {
      agentId,
      openCodeAgentType: this.getOpenCodeAgentType(agentId),
      prompt: this.buildDispatchPrompt(task, agentId),
      task,
    }
  }

  async recordResult(taskId: string, result: TaskResult): Promise<void> {
    const task = this.taskQueue.find(t => t.id === taskId)
    const agentId = result.agentId ?? task?.assignedTo
    const agent = agentId ? this.agents.get(agentId) : undefined
    
    if (task) {
      task.status = result.status === 'completed' ? 'completed' : 'failed'
    }
    
    if (agent) {
      agent.status = 'active'
      agent.lastActive = Date.now()
      
      if (result.status === 'completed') {
        agent.tasksCompleted++
        this.metrics.tasksCompleted++
      } else {
        agent.tasksFailed++
        this.metrics.tasksFailed++
      }
      
      const total = agent.tasksCompleted + agent.tasksFailed
      agent.successRate = total > 0 ? agent.tasksCompleted / total : 1.0
      agent.health = agent.successRate < 0.5 ? 'unhealthy' : agent.successRate < 0.8 ? 'degraded' : 'healthy'
    }
  }

  // ============================================================================
  // Task Queue
  // ============================================================================

  enqueue(task: SwarmTask): void {
    this.taskQueue.push(task)
  }

  enqueueBatch(tasks: SwarmTask[]): void {
    this.taskQueue.push(...tasks)
  }

  getQueue(): SwarmTask[] {
    return [...this.taskQueue]
  }

  getPendingTasks(): SwarmTask[] {
    return this.taskQueue.filter(t => t.status === 'pending' || !t.status)
  }

  clearCompleted(): void {
    this.taskQueue = this.taskQueue.filter(t => 
      t.status !== 'completed' && t.status !== 'failed'
    )
  }

  // ============================================================================
  // State & Metrics
  // ============================================================================

  getState(): SwarmState {
    return {
      agents: Array.from(this.agents.values()),
      topology: this.topology,
      leader: Array.from(this.agents.values()).find(a => a.role === 'leader')?.id,
      activeConnections: this.topology === 'mesh' 
        ? this.agents.size * (this.agents.size - 1) 
        : this.agents.size - 1,
      totalTasksCompleted: this.metrics.tasksCompleted,
      totalTasksFailed: this.metrics.tasksFailed,
    }
  }

  getMetrics() {
    return { ...this.metrics }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private agentCanHandle(agent: AgentState, taskType: string): boolean {
    // Direct capability match
    if (agent.capabilities.includes(taskType)) return true
    
    // Type-based matching
    const typeMap: Record<string, string[]> = {
      'code':      ['coder'],
      'debug':     ['coder', 'explorer'],
      'test':      ['tester'],
      'review':    ['reviewer', 'security'],
      'design':    ['architect', 'frontend'],
      'explore':   ['explorer', 'architect'],
      'security':  ['security'],
      'data':      ['data'],
      'ui':        ['frontend'],
      'coordinate': ['coordinator'],
    }
    
    const matchingTypes = typeMap[taskType] ?? []
    return matchingTypes.includes(agent.type)
  }

  private agentToOpenCodeType(agentType: AgentType): string {
    return AGENT_TO_OPENCODE[agentType] ?? 'general'
  }
}
