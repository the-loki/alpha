import { describe, expect, it, vi } from 'vitest'
import { runningModel } from './next-message.ts'

const state = vi.hoisted(() => ({ activeId: '', summary: undefined as unknown }))

vi.mock('./conversations.ts', () => ({
  conversations: {
    get activeId() {
      return state.activeId
    },
    transcript: {
      get summary() {
        return state.summary
      },
    },
  },
  conversationActions: {},
}))
vi.mock('./providers.ts', () => ({
  providers: {
    snapshot: {
      providers: [
        {
          id: 'local',
          models: [{ id: 'default', name: 'Default model', images: false }],
        },
      ],
      defaultModel: { providerId: 'local', modelId: 'default' },
    },
  },
  providerActions: {},
}))
vi.mock('./shell.ts', () => ({ shell: {}, shellActions: {} }))

describe('[renderer] the model at the composer', () => {
  it('uses the default for a new conversation and no substitute for a missing saved choice', () => {
    const model = runningModel()
    expect(model.chosen()).toEqual({ providerId: 'local', modelId: 'default' })

    state.activeId = 'existing'
    state.summary = { model: { providerId: 'local', modelId: 'removed' } }
    expect(model.chosen()).toBeUndefined()
    expect(model.name()).toBeUndefined()
  })
})
