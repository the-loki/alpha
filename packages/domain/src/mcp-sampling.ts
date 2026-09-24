import type { Undef } from './maybe.ts'

export interface McpSamplingMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface McpSamplingPrompt {
  messages: McpSamplingMessage[]
  systemPrompt?: string
  maxTokens: number
  requestedContext: boolean
  hints: string[]
}

const objectOf = (input: unknown): Undef<Record<string, unknown>> =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined

function readMessage(input: unknown): Undef<McpSamplingMessage> {
  const message = objectOf(input)
  const content = objectOf(message?.content)
  if (message?.role !== 'user' && message?.role !== 'assistant') return undefined
  if (
    content?.type !== 'text' ||
    typeof content.text !== 'string' ||
    content.text.trim() === '' ||
    content.text.length > 10_000
  )
    return undefined
  return { role: message.role, text: content.text }
}

/** A deliberately bounded text-only subset; no private conversation context is inserted. */
export function readMcpSampling(input: unknown): Undef<McpSamplingPrompt> {
  const params = objectOf(input)
  if (
    params === undefined ||
    !Array.isArray(params.messages) ||
    params.messages.length === 0 ||
    params.messages.length > 20
  )
    return undefined
  if (
    typeof params.maxTokens !== 'number' ||
    !Number.isInteger(params.maxTokens) ||
    params.maxTokens < 1 ||
    params.maxTokens > 32_768
  )
    return undefined
  if (
    params.systemPrompt !== undefined &&
    (typeof params.systemPrompt !== 'string' || params.systemPrompt.length > 4_000)
  )
    return undefined
  if (
    params.includeContext !== undefined &&
    params.includeContext !== 'none' &&
    params.includeContext !== 'thisServer' &&
    params.includeContext !== 'allServers'
  )
    return undefined
  const messages = params.messages.map(readMessage)
  if (messages.some((message) => message === undefined)) return undefined
  const safe = messages as McpSamplingMessage[]
  if (safe.reduce((sum, message) => sum + message.text.length, 0) > 32_000) return undefined

  const preferences = objectOf(params.modelPreferences)
  const rawHints = preferences?.hints
  const hints = Array.isArray(rawHints)
    ? rawHints
        .flatMap((hint): string[] => {
          const name = objectOf(hint)?.name
          return typeof name === 'string' && name.length <= 100 ? [name] : []
        })
        .slice(0, 8)
    : []
  return {
    messages: safe,
    ...(params.systemPrompt === undefined ? {} : { systemPrompt: params.systemPrompt as string }),
    maxTokens: params.maxTokens,
    requestedContext: params.includeContext === 'thisServer' || params.includeContext === 'allServers',
    hints,
  }
}

export function validMcpSamplingEdits(
  prompt: McpSamplingPrompt,
  messages: unknown,
  systemPrompt: unknown,
): messages is string[] {
  if (
    !Array.isArray(messages) ||
    messages.length !== prompt.messages.length ||
    messages.some((text) => typeof text !== 'string' || text.trim() === '' || text.length > 10_000)
  )
    return false
  if (messages.reduce((sum: number, text: string) => sum + text.length, 0) > 32_000) return false
  return systemPrompt === undefined || (typeof systemPrompt === 'string' && systemPrompt.length <= 4_000)
}
