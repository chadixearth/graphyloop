/**
 * Memory Backend — GraphyLoop-style hybrid memory adapted for OpenCode
 * 
 * Simplified: SQLite for structured queries, with optional HNSW vector search.
 * Designed to complement (not replace) PMB memory.
 * 
 * PMB handles: rules, facts, goals, decisions, lessons (durable)
 * GraphyLoop memory handles: task context, swarm state, patterns, embeddings (operational)
 */

import type { MemoryEntry, MemoryQuery, MemorySearchResult, MemoryType } from './types'

// Simple in-memory store with JSON file persistence.
// For production use with large datasets, swap for better-sqlite3 + hnswlib.

interface MemoryStore {
  entries: MemoryEntry[]
}

export class MemoryBackend {
  private entries: Map<string, MemoryEntry> = new Map()
  private initialized = false
  private filePath: string

  constructor(filePath: string = '.opencode/graphyloop/memory/store.json') {
    this.filePath = filePath
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    
    try {
      const fs = await import('fs/promises')
      const data = await fs.readFile(this.filePath, 'utf-8')
      const store: MemoryStore = JSON.parse(data)
      for (const entry of store.entries) {
        this.entries.set(entry.id, entry)
      }
    } catch {
      // No existing store — start fresh
    }
    
    this.initialized = true
  }

  async persist(): Promise<void> {
    const store: MemoryStore = {
      entries: Array.from(this.entries.values()),
    }
    const fs = await import('fs/promises')
    const path = await import('path')
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, JSON.stringify(store, null, 2))
  }

  async close(): Promise<void> {
    await this.persist()
    this.initialized = false
  }

  // ============================================================================
  // CRUD
  // ============================================================================

  async store(entry: MemoryEntry): Promise<MemoryEntry> {
    this.entries.set(entry.id, entry)
    return entry
  }

  async storeBatch(entries: MemoryEntry[]): Promise<void> {
    for (const entry of entries) {
      this.entries.set(entry.id, entry)
    }
  }

  async retrieve(id: string): Promise<MemoryEntry | undefined> {
    return this.entries.get(id)
  }

  async update(entry: MemoryEntry): Promise<void> {
    if (this.entries.has(entry.id)) {
      this.entries.set(entry.id, entry)
    }
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id)
  }

  // ============================================================================
  // Query
  // ============================================================================

  async query(q: MemoryQuery): Promise<MemoryEntry[]> {
    let results = Array.from(this.entries.values())
    
    if (q.agentId) {
      results = results.filter(e => e.agentId === q.agentId)
    }
    if (q.type) {
      results = results.filter(e => e.type === q.type)
    }
    if (q.timeRange) {
      results = results.filter(e =>
        e.timestamp >= q.timeRange!.start && e.timestamp <= q.timeRange!.end
      )
    }
    if (q.metadata) {
      results = results.filter(e => {
        if (!e.metadata) return false
        return Object.entries(q.metadata!).every(
          ([k, v]) => e.metadata![k] === v
        )
      })
    }
    
    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp)
    
    const offset = q.offset ?? 0
    const limit = q.limit ?? 50
    return results.slice(offset, offset + limit)
  }

  /**
   * Simple keyword search (no HNSW yet — add @ruvector/rabitq-wasm for production)
   */
  async search(query: string, k: number = 10): Promise<MemorySearchResult[]> {
    const terms = query.toLowerCase().split(/\s+/)
    const scored = Array.from(this.entries.values()).map(entry => {
      const content = entry.content.toLowerCase()
      const metadata = entry.metadata ? JSON.stringify(entry.metadata).toLowerCase() : ''
      const searchText = content + ' ' + metadata
      
      let score = 0
      for (const term of terms) {
        if (searchText.includes(term)) score += 1
        // Bonus for exact phrase match
        if (content.includes(query.toLowerCase())) score += 3
      }
      
      return { ...entry, similarity: score / terms.length }
    })
    
    return scored
      .filter(r => r.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k)
  }

  // ============================================================================
  // Convenience
  // ============================================================================

  async storeEvent(
    agentId: string,
    content: string,
    type: MemoryType = 'event',
    metadata?: Record<string, unknown>
  ): Promise<MemoryEntry> {
    return this.store({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      content,
      type,
      timestamp: Date.now(),
      metadata,
    })
  }

  async getRecent(k: number = 20): Promise<MemoryEntry[]> {
    return this.query({ limit: k })
  }

  async getByAgent(agentId: string, k: number = 50): Promise<MemoryEntry[]> {
    return this.query({ agentId, limit: k })
  }

  async clearAgent(agentId: string): Promise<void> {
    for (const [id, entry] of this.entries) {
      if (entry.agentId === agentId) {
        this.entries.delete(id)
      }
    }
  }

  getStats(): { totalEntries: number; oldestTimestamp: number; newestTimestamp: number } {
    const entries = Array.from(this.entries.values())
    return {
      totalEntries: entries.length,
      oldestTimestamp: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : 0,
      newestTimestamp: entries.length > 0 ? Math.max(...entries.map(e => e.timestamp)) : 0,
    }
  }
}
