/**
 * Which model the runtime talks to, and how it authenticates. Today this reads the environment:
 * the provider registry and stored credentials arrive with the BYOK work, and they will replace
 * the middle of this file while keeping the seam — a `Models` collection plus the chosen model.
 *
 * `ALPHA_FAUX=1` swaps in pi-ai's scripted provider. That is the seam every integration test and
 * the E2E suite run through: the runtime, the permission gate, the session store and the IPC
 * transport are all real, and only the model's replies are decided in advance.
 */
import {
  type Api,
  createModels,
  createProvider,
  fauxAssistantMessage,
  fauxProvider,
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

const DEFAULT_FAUX_REPLIES = ['Scripted reply.']

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
    const faux = fauxProvider({ provider: 'faux', models: [{ id: 'scripted', name: 'Scripted' }] })
    // The faux provider hands out one queued step per call and errors when the queue runs dry,
    // so each reply re-arms the queue for the call after it. The script outlives the list by
    // repeating its last entry, which is what a test wants: turn two of a two-reply script is
    // the second reply, and turn ten is still the second reply rather than a failure.
    const arm = (index: number): void => {
      faux.setResponses([
        () => {
          arm(index + 1)
          return fauxAssistantMessage(replies[Math.min(index, replies.length - 1)] ?? DEFAULT_FAUX_REPLIES[0])
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

/** Which wire protocol the configured endpoint speaks. */
function readApi(requested: string | undefined): 'openai-completions' | 'anthropic-messages' {
  return requested === 'anthropic-messages' ? 'anthropic-messages' : 'openai-completions'
}

function readScriptedReplies(raw: string | undefined): string[] {
  if (raw === undefined || raw === '') return DEFAULT_FAUX_REPLIES
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed
  } catch {
    return DEFAULT_FAUX_REPLIES
  }
  return DEFAULT_FAUX_REPLIES
}
