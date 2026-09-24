import { describe, expect, it } from 'vitest'
import { startProblem } from './models.ts'

const index = {
  providers: [
    {
      id: 'local',
      name: 'Local',
      api: 'openai-completions' as const,
      baseUrl: 'https://local.example/v1',
      models: [
        { id: 'local-7b', name: 'Local 7B', contextWindow: 32000, maxTokens: 4096, reasoning: false, images: false },
        {
          id: 'local-vision',
          name: 'Local Vision',
          contextWindow: 32000,
          maxTokens: 4096,
          reasoning: false,
          images: true,
        },
      ],
    },
  ],
}

const noKeyProblem = (): undefined => undefined

describe('[providers] startProblem', () => {
  it('refuses a conversation with nothing to run on, as a case rather than a sentence', () => {
    expect(startProblem({ index: { providers: [] }, keyProblem: noKeyProblem, pictures: 0 })).toEqual({
      kind: 'no-model',
    })
  })

  it('starts a model-less conversation on the default, when there is one', () => {
    expect(startProblem({ index, keyProblem: noKeyProblem, pictures: 0 })).toBeUndefined()
  })

  it('passes the key refusal through, named for the person rather than the vault', () => {
    expect(
      startProblem({
        index,
        keyProblem: () => ({ kind: 'no-key', providerId: 'local' }),
        model: { providerId: 'local', modelId: 'local-7b' },
        pictures: 0,
      }),
    ).toEqual({ kind: 'no-key', providerId: 'local' })
  })

  it('refuses a picture for a model that cannot read one, naming the model the person chose', () => {
    expect(
      startProblem({
        index,
        keyProblem: noKeyProblem,
        model: { providerId: 'local', modelId: 'local-7b' },
        pictures: 1,
      }),
    ).toEqual({ kind: 'pictures', model: 'Local 7B' })
  })

  it('says nothing when the model is served, keyed, and takes what is attached', () => {
    expect(
      startProblem({
        index,
        keyProblem: noKeyProblem,
        model: { providerId: 'local', modelId: 'local-vision' },
        pictures: 1,
      }),
    ).toBeUndefined()
  })
})
