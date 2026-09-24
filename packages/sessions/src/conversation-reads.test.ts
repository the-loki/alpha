import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConversationReads } from './conversation-reads.ts'
import { SessionStore } from './sessions.ts'

/**
 * The seam: a conversation's reads over a real store on disk, addressed by the conversation's id
 * alone. The address is the whole subject — which session it is on, and where that session's
 * workspace is — so these tests are about a conversation whose session is not the one named after
 * it: the session a fork moved it to.
 */

const roots: string[] = []

function aRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'alpha-sessions-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Two sessions of one workspace: what a conversation was on, and what a fork moved it to. */
function twoSessions(): { store: SessionStore; workspace: string } {
  const store = new SessionStore(aRoot())
  const workspace = join(aRoot(), 'workspace')
  const said = (sessionId: string, text: string) =>
    store.append({
      sessionId,
      workspacePath: workspace,
      entry: { type: 'message', message: { role: 'user', content: [{ type: 'text', text }], timestamp: 1 } },
    })
  const answered = (sessionId: string, text: string) => {
    // Built as a value rather than written at the call: an entry message carries more than the
    // transcript draws (the usage a run reported), and only the drawn fields are typed.
    const message = {
      role: 'assistant',
      content: [{ type: 'text', text }],
      timestamp: 2,
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: 0 },
      stopReason: 'stop',
    }
    store.append({ sessionId, workspacePath: workspace, entry: { type: 'message', message } })
  }
  said('c1', 'the replaced question')
  said('c1-fork', 'the moved question')
  said('c1-fork', 'the question after the move')
  answered('c1-fork', 'the answer that followed it')
  return { store, workspace }
}

describe('[sessions] reading a conversation', () => {
  it('reads the session the conversation is on, which a fork moves', () => {
    const { store, workspace } = twoSessions()
    const conversation = { id: 'c1', sessionId: 'c1-fork', workspacePath: workspace }
    const reads = new ConversationReads({ conversation: () => conversation, store })

    // The session named after the conversation is a different session with different words, so a
    // reader that answers from the conversation's own id is visible here rather than merely wrong.
    expect(reads.transcript('c1')).toEqual(store.transcript('c1-fork', workspace))
    expect(reads.transcript('c1')).not.toEqual(store.transcript('c1', workspace))
  })

  it("answers all three reads from that one session: the transcript, the usage, the user's own", () => {
    const { store, workspace } = twoSessions()
    const reads = new ConversationReads({
      conversation: () => ({ id: 'c1', sessionId: 'c1-fork', workspacePath: workspace }),
      store,
    })

    expect(reads.transcript('c1')).toEqual(store.transcript('c1-fork', workspace))
    expect(reads.usage('c1')).toEqual(store.usage('c1-fork', workspace))
    expect(reads.userEntries('c1')).toEqual(store.userEntries('c1-fork', workspace))
    // The session named after the conversation holds one message and no usage, so a read that
    // answered from it would be short here rather than merely different.
    expect(reads.usage('c1').totalTokens).toBe(15)
    expect(reads.userEntries('c1')).toHaveLength(2)
  })

  it('answers for a conversation that has not named a session yet, which is its own id', () => {
    const root = aRoot()
    const workspace = join(root, 'workspace')
    const store = new SessionStore(root)
    store.append({
      sessionId: 'c1',
      workspacePath: workspace,
      entry: { type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'the first turn' }] } },
    })
    const reads = new ConversationReads({ conversation: () => ({ id: 'c1', workspacePath: workspace }), store })

    expect(reads.transcript('c1')).toHaveLength(1)
  })
})
