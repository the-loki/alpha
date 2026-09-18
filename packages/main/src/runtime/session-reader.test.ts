import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openSession } from './session-reader.ts'

/**
 * The reader's own contract, away from the runtime: which session a conversation is, and what
 * happens when it is not there yet.
 */
const locationFor = (conversationId: string) => ({
  sessionsRoot: mkdtempSync(join(tmpdir(), 'alpha-sessions-')),
  workspacePath: mkdtempSync(join(tmpdir(), 'alpha-workspace-')),
  conversationId,
})

describe('[runtime] opening a session', () => {
  it('creates it under the id it was asked for', async () => {
    // The workbench mints the id before the session exists, so the two have to agree: a ledger
    // opened for that id writes beside a conversation whose session is stored under another.
    const location = locationFor('conversation-1')
    const created = await openSession(location, { create: true })
    expect(created?.session.metadata.id).toBe('conversation-1')
    await created?.close()

    const reopened = await openSession(location)
    expect(reopened?.session.metadata.id).toBe('conversation-1')
    await reopened?.close()
  })

  it('reports a conversation that has never run as absent rather than empty', async () => {
    expect(await openSession(locationFor('never-run'))).toBeUndefined()
  })
})
