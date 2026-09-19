/**
 * Alpha's own index of conversations: titles, ordering, and which workspace each belongs to.
 * The transcript is the JSONL session (ADR-0004); this is the sidebar's cheap read, written
 * whole on every change because it is small and a partial write of a bigger file is a bug.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ConversationIndex,
  type ConversationSummary,
  emptyConversationIndex,
  findConversation,
  listForWorkspace,
  parseConversationIndex,
  removeConversation,
  type Undef,
  upsertConversation,
} from '@alpha/core'

export class ConversationIndexStore {
  readonly #path: string
  #index: ConversationIndex

  constructor(dataDirectory: string) {
    this.#path = join(dataDirectory, 'conversations.json')
    this.#index = this.#read()
  }

  all(): ConversationSummary[] {
    return [...this.#index.conversations]
  }

  forWorkspace(workspacePath: string): ConversationSummary[] {
    return listForWorkspace(this.#index, workspacePath)
  }

  find(id: string): Undef<ConversationSummary> {
    return findConversation(this.#index, id)
  }

  upsert(conversation: ConversationSummary): ConversationSummary {
    this.#index = upsertConversation(this.#index, conversation)
    this.#flush()
    return conversation
  }

  remove(id: string): void {
    this.#index = removeConversation(this.#index, id)
    this.#flush()
  }

  #flush(): void {
    writeFileSync(this.#path, JSON.stringify(this.#index, null, 2), 'utf-8')
  }

  #read(): ConversationIndex {
    try {
      return parseConversationIndex(readFileSync(this.#path, 'utf-8'))
    } catch {
      return emptyConversationIndex()
    }
  }
}
