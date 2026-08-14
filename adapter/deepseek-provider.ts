/**
 * Model Router + DeepSeek API client for the GraphyLoop meta-harness
 *
 * Two execution modes:
 *  1. OpenCode harness (default): all LLM work goes through OpenCode task
 *     subagents — no API key needed here. Swarm agents stay coordination
 *     objects (~1 KB each); agent-chadi dispatches the actual work.
 *  2. Direct DeepSeek API: set DEEPSEEK_API_KEY (or pass `apiKey` in config)
 *     and this provider calls https://api.deepseek.com directly, bypassing
 *     the OpenCode harness for headless / one-shot work (graphyloop CLI `ask`).
 *
 * Models (DeepSeek API, verified 2026-08-06):
 *  - deepseek-v4-flash  — fast, cheap (default)
 *  - deepseek-v4-pro    — deep reasoning (thinking mode, reasoning_effort)
 */

import type { DeepSeekConfig, DeepSeekMessage, DeepSeekResponse } from './types'

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-v4-flash'
const PRO_MODEL = 'deepseek-v4-pro'

/**
 * Real DeepSeek API client (OpenAI-compatible /chat/completions).
 * Throws with guidance when no API key is available — in that case LLM work
 * must go through OpenCode task subagents instead.
 */
export class DeepSeekProvider {
  private config: DeepSeekConfig

  constructor(config: Partial<DeepSeekConfig> = {}) {
    this.config = {
      baseUrl: DEFAULT_BASE_URL,
      defaultModel: DEFAULT_MODEL,
      maxTokens: 4096,
      temperature: 0.1,
      ...config,
    }
  }

  /** API key: explicit config first, else DEEPSEEK_API_KEY env. */
  private key(): string {
    const k = this.config.apiKey ?? process.env.DEEPSEEK_API_KEY
    if (!k) {
      throw new Error(
        'DeepSeek API key missing. Set DEEPSEEK_API_KEY (or pass apiKey) to call DeepSeek directly. ' +
        'Without a key, LLM work must go through OpenCode task subagents.'
      )
    }
    return k
  }

  private model(model?: string): string {
    return model || this.config.defaultModel || DEFAULT_MODEL
  }

  private async chat(
    messages: DeepSeekMessage[],
    opts: {
      model?: string
      json?: boolean
      thinking?: 'enabled' | 'disabled'
      maxTokens?: number
      temperature?: number
    } = {},
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model(opts.model),
      messages,
      max_tokens: opts.maxTokens ?? this.config.maxTokens ?? 4096,
      temperature: opts.temperature ?? this.config.temperature ?? 0.1,
      stream: false,
    }
    if (opts.json) body.response_format = { type: 'json_object' }
    if (opts.thinking) body.thinking = { type: opts.thinking }

    let res: Response
    try {
      res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.key()}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      })
    } catch (err) {
      throw new Error(`DeepSeek API request failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`DeepSeek API ${res.status}: ${errText.slice(0, 300)}`)
    }

    const data = (await res.json()) as DeepSeekResponse
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('DeepSeek API: empty response')
    return content
  }

  /** Plain chat call over a message list. */
  async call(
    messages: DeepSeekMessage[],
    opts: { model?: string; maxTokens?: number; temperature?: number } = {},
  ): Promise<string> {
    return this.chat(messages, opts)
  }

  /** Single user prompt → assistant reply (fast path, flash model). */
  async quickCall(
    prompt: string,
    opts: { model?: string; system?: string; maxTokens?: number } = {},
  ): Promise<string> {
    const messages: DeepSeekMessage[] = []
    if (opts.system) messages.push({ role: 'system', content: opts.system })
    messages.push({ role: 'user', content: prompt })
    return this.chat(messages, opts)
  }

  /** Prompt → parsed JSON object (response_format json_object). */
  async jsonCall<T = unknown>(
    prompt: string,
    opts: { model?: string; system?: string } = {},
  ): Promise<T> {
    const messages: DeepSeekMessage[] = [
      { role: 'system', content: opts.system ?? 'You are a helpful assistant designed to output JSON.' },
      { role: 'user', content: prompt },
    ]
    const raw = await this.chat(messages, { ...opts, json: true })
    return JSON.parse(raw) as T
  }

  /** Deep reasoning call — pro model, thinking mode on. */
  async reason(
    prompt: string,
    opts: { system?: string; maxTokens?: number } = {},
  ): Promise<string> {
    const messages: DeepSeekMessage[] = []
    if (opts.system) messages.push({ role: 'system', content: opts.system })
    messages.push({ role: 'user', content: prompt })
    return this.chat(messages, { ...opts, model: PRO_MODEL, thinking: 'enabled' })
  }

  /** Smart call — pro model, no forced thinking. */
  async smartCall(
    prompt: string,
    opts: { system?: string; maxTokens?: number } = {},
  ): Promise<string> {
    return this.quickCall(prompt, { ...opts, model: PRO_MODEL })
  }

  /** Cheap connectivity check — tiny completion, false on any failure. */
  async healthCheck(): Promise<boolean> {
    try {
      const out = await this.chat([{ role: 'user', content: 'ping' }], {
        maxTokens: 4,
        temperature: 0,
      })
      return out.length > 0
    } catch {
      return false
    }
  }
}

// ============================================================================
// Model Router — Thompson Sampling Bandit
// ============================================================================

interface ModelStats {
  successes: number
  failures: number
  totalLatencyMs: number
  callCount: number
}

/**
 * Simple model router that tracks success/failure per model variant.
 * For now: deterministic routing by complexity. Thompson sampling
 * can be added after 50+ outcomes per model variant.
 */
export class ModelRouter {
  private stats: Map<string, ModelStats> = new Map()

  record(model: string, success: boolean, latencyMs: number): void {
    const s = this.stats.get(model) ?? { successes: 0, failures: 0, totalLatencyMs: 0, callCount: 0 }
    if (success) s.successes++
    else s.failures++
    s.totalLatencyMs += latencyMs
    s.callCount++
    this.stats.set(model, s)
  }

  selectModel(complexity: 'simple' | 'medium' | 'complex'): 'deepseek-v4-flash' | 'deepseek-v4-pro' {
    if (complexity === 'complex') return PRO_MODEL
    return DEFAULT_MODEL
  }

  getStats(): Record<string, ModelStats> {
    return Object.fromEntries(this.stats)
  }
}
