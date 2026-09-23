/**
 * Alpha's own index of conversations: titles, ordering, and which workspace each belongs to.
 * The transcript is the JSONL session (ADR-0004); this is the sidebar's cheap read, written
 * whole on every change because it is small and a partial write of a bigger file is a bug.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  archiveConversation,
  type ConversationIndex,
  type ConversationSummary,
  emptyConversationIndex,
  findConversation,
  listForWorkspace,
  parseConversationIndex,
  removeConversation,
  type Undef,
  unarchiveConversation,
  upsertConversation,
} from '@alpha/domain'

export class ConversationIndexStore {
  private readonly path: string
  private index: ConversationIndex

  public constructor(dataDirectory: string) {
    this.path = join(dataDirectory, 'conversations.json')
    this.index = this.read()
  }

  public all(): ConversationSummary[] {
    return [...this.index.conversations]
  }

  public forWorkspace(workspacePath: string): ConversationSummary[] {
    return listForWorkspace(this.index, workspacePath)
  }

  public find(id: string): Undef<ConversationSummary> {
    return findConversation(this.index, id)
  }

  public upsert(conversation: ConversationSummary): ConversationSummary {
    this.index = upsertConversation(this.index, conversation)
    this.flush()
    return conversation
  }

  public remove(id: string): void {
    this.index = removeConversation(this.index, id)
    this.flush()
  }

  /** Putting it away, and taking it back out: the file is the only place the state lives. */
  public archive(id: string, at: number): void {
    this.index = archiveConversation(this.index, id, at)
    this.flush()
  }

  public unarchive(id: string): void {
    this.index = unarchiveConversation(this.index, id)
    this.flush()
  }

  private flush(): void {
    writeFileSync(this.path, JSON.stringify(this.index, null, 2), 'utf-8')
  }

  private read(): ConversationIndex {
    try {
      return parseConversationIndex(readFileSync(this.path, 'utf-8'))
    } catch {
      return emptyConversationIndex()
    }
  }
}
