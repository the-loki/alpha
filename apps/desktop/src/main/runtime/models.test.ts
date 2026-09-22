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

describe('[main] startProblem', () => {
  it('refuses a conversation with nothing to run on before anyone waits for a turn', () => {
    expect(startProblem({ index: { providers: [] }, keyProblem: noKeyProblem, pictures: 0 })).toContain(
      'No model is configured',
    )
  })

  it('starts a model-less conversation on the default, when there is one', () => {
    expect(startProblem({ index, keyProblem: noKeyProblem, pictures: 0 })).toBeUndefined()
  })

  it('passes the key problem through, named for the person rather than the vault', () => {
    expect(
      startProblem({
        index,
        keyProblem: () => 'no key for local',
        model: { providerId: 'local', modelId: 'local-7b' },
        pictures: 0,
      }),
    ).toBe('no key for local')
  })

  it('refuses a picture for a model that cannot read one, naming it', () => {
    const problem = startProblem({
      index,
      keyProblem: noKeyProblem,
      model: { providerId: 'local', modelId: 'local-7b' },
      pictures: 1,
    })
    expect(problem).toContain('local-7b does not take pictures')
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
