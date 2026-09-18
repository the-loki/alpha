/**
 * The conversations that are open, and the index of the ones that are not. One runtime per open
 * conversation; everything else is read from the index file, so the sidebar costs one read.
 *
 * The manager also owns the two pieces of bookkeeping the window should not have to do: a
 * conversation takes its title from the user's first message, and its status follows the run.
 */
import {
  type ConversationSummary,
  type OpenedConversation,
  type RuntimeEvent,
  summarize,
  titleFromMessage,
  titleFromPath,
} from '@alpha/core'
import { ConversationIndexStore } from '../conversations/index-store.ts'
import { ConversationRuntime, findSessionMetadata } from './conversation-runtime.ts'
import type { ModelRuntime } from './models.ts'
import { buildSystemPrompt } from './system-prompt.ts'

export interface RuntimeManagerOptions {
  dataDirectory: string
  sessionsRoot: string
  modelRuntime: () => ModelRuntime
  emit: (event: RuntimeEvent) => void
}

const DEFAULT_TITLE = 'New conversation'

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

  async create(workspacePath: string): Promise<OpenedConversation> {
    const now = Date.now()
    const opened = await ConversationRuntime.open({
      workspacePath,
      sessionsRoot: this.#options.sessionsRoot,
      modelRuntime: this.#options.modelRuntime(),
      systemPrompt: buildSystemPrompt({ workspacePath }),
      emit: (event) => this.#observe(event),
    })

    const conversation: ConversationSummary = {
      id: opened.conversationId,
      workspacePath,
      title: titleFromPath(workspacePath, DEFAULT_TITLE),
      createdAt: now,
      updatedAt: now,
      status: 'idle',
    }
    this.#open.set(conversation.id, opened.runtime)
    this.#index.upsert(conversation)

    return { conversation, messages: opened.messages }
  }

  async open(id: string): Promise<OpenedConversation> {
    const conversation = this.#index.find(id)
    if (conversation === undefined) throw new Error(`No conversation ${id}`)

    const existing = this.#open.get(id)
    if (existing !== undefined) {
      const messages = await messagesOf(existing)
      return { conversation, messages }
    }

    const sessionMetadata = await findSessionMetadata({
      sessionsRoot: this.#options.sessionsRoot,
      workspacePath: conversation.workspacePath,
      conversationId: id,
    })

    const opened = await ConversationRuntime.open({
      conversationId: id,
      workspacePath: conversation.workspacePath,
      sessionsRoot: this.#options.sessionsRoot,
      modelRuntime: this.#options.modelRuntime(),
      systemPrompt: buildSystemPrompt({ workspacePath: conversation.workspacePath }),
      sessionMetadata,
      emit: (event) => this.#observe(event),
    })
    this.#open.set(id, opened.runtime)
    if (conversation.title !== DEFAULT_TITLE) this.#named.add(id)

    return { conversation, messages: opened.messages }
  }

  async prompt(id: string, text: string): Promise<void> {
    const runtime = await this.#runtimeFor(id)
    await runtime.prompt(text)
  }

  async abort(id: string): Promise<void> {
    await this.#open.get(id)?.abort()
  }

  async closeAll(): Promise<void> {
    for (const runtime of this.#open.values()) await runtime.close()
    this.#open.clear()
  }

  async #runtimeFor(id: string): Promise<ConversationRuntime> {
    const existing = this.#open.get(id)
    if (existing !== undefined) return existing
    await this.open(id)
    const opened = this.#open.get(id)
    if (opened === undefined) throw new Error(`Conversation ${id} could not be opened`)
    return opened
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

  #update(conversation: ConversationSummary, changes: Partial<ConversationSummary>): void {
    const updated = summarize(conversation, changes)
    this.#index.upsert(updated)
    this.#options.emit({ conversationId: updated.id, type: 'conversation_updated', conversation: updated })
  }
}

async function messagesOf(runtime: ConversationRuntime): Promise<OpenedConversation['messages']> {
  return runtime.transcript()
}
