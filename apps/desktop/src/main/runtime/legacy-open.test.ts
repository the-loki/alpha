import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scriptedModels, textStream } from '@alpha/agent/testing'
import type { ConversationSummary } from '@alpha/domain'
import { CredentialVault, ProviderStore, type SecretCipher } from '@alpha/providers'
import { DecisionLog, SessionStore, sessionDirectoryFor } from '@alpha/sessions'
import { describe, expect, it } from 'vitest'
import { openRuntime } from './assemble-runtime.ts'

const cipher: SecretCipher = {
  available: true,
  encrypt: (text) => text,
  decrypt: (text) => text,
}

describe('[runtime] opening a previous Alpha conversation', () => {
  it('continues its old transcript across reopen without copying it again', async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-legacy-data-'))
    const workspacePath = mkdtempSync(join(tmpdir(), 'alpha-legacy-workspace-'))
    const sessionsRoot = join(dataDirectory, 'sessions')
    const directory = sessionDirectoryFor(sessionsRoot, workspacePath)
    mkdirSync(directory, { recursive: true })
    const oldFile = join(directory, '2023-01-01T00-00-00-000Z_c1.jsonl')
    const oldContent = `${[
      { v: 4, kind: 'header', id: 'c1', cwd: workspacePath, createdAt: 1_700_000_000_000 },
      {
        seq: 1,
        kind: 'entry',
        id: 'old-user',
        parentId: null,
        type: 'message',
        message: { role: 'user', content: [{ type: 'text', text: 'old question' }], timestamp: 1 },
      },
      {
        seq: 2,
        kind: 'entry',
        id: 'old-answer',
        parentId: 'old-user',
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'old answer' }],
          api: 'openai-completions',
          provider: 'p',
          model: 'm',
          stopReason: 'stop',
          timestamp: 2,
        },
      },
    ]
      .map((line) => JSON.stringify(line))
      .join('\n')}\n`
    writeFileSync(oldFile, oldContent, 'utf-8')

    const providers = new ProviderStore(dataDirectory, new CredentialVault(dataDirectory, cipher))
    providers.save({
      id: 'p',
      name: 'Scripted',
      api: 'openai-completions',
      baseUrl: 'https://llm.internal.example/v1',
      models: [{ id: 'm', name: 'M', contextWindow: 32_000, maxTokens: 4_096, reasoning: false, images: false }],
    })
    const conversation: ConversationSummary = {
      id: 'c1',
      workspacePath,
      title: 'Old conversation',
      createdAt: 1,
      updatedAt: 1,
      status: 'idle',
      permissionLevel: 'ask',
      model: { providerId: 'p', modelId: 'm' },
      thinkingLevel: 'off',
    }
    const sessions = new SessionStore(sessionsRoot)
    const options = {
      conversation,
      sessions,
      sessionsRoot,
      providers,
      models: () => scriptedModels([() => textStream('new answer')]),
      decisions: new DecisionLog(dataDirectory).opened('c1'),
      permissions: () => ({
        level: () => 'ask' as const,
        rules: () => [],
        remember: () => undefined,
        ask: async () => ({ decision: 'deny' as const }),
      }),
      emit: () => {},
    }

    const first = await openRuntime(options)
    await first.prompt('new question')
    await first.settle()
    await first.close()

    const second = await openRuntime(options)
    await second.prompt('another question')
    await second.settle()
    await second.close()

    const texts = sessions
      .transcript('c1', workspacePath)
      .flatMap((message) => message.blocks.flatMap((block) => (block.kind === 'text' ? [block.text] : [])))
    expect(texts).toEqual([
      'old question',
      'old answer',
      'new question',
      'new answer',
      'another question',
      'new answer',
    ])
    expect(readFileSync(oldFile, 'utf-8')).toBe(oldContent)
    expect(readdirSync(directory)).toHaveLength(2)
  })
})
