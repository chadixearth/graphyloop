/**
 * GraphyLoop-OpenCode Adapter — Shared Types
 * Adapted from graphyloop v3 (@claude-flow/shared) for OpenCode + DeepSeek
 */

// ============================================================================
// Agent Types
// ============================================================================

export type AgentStatus = 'active' | 'idle' | 'busy' | 'terminated' | 'error'
export type AgentRole = 'leader' | 'worker' | 'peer'
export type AgentType = 'coder' | 'tester' | 'reviewer' | 'architect' | 'explorer' | 'security' | 'coordinator' | string

export interface AgentConfig {
  id: string
  type: AgentType
  capabilities?: string[]
  role?: AgentRole
  parent?: string
  metadata?: Record<string, unknown>
}

export interface AgentState {
  id: string
  type: AgentType
  status: AgentStatus
  capabilities: string[]
  role?: AgentRole
  parent?: string
  metadata?: Record<string, unknown>
  createdAt: number
  lastActive: number
  tasksCompleted: number
  tasksFailed: number
  successRate: number
  health: 'healthy' | 'degraded' | 'unhealthy'
}

// ============================================================================
// Task Types
// ============================================================================

export type TaskPriority = 'high' | 'medium' | 'low'
export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled'

export interface SwarmTask {
  id: string
  type: string
  description: string
  priority: TaskPriority
  status?: TaskStatus
  assignedTo?: string
  dependencies?: string[]
  metadata?: Record<string, unknown>
  onExecute?: () => Promise<TaskResult>
}

export interface TaskResult {
  taskId: string
  status: 'completed' | 'failed'
  result?: unknown
  error?: string
  duration?: number
  agentId?: string
}

export interface TaskAssignment {
  taskId: string
  agentId: string
  assignedAt: number
  priority: TaskPriority
}

// ============================================================================
// Swarm Types
// ============================================================================

export type SwarmTopology = 'hierarchical' | 'mesh' | 'simple'

export interface SwarmConfig {
  topology: SwarmTopology
  maxAgents?: number
  memoryPath?: string
}

export interface SwarmState {
  agents: AgentState[]
  topology: SwarmTopology
  leader?: string
  activeConnections: number
  totalTasksCompleted: number
  totalTasksFailed: number
}

// ============================================================================
// Memory Types
// ============================================================================

export type MemoryType = 'task' | 'context' | 'event' | 'decision' | 'lesson' | 'pattern' | string

export interface MemoryEntry {
  id: string
  agentId: string
  content: string
  type: MemoryType
  timestamp: number
  embedding?: number[]
  metadata?: Record<string, unknown>
}

export interface MemoryQuery {
  agentId?: string
  type?: MemoryType
  timeRange?: { start: number; end: number }
  metadata?: Record<string, unknown>
  limit?: number
  offset?: number
}

export interface MemorySearchResult extends MemoryEntry {
  similarity?: number
}

// ============================================================================
// DeepSeek Provider Types
// ============================================================================

export interface DeepSeekConfig {
  apiKey?: string
  baseUrl?: string
  /** 'deepseek-v4-flash' (default) | 'deepseek-v4-pro' */
  defaultModel?: string
  maxTokens?: number
  temperature?: number
  /** 'enabled' | 'disabled' — thinking mode toggle for v4 models */
  thinking?: 'enabled' | 'disabled'
}

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface DeepSeekResponse {
  id: string
  model: string
  choices: Array<{
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ============================================================================
// Adapter Events
// ============================================================================

export type GraphyLoopEvent =
  | 'agent:spawned'
  | 'agent:terminated'
  | 'task:assigned'
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'swarm:initialized'
  | 'swarm:shutdown'
  | 'memory:stored'
  | 'memory:recalled'

export interface GraphyLoopEventPayload {
  type: GraphyLoopEvent
  timestamp: number
  data: Record<string, unknown>
}
