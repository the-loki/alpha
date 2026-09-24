import { aModel, textStream } from '@alpha/agent/testing'
import { createModels, type Message, type Provider } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { samplingModel } from './sampling-model.ts'

describe('[main] MCP sampling model', () => {
  it('calls the configured pi model with only approved text and records provider usage', async () => {
    const models = createModels()
    let seen: { messages: Message[]; maxTokens?: number; toolChoice?: string } | undefined
    const run: Provider['streamSimple'] = (_model, context, options) => {
      seen = { messages: context.messages, maxTokens: options?.maxTokens, toolChoice: options?.toolChoice }
      return textStream('Generated answer')
    }
    models.setProvider({
      id: 'p',
      name: 'P',
      getModels: () => [aModel()],
      auth: { apiKey: { name: 'test', resolve: async () => ({ auth: { apiKey: 'k' }, source: 'test' }) } },
      stream: () => textStream('Generated answer'),
      streamSimple: run,
    })
    const selected = samplingModel(models, 'p', 'm')
    if (selected === undefined) throw new Error('model was not selected')
    const result = await selected.generate(
      {
        messages: [
          { role: 'user', text: 'Edited request' },
          { role: 'assistant', text: 'Prior server text' },
        ],
        systemPrompt: 'Server instruction',
        maxTokens: 80,
        requestedContext: true,
        hints: [],
      },
      new AbortController().signal,
    )
    expect(seen?.messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant'])
    expect(JSON.stringify(seen?.messages)).toContain('Edited request')
    expect(JSON.stringify(seen?.messages)).not.toContain('PRIVATE CONVERSATION HISTORY')
    expect(seen).toMatchObject({ maxTokens: 80, toolChoice: 'none' })
    expect(result).toEqual({
      text: 'Generated answer',
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: 0,
      },
      stopReason: 'stop',
    })
  })
})
