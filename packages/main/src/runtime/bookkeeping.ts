/**
 * The conversation index, and the bookkeeping that keeps it true: a conversation takes its title
 * from the user's first message, its status follows the run, and a rename is the user having the
 * last word. Everything the window sees in the sidebar comes from here.
 */
import {
  type ConversationSummary,
  DEFAULT_THINKING_LEVEL,
  type PermissionLevel,
  type RuntimeEvent,
  summarize,
  titleFromMessage,
  titleFromPath,
} from '@alpha/core'
import { ConversationIndexStore } from '../conversations/index-store.ts'

const DEFAULT_TITLE = 'New conversation'

/** What a conversation is called while its model is still unconfigured. */
export const NO_MODEL: ConversationSummary['model'] = { providerId: '', modelId: '' }

export interface NewConversation {
  id: string
  workspacePath: string
  now: number
  permissionLevel: PermissionLevel
  model: ConversationSummary['model']
}

/** A conversation as it exists before anything has been said in it. */
export function newConversation(summary: NewConversation): ConversationSummary {
  return {
    id: summary.id,
    workspacePath: summary.workspacePath,
    title: titleFromPath(summary.workspacePath, DEFAULT_TITLE),
    createdAt: summary.now,
    updatedAt: summary.now,
    status: 'idle',
    permissionLevel: summary.permissionLevel,
    model: summary.model,
    thinkingLevel: DEFAULT_THINKING_LEVEL,
  }
}

export interface BookkeeperOptions {
  dataDirectory: string
  emit: (event: RuntimeEvent) => void
}

export class ConversationBookkeeper {
  readonly #store: ConversationIndexStore
  readonly #emit: (event: RuntimeEvent) => void
  /** Conversations the user has named, so the first message does not rename them back. */
  readonly #named = new Set<string>()

  constructor(options: BookkeeperOptions) {
    this.#store = new ConversationIndexStore(options.dataDirectory)
    this.#emit = options.emit
  }

  list(): ConversationSummary[] {
    return this.#store.all()
  }

  find(id: string): ConversationSummary | undefined {
    return this.#store.find(id)
  }

  upsert(conversation: ConversationSummary): ConversationSummary {
    this.#store.upsert(conversation)
    return conversation
  }

  forget(id: string): void {
    this.#store.remove(id)
    this.#named.delete(id)
  }

  /** Stable, like a fork: the new conversation keeps the name it was given rather than the first message. */
  markNamed(id: string): void {
    this.#named.add(id)
  }

  rename(id: string, title: string): ConversationSummary {
    const conversation = this.#store.find(id)
    if (conversation === undefined) throw new Error(`No conversation ${id}`)
    this.#named.add(id)
    return this.#update(conversation, { title: title.trim() })
  }

  /** What the runtime said, before the window hears it. */
  observe(event: RuntimeEvent): void {
    const conversation = this.#store.find(event.conversationId)
    if (conversation === undefined) {
      this.#emit(event)
      return
    }

    if (event.type === 'user_message' && !this.#named.has(event.conversationId)) {
      const text = event.message.blocks.map((block) => (block.kind === 'text' ? block.text : '')).join(' ')
      this.#named.add(event.conversationId)
      this.#update(conversation, { title: titleFromMessage(text) })
    }

    if (event.type === 'turn_started') this.#update(conversation, { status: 'running' })
    // Waiting on a person is neither working nor finished, and the sidebar says which it is.
    if (event.type === 'approval_requested') this.#update(conversation, { status: 'waiting' })
    if (event.type === 'approval_decided') this.#update(conversation, { status: 'running' })
    if (event.type === 'turn_finished' || event.type === 'run_failed') this.#update(conversation, { status: 'idle' })

    this.#emit(event)
  }

  #update(conversation: ConversationSummary, changes: Partial<ConversationSummary>): ConversationSummary {
    const updated = summarize(conversation, changes)
    this.#store.upsert(updated)
    this.#emit({ conversationId: updated.id, type: 'conversation_updated', conversation: updated })
    return updated
  }
}

export { DEFAULT_TITLE }
