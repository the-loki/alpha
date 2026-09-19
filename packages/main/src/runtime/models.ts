/**
 * Which model the runtime talks to, and how it authenticates. Today this reads the environment:
 * the provider registry and stored credentials arrive with the BYOK work, and they will replace
 * the middle of this file while keeping the seam — a `Models` collection plus the chosen model.
 *
 * `ALPHA_FAUX=1` swaps in pi-ai's scripted provider. That is the seam every integration test and
 * the E2E suite run through: the runtime, the permission gate, the session store and the IPC
 * transport are all real, and only the model's replies are decided in advance.
 */

import type { ConversationModel, Undef } from '@alpha/core'
import {
  type Api,
  createModels,
  createProvider,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
  type Model,
  type MutableModels,
} from '@earendil-works/pi-ai'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'

export interface ModelRuntime {
  models: MutableModels
  /** The model a new conversation starts on. Absent when nothing is configured yet. */
  defaultModel?: Model<Api>
  kind: 'faux' | 'configured'
}

/**
 * What a scripted reply can be: text, a tool call, or both. The tool call is what makes the
 * integration and end-to-end suites able to exercise the real tools without a real model.
 */
export interface ScriptedReply {
  text?: string
  /** What the model thought before answering, when a test wants a thinking block to render. */
  thinking?: string
  tool?: { name: string; args: Record<string, unknown> }
}

const DEFAULT_FAUX_REPLIES: ScriptedReply[] = [{ text: 'Scripted reply.' }]

/** What the window should say about the model, without dialling anything. */
export function describeRuntime(runtime: ModelRuntime): { configured: boolean; description: string } {
  if (runtime.kind === 'faux') return { configured: true, description: 'Scripted model (test mode)' }
  if (runtime.defaultModel === undefined) {
    return { configured: false, description: 'No provider with a model is configured yet.' }
  }
  return { configured: true, description: `${runtime.defaultModel.provider} · ${runtime.defaultModel.id}` }
}

/**
 * The model runtime for this process: scripted in test mode, built from the environment when one
 * is configured that way (the live test), and otherwise assembled from the provider store.
 */
export function resolveModelRuntime(
  env: NodeJS.ProcessEnv,
  fromProviders: () => { models: MutableModels; defaultModel?: Model<Api> } = () => ({ models: createModels() }),
): ModelRuntime {
  const models = createModels()

  if (env.ALPHA_FAUX === '1') {
    const replies = readScriptedReplies(env.ALPHA_FAUX_REPLIES)
    const faux = fauxProvider({
      provider: 'faux',
      models: [{ id: 'scripted', name: 'Scripted', reasoning: true }],
      // A scripted reply is normally as fast as the microtask queue; a test that wants to interrupt
      // one mid-flight slows it down here instead of racing it.
      ...(readTokenRate(env) === undefined ? {} : { tokensPerSecond: readTokenRate(env) }),
      ...(readTokenSize(env) === undefined ? {} : { tokenSize: { min: readTokenSize(env), max: readTokenSize(env) } }),
    })
    // The faux provider hands out one queued step per call and errors when the queue runs dry,
    // so each reply re-arms the queue for the call after it. The script outlives the list by
    // repeating its last entry, which is what a test wants: turn two of a two-reply script is
    // the second reply, and turn ten is still the second reply rather than a failure.
    const arm = (index: number): void => {
      faux.setResponses([
        () => {
          arm(index + 1)
          return scriptedMessage(replies[Math.min(index, replies.length - 1)] ?? DEFAULT_FAUX_REPLIES[0])
        },
      ])
    }
    arm(0)
    models.setProvider(faux.provider)
    return { models, defaultModel: faux.getModel('scripted') ?? faux.getModel(), kind: 'faux' }
  }

  const baseUrl = env.ALPHA_BASE_URL ?? ''
  const apiKey = env.ALPHA_API_KEY ?? ''
  const modelId = env.ALPHA_MODEL ?? ''
  if (baseUrl === '' || modelId === '') {
    const fromStore = fromProviders()
    return { models: fromStore.models, defaultModel: fromStore.defaultModel, kind: 'configured' }
  }

  const api = readApi(env.ALPHA_API)
  const model: Model<string> = {
    id: modelId,
    name: modelId,
    api,
    provider: 'alpha-configured',
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: Number(env.ALPHA_CONTEXT_WINDOW ?? 128_000),
    maxTokens: Number(env.ALPHA_MAX_TOKENS ?? 16_384),
  }

  models.setProvider(
    createProvider({
      id: 'alpha-configured',
      name: 'Configured provider',
      baseUrl,
      auth: {
        apiKey: { name: 'API key', resolve: async () => ({ auth: { apiKey }, source: 'ALPHA_API_KEY' }) },
      },
      models: [model],
      api: api === 'anthropic-messages' ? anthropicMessagesApi() : openAICompletionsApi(),
    }),
  )

  return { models, defaultModel: model, kind: 'configured' }
}

/** How many characters arrive at a time, when a test wants a stream it can interrupt between pieces. */
function readTokenSize(env: NodeJS.ProcessEnv): Undef<number> {
  const requested = Number(env.ALPHA_FAUX_TOKEN_SIZE ?? '')
  return Number.isFinite(requested) && requested > 0 ? requested : undefined
}

/** How fast the scripted model streams, in tokens per second, when a test asks for a slow one. */
function readTokenRate(env: NodeJS.ProcessEnv): Undef<number> {
  const requested = Number(env.ALPHA_FAUX_TOKENS_PER_SECOND ?? '')
  return Number.isFinite(requested) && requested > 0 ? requested : undefined
}

/** Which wire protocol the configured endpoint speaks. */
function readApi(requested: Undef<string>): 'openai-completions' | 'anthropic-messages' {
  return requested === 'anthropic-messages' ? 'anthropic-messages' : 'openai-completions'
}

function scriptedMessage(reply: ScriptedReply): ReturnType<typeof fauxAssistantMessage> {
  const content = [
    ...(reply.thinking === undefined ? [] : [fauxThinking(reply.thinking)]),
    ...(reply.text === undefined ? [] : [fauxText(reply.text)]),
    ...(reply.tool === undefined ? [] : [fauxToolCall(reply.tool.name, reply.tool.args)]),
  ]
  return fauxAssistantMessage(content.length === 0 ? '' : content)
}

/** Accepts a bare string (text) or an object carrying text, a tool call, or both. */
function readScriptedReplies(raw: Undef<string>): ScriptedReply[] {
  if (raw === undefined || raw === '') return DEFAULT_FAUX_REPLIES
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_FAUX_REPLIES
    const replies = parsed.flatMap((item): ScriptedReply[] => {
      if (typeof item === 'string') return [{ text: item }]
      if (isScriptedReply(item)) return [item]
      return []
    })
    return replies.length === 0 ? DEFAULT_FAUX_REPLIES : replies
  } catch {
    return DEFAULT_FAUX_REPLIES
  }
}

function isScriptedReply(item: unknown): item is ScriptedReply {
  if (typeof item !== 'object' || item === null) return false
  const record = item as Record<string, unknown>
  const hasTool =
    typeof record.tool === 'object' &&
    record.tool !== null &&
    typeof (record.tool as { name?: unknown }).name === 'string' &&
    typeof (record.tool as { args?: unknown }).args === 'object'
  return typeof record.text === 'string' || typeof record.thinking === 'string' || hasTool
}

/**
 * Which model a conversation runs on: the one it chose, when that provider still serves it, and
 * the runtime's default otherwise — a provider that was deleted must not leave a conversation
 * unusable.
 */
export function modelFor(runtime: ModelRuntime, conversation: { model: ConversationModel }): Undef<Model<Api>> {
  const chosen = conversation.model
  if (chosen.providerId === '' || chosen.modelId === '') return runtime.defaultModel
  return runtime.models.getModel(chosen.providerId, chosen.modelId) ?? runtime.defaultModel
}
