/**
 * The conversations that are open, and the index of the ones that are not. One runtime per open
 * conversation; everything else is read from the index file, so the sidebar costs one read.
 *
 * The manager also owns the bookkeeping the window should not have to do: a conversation takes
 * its title from the user's first message, its status follows the run, and its model is the
 * configured default until the user picks another.
 */

import {
  type ConversationSummary,
  DEFAULT_THINKING_LEVEL,
  type ModelStatus,
  type OpenedConversation,
  type RuntimeEvent,
  summarize,
  type ThinkingLevel,
  titleFromMessage,
  titleFromPath,
} from '@alpha/core'
import type { Api, Model } from '@earendil-works/pi-ai'
import { ConversationIndexStore } from '../conversations/index-store.ts'
import { createProviderModelRuntime } from '../providers/model-runtime.ts'
import type { ProviderStore } from '../providers/store.ts'
import { ConversationRuntime, findSessionMetadata, readTranscript } from './conversation-runtime.ts'
import { describeRuntime, type ModelRuntime, resolveModelRuntime } from './models.ts'
import { buildSystemPrompt } from './system-prompt.ts'

export interface RuntimeManagerOptions {
  dataDirectory: string
  sessionsRoot: string
  providers: ProviderStore
  env: NodeJS.ProcessEnv
  emit: (event: RuntimeEvent) => void
}

const DEFAULT_TITLE = 'New conversation'
const NO_MODEL: ConversationSummary['model'] = { providerId: '', modelId: '' }

export class RuntimeManager {
  readonly #options: RuntimeManagerOptions
  readonly #index: ConversationIndexStore
  readonly #open = new Map<string, ConversationRuntime>()
  readonly #named = new Set<string>()

  constructor(options: RuntimeManagerOptions) {
    this.#options = options
    this.#index = new ConversationIndexStore(options.dataDirectory)
  }

  list(): ConversationSummary[] {
    return this.#index.all()
  }

  modelStatus(): ModelStatus {
    return describeRuntime(this.#modelRuntime())
  }

  async create(workspacePath: string): Promise<OpenedConversation> {
    const now = Date.now()
    const model = this.#modelRuntime().defaultModel
    const opened = await this.#tryOpen({
      workspacePath,
      model,
      thinkingLevel: DEFAULT_THINKING_LEVEL,
      emit: (event) => this.#observe(event),
    })

    const conversation: ConversationSummary = {
      id: opened.conversationId,
      workspacePath,
      title: titleFromPath(workspacePath, DEFAULT_TITLE),
      createdAt: now,
      updatedAt: now,
      status: 'idle',
      model: model === undefined ? NO_MODEL : { providerId: model.provider, modelId: model.id },
      thinkingLevel: DEFAULT_THINKING_LEVEL,
    }
    if (opened.runtime !== undefined) this.#open.set(conversation.id, opened.runtime)
    this.#index.upsert(conversation)

    return { conversation, messages: opened.messages }
  }

  async open(id: string): Promise<OpenedConversation> {
    const conversation = this.#requireConversation(id)

    const existing = this.#open.get(id)
    if (existing !== undefined) return { conversation, messages: await existing.transcript() }

    const opened = await this.#tryOpen({
      conversationId: id,
      workspacePath: conversation.workspacePath,
      model: this.#modelFor(conversation),
      thinkingLevel: conversation.thinkingLevel,
      sessionMetadata: await findSessionMetadata({
        sessionsRoot: this.#options.sessionsRoot,
        workspacePath: conversation.workspacePath,
        conversationId: id,
      }),
      emit: (event) => this.#observe(event),
    })
    if (opened.runtime !== undefined) this.#open.set(id, opened.runtime)
    if (conversation.title !== DEFAULT_TITLE) this.#named.add(id)

    return { conversation, messages: opened.messages }
  }

  async prompt(id: string, text: string): Promise<void> {
    const conversation = this.#requireConversation(id)
    const runtime = this.#open.get(id)
    if (runtime !== undefined) {
      await runtime.prompt(text)
      return
    }
    if (this.#modelFor(conversation) === undefined) {
      throw new Error('No model is configured. Add a provider and a model in Settings first.')
    }
    await this.open(id)
    await this.#open.get(id)?.prompt(text)
  }

  async abort(id: string): Promise<void> {
    await this.#open.get(id)?.abort()
  }

  async setConversationModel(id: string, providerId: string, modelId: string): Promise<ConversationSummary> {
    const conversation = this.#requireConversation(id)
    const model = this.#modelRuntime().models.getModel(providerId, modelId)
    if (model === undefined) throw new Error(`${providerId} does not serve ${modelId}`)
    await this.#open.get(id)?.setModel(model)
    return this.#update(conversation, { model: { providerId, modelId } })
  }

  async setThinkingLevel(id: string, level: ThinkingLevel): Promise<ConversationSummary> {
    const conversation = this.#requireConversation(id)
    await this.#open.get(id)?.setThinkingLevel(level)
    return this.#update(conversation, { thinkingLevel: level })
  }

  async closeAll(): Promise<void> {
    for (const runtime of this.#open.values()) await runtime.close()
    this.#open.clear()
  }

  #requireConversation(id: string): ConversationSummary {
    const conversation = this.#index.find(id)
    if (conversation === undefined) throw new Error(`No conversation ${id}`)
    return conversation
  }

  #modelFor(conversation: ConversationSummary): Model<Api> | undefined {
    const runtime = this.#modelRuntime()
    const chosen = conversation.model
    if (chosen.providerId !== '' && chosen.modelId !== '') {
      const model = runtime.models.getModel(chosen.providerId, chosen.modelId)
      if (model !== undefined) return model
    }
    return runtime.defaultModel
  }

  /**
   * A conversation without a usable model still exists: its transcript stays readable and the
   * composer explains what is missing, rather than the window refusing to open it at all.
   */
  async #tryOpen(options: {
    conversationId?: string
    workspacePath: string
    model?: Model<Api>
    thinkingLevel: ThinkingLevel
    sessionMetadata?: Awaited<ReturnType<typeof findSessionMetadata>>
    emit: (event: RuntimeEvent) => void
  }): Promise<{ runtime?: ConversationRuntime; conversationId: string; messages: OpenedConversation['messages'] }> {
    const modelRuntime = this.#modelRuntime()
    const model = options.model ?? modelRuntime.defaultModel

    if (model === undefined) {
      const transcript = await readTranscript({
        sessionsRoot: this.#options.sessionsRoot,
        workspacePath: options.workspacePath,
        conversationId: options.conversationId ?? '',
      })
      return { conversationId: options.conversationId ?? crypto.randomUUID(), messages: transcript }
    }

    const opened = await ConversationRuntime.open({
      conversationId: options.conversationId,
      workspacePath: options.workspacePath,
      sessionsRoot: this.#options.sessionsRoot,
      modelRuntime,
      model,
      systemPrompt: buildSystemPrompt({ workspacePath: options.workspacePath }),
      sessionMetadata: options.sessionMetadata,
      emit: options.emit,
    })
    await opened.runtime.setThinkingLevel(options.thinkingLevel)
    return { runtime: opened.runtime, conversationId: opened.conversationId, messages: opened.messages }
  }

  #modelRuntime(): ModelRuntime {
    return resolveModelRuntime(this.#options.env, () => createProviderModelRuntime(this.#options.providers))
  }

  /** Bookkeeping that follows from what the runtime said, before the window hears about it. */
  #observe(event: RuntimeEvent): void {
    const conversation = this.#index.find(event.conversationId)
    if (conversation === undefined) {
      this.#options.emit(event)
      return
    }

    if (event.type === 'user_message' && !this.#named.has(event.conversationId)) {
      const text = event.message.blocks.map((block) => block.text).join(' ')
      this.#named.add(event.conversationId)
      this.#update(conversation, { title: titleFromMessage(text) })
    }

    if (event.type === 'turn_started') this.#update(conversation, { status: 'running' })
    if (event.type === 'turn_finished' || event.type === 'run_failed') this.#update(conversation, { status: 'idle' })

    this.#options.emit(event)
  }

  #update(conversation: ConversationSummary, changes: Partial<ConversationSummary>): ConversationSummary {
    const updated = summarize(conversation, changes)
    this.#index.upsert(updated)
    this.#options.emit({ conversationId: updated.id, type: 'conversation_updated', conversation: updated })
    return updated
  }
}
