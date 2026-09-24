/**
 * The scripted provider: a real pi-ai `Models` whose one provider streams from a script, so the
 * assembled agent is driven the real way — `streamSimple` dispatch, auth resolution and all —
 * with no network and no child (ADR-0025's test seam). Test fixtures only.
 */

import type { AgentTool } from '@earendil-works/pi-agent-core'
import {
  type Api,
  type AssistantMessage,
  createModels,
  type Model,
  type Models,
  type Provider,
} from '@earendil-works/pi-ai'
// The root entry re-exports the stream class type-only; the class itself lives on the utils subpath.
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream'
import { Type } from 'typebox'

/** The one argument every scripted tool takes. */
const textParams = Type.Object({ text: Type.String() })

/** A model Alpha could have stored, plain enough that no cast is needed. */
export const aModel = (): Model<'openai-completions'> => ({
  id: 'm',
  name: 'M',
  api: 'openai-completions',
  provider: 'p',
  baseUrl: 'http://127.0.0.1:9/v1', // constraints-ignore 03-product-scope: test fixture, never dialed
  reasoning: false,
  input: ['text'],
  contextWindow: 200_000,
  maxTokens: 100,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
})

const usage = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

const assistantText = (text: string, over: Partial<AssistantMessage> = {}): AssistantMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text }],
  api: 'openai-completions',
  provider: 'p',
  model: 'm',
  usage,
  stopReason: 'stop',
  timestamp: Date.now(),
  ...over,
})

/** One scripted drive that says `text` and stops. */
export const textStream = (text: string): AssistantMessageEventStream => {
  const stream = new AssistantMessageEventStream()
  stream.push({ type: 'start', partial: assistantText('') })
  stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: assistantText(text) })
  stream.push({ type: 'done', reason: 'stop', message: assistantText(text) })
  return stream
}

/** One scripted drive that asks for `toolName` and stops, as a model mid-task does. */
export const toolUseStream = (
  toolName: string,
  args: Record<string, string>,
  id = 'call-1',
): AssistantMessageEventStream => {
  const stream = new AssistantMessageEventStream()
  stream.push({
    type: 'done',
    reason: 'toolUse',
    message: assistantText('', {
      stopReason: 'toolUse',
      content: [{ type: 'toolCall', id, name: toolName, arguments: args }],
    }),
  })
  return stream
}

/** One scripted drive that ends the way a provider failure or an abort does. */
export const errorStream = (message: string, reason: 'error' | 'aborted'): AssistantMessageEventStream => {
  const stream = new AssistantMessageEventStream()
  stream.push({
    type: 'error',
    reason,
    error: assistantText('', { stopReason: reason, errorMessage: message }),
  })
  return stream
}

/**
 * Real Models with one scripted provider, so `models.streamSimple.bind(models)` in the assembly
 * is exercised as the real dispatch path. One drive per provider request; a script that runs dry
 * fails loudly instead of looping. The catalog defaults to the one model; tests that switch models
 * hand a longer one, whose first entry names the provider.
 */
export const scriptedModels = (
  drives: Array<() => AssistantMessageEventStream>,
  catalog: readonly Model<Api>[] = [aModel()],
): Models => {
  const first = catalog[0] ?? aModel()
  const models = createModels()
  const next = (): AssistantMessageEventStream => {
    const drive = drives.shift()
    if (drive === undefined) throw new Error('the script ran dry')
    return drive()
  }
  const provider: Provider = {
    id: first.provider,
    name: 'Scripted',
    baseUrl: first.baseUrl,
    auth: {
      apiKey: {
        name: 'Scripted key',
        resolve: async () => ({ auth: { apiKey: 'k' }, source: 'test' }),
      },
    },
    getModels: () => catalog,
    stream: next,
    streamSimple: next,
  }
  models.setProvider(provider)
  return models
}

/** A TypeBox-honest tool that records the calls that reached execution. */
export const toolNamed = (name: string, executed: string[] = []): AgentTool<typeof textParams> => ({
  name,
  label: name,
  description: `the ${name} tool`,
  parameters: textParams,
  execute: async (_toolCallId, params) => {
    executed.push(name)
    return { content: [{ type: 'text', text: params.text }], details: undefined }
  },
})
