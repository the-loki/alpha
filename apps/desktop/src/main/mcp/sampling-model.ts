import { type ConversationSummary, type McpSamplingPrompt, type Undef, usageTotals } from '@alpha/domain'
import { modelFor } from '@alpha/providers'
import type { Api, Context, Message, Model, Models, Usage } from '@earendil-works/pi-ai'
import type { RuntimeManagerOptions } from '../runtime/managed-runtime.ts'
import { createModelRuntime } from '../runtime/model-runtime.ts'
import type { SamplingModel } from './sampling.ts'

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

function contextOf(prompt: McpSamplingPrompt, model: Model<Api>): Context {
  const timestamp = Date.now()
  const messages: Message[] = prompt.messages.map(
    (message): Message =>
      message.role === 'user'
        ? { role: 'user', content: message.text, timestamp }
        : {
            role: 'assistant',
            content: [{ type: 'text', text: message.text }],
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: EMPTY_USAGE,
            stopReason: 'stop',
            timestamp,
          },
  )
  return { messages, ...(prompt.systemPrompt === undefined ? {} : { systemPrompt: prompt.systemPrompt }) }
}

/** A separate model call; no conversation history or agent state is passed to it. */
export function samplingModel(models: Models, providerId: string, modelId: string): Undef<SamplingModel> {
  const model = models.getModel(providerId, modelId)
  if (model === undefined || model.maxTokens < 1) return undefined
  return {
    providerId,
    modelId,
    name: model.name,
    maxTokens: model.maxTokens,
    generate: async (prompt, signal) => {
      const answer = await models.completeSimple(model, contextOf(prompt, model), {
        signal,
        maxTokens: prompt.maxTokens,
        toolChoice: 'none',
      })
      if (answer.stopReason !== 'stop' && answer.stopReason !== 'length') {
        throw new Error(answer.errorMessage ?? `Model stopped: ${answer.stopReason}`)
      }
      return {
        text: answer.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join(''),
        usage: usageTotals(answer.usage),
        stopReason: answer.stopReason,
      }
    },
  }
}

/** Resolves the conversation's own model and key at the moment the server asks. */
export function samplingModelFor(
  conversation: Undef<ConversationSummary>,
  options: Pick<RuntimeManagerOptions, 'providers' | 'agent' | 'models'>,
): Undef<SamplingModel> {
  if (conversation === undefined) return undefined
  const choice = modelFor(options.providers, conversation)
  if (choice === undefined || options.agent.keyProblem(choice.providerId) !== undefined) return undefined
  const models =
    options.models?.() ??
    createModelRuntime({
      providers: options.providers.list(),
      credential: (id) => options.providers.credential(id),
    })
  return samplingModel(models, choice.providerId, choice.modelId)
}
