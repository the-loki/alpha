/** Files observed to have changed between the start and end of one agent run. */
export interface WorkspaceChange {
  /** Relative to the conversation's workspace, with `/` separators. */
  path: string
  kind: 'added' | 'modified' | 'deleted'
  /** Available only for small UTF-8 text files. */
  beforeText?: string
  afterText?: string
}

/** A comparison of actual workspace state, not an attribution to any particular tool. */
export interface WorkspaceChangeSet {
  id: string
  startedAt: number
  endedAt: number
  /** The process exited during the run, so the end was observed when the conversation reopened. */
  recovered: boolean
  /** Some paths could not be checked, so the list must not be read as exhaustive. */
  incomplete: boolean
  files: WorkspaceChange[]
}
