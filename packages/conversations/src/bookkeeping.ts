/**
 * The conversation index, and the bookkeeping that keeps it true: a conversation takes its title
 * from the user's first message, its status follows the run, and a rename is the user having the
 * last word. Everything the window sees in the sidebar comes from here.
 */
import {
  type ConversationModel,
  type ConversationSummary,
  canArchive,
  DEFAULT_THINKING_LEVEL,
  type PermissionLevel,
  type RuntimeEvent,
  summarize,
  titleFromMessage,
  titleFromPath,
  type Undef,
} from '@alpha/domain'
import { ConversationIndexStore } from './index-store.ts'

const DEFAULT_TITLE = 'New conversation'

export interface NewConversation {
  id: string
  workspacePath: string
  now: number
  permissionLevel: PermissionLevel
  /** What the conversation runs on; absent while nothing is configured. */
  model?: ConversationModel
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
    ...(summary.model === undefined ? {} : { model: summary.model }),
    thinkingLevel: DEFAULT_THINKING_LEVEL,
    // A conversation starts on a session of its own: the agent is told this id and writes the file
    // under it, so nothing has to be recorded for the first session — absence says exactly that.
  }
}

export interface BookkeeperOptions {
  dataDirectory: string
  emit: (event: RuntimeEvent) => void
}

export class ConversationBookkeeper {
  private readonly store: ConversationIndexStore
  private readonly emit: (event: RuntimeEvent) => void
  /** Conversations the user has named, so the first message does not rename them back. */
  private readonly named = new Set<string>()

  public constructor(options: BookkeeperOptions) {
    this.store = new ConversationIndexStore(options.dataDirectory)
    this.emit = options.emit
    this.endRunsNobodyIsDriving()
  }

  /**
   * The status the file was left in is not this process's to believe. A run in flight is state the
   * runtime holds (ADR-0008), so a conversation the index calls `running` or `waiting` at startup
   * was left that way by a process that is gone: the window would draw a working mark for a run
   * nobody is driving, and archiving would be refused until something finished a turn there. The
   * run that would have finished it no longer exists, so this is the only place the two can meet.
   */
  private endRunsNobodyIsDriving(): void {
    for (const conversation of this.store.all()) {
      if (conversation.status === 'idle') continue
      this.store.upsert({ ...conversation, status: 'idle' })
    }
  }

  public list(): ConversationSummary[] {
    return this.store.all()
  }

  public find(id: string): Undef<ConversationSummary> {
    return this.store.find(id)
  }

  public upsert(conversation: ConversationSummary): ConversationSummary {
    this.store.upsert(conversation)
    return conversation
  }

  public forget(id: string): void {
    this.store.remove(id)
    this.named.delete(id)
  }

  /** Stable, like a fork: the new conversation keeps the name it was given rather than the first message. */
  public markNamed(id: string): void {
    this.named.add(id)
  }

  public rename(id: string, title: string): ConversationSummary {
    const conversation = this.store.find(id)
    if (conversation === undefined) throw new Error(`No conversation ${id}`)
    this.named.add(id)
    return this.apply(conversation, { title: title.trim() })
  }

  /**
   * Putting a conversation away. Which section it lands in is the window's business (#79), but the
   * refusal is not: a conversation that is working or waiting on an approval is not archived,
   * because the card asking for that answer lives inside its transcript and folding it away hides
   * the one thing that needs a person. The window greys the action out for the same reason.
   */
  public archive(id: string): Undef<ConversationSummary> {
    const conversation = this.store.find(id)
    if (conversation === undefined || !canArchive(conversation)) return undefined
    return this.update(id, { archivedAt: Date.now() })
  }

  /**
   * Taking it back out. The key is removed rather than set to `undefined` — absent is how "not
   * archived" is spelled — and `update` with nothing to change is what re-reads and announces it.
   */
  public unarchive(id: string): ConversationSummary {
    this.store.unarchive(id)
    return this.update(id, {})
  }

  /** What the runtime said, before the window hears it. */
  public observe(event: RuntimeEvent): void {
    const conversation = this.store.find(event.conversationId)
    if (conversation === undefined) {
      this.emit(event)
      return
    }

    if (event.type === 'user_message' && !this.named.has(event.conversationId)) {
      const text = event.message.blocks.map((block) => (block.kind === 'text' ? block.text : '')).join(' ')
      this.named.add(event.conversationId)
      this.apply(conversation, { title: titleFromMessage(text) })
    }

    // A message means it is in use again, so it leaves the archived section (#79). After the
    // rename above, so the title and the unarchiving are not two answers about the same summary.
    if (event.type === 'user_message' && conversation.archivedAt !== undefined) this.unarchive(conversation.id)

    if (event.type === 'turn_started') this.apply(conversation, { status: 'running' })
    // Waiting on a person is neither working nor finished, and the sidebar says which it is.
    if (event.type === 'approval_requested') this.apply(conversation, { status: 'waiting' })
    if (event.type === 'approval_decided') this.apply(conversation, { status: 'running' })
    if (event.type === 'turn_finished' || event.type === 'run_failed') this.apply(conversation, { status: 'idle' })

    this.emit(event)
  }

  /**
   * The one road a summary change takes: written to the index, and told to the window. Every
   * field — the title, the level, the model, the thinking effort, the status — goes through here,
   * so the window's copy is never a partial answer and never has to be assembled by its caller.
   */
  public update(id: string, changes: Partial<ConversationSummary>): ConversationSummary {
    const conversation = this.store.find(id)
    if (conversation === undefined) throw new Error(`No conversation ${id}`)
    return this.apply(conversation, changes)
  }

  private apply(conversation: ConversationSummary, changes: Partial<ConversationSummary>): ConversationSummary {
    const updated = summarize(conversation, changes)
    this.store.upsert(updated)
    this.emit({ conversationId: updated.id, type: 'conversation_updated', conversation: updated })
    return updated
  }
}

export { DEFAULT_TITLE }
