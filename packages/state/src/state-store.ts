/**
 * The one file the workbench persists: the chosen workspace, the recent list, and the
 * permission level a new conversation starts at. It is written whole, after every change,
 * because it is a few hundred bytes and a partial write of a bigger file is a bug waiting.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyPersistedState, type PersistedState, parsePersistedState } from '@alpha/domain'

export class StateStore {
  private readonly path: string
  private state: PersistedState

  public constructor(dataDirectory: string) {
    this.path = join(dataDirectory, 'workbench-state.json')
    this.state = this.load()
  }

  public read(): PersistedState {
    return this.state
  }

  public write(next: PersistedState): PersistedState {
    this.state = next
    writeFileSync(this.path, JSON.stringify(next, null, 2), 'utf-8')
    return this.state
  }

  /** Which conversation is open, so the next launch can come back to it (T2). */
  public rememberConversation(id: string): void {
    this.write({ ...this.state, lastConversationId: id })
  }

  private load(): PersistedState {
    try {
      return parsePersistedState(readFileSync(this.path, 'utf-8'))
    } catch {
      return emptyPersistedState()
    }
  }
}
