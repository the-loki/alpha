import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { DEFAULT_COMPACTION_SETTINGS, estimateTokens } from '@earendil-works/pi-agent-core'
import { describe, expect, it } from 'vitest'
import { compactionDue, keptCountOf, tokensOf } from './compaction-policy.ts'

/**
 * The compaction decision without an agent: what a transcript says it occupies, how much of its
 * tail a summary leaves standing, and when the window is close enough to fold at all. What happens
 * once the answer is yes — summarizing, rewriting the live agent, writing the entry — needs pi's
 * model boundary and is tested where a runtime exists.
 */

const settings = { ...DEFAULT_COMPACTION_SETTINGS, reserveTokens: 4, keepRecentTokens: 0 }

/** An assistant message whose usage says it occupies this many context tokens. */
const said = (text: string, tokens: number): AgentMessage =>
  ({
    role: 'assistant',
    content: [{ type: 'text', text }],
    usage: { input: tokens, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: tokens, cost: {} },
  }) as unknown as AgentMessage

describe('[compaction] what a transcript occupies', () => {
  it('reads the largest assistant usage, and nothing else speaks for the context', () => {
    const spoken = [
      { role: 'user', content: [{ type: 'text', text: 'a question' }] },
      said('a short answer', 10),
      said('a longer answer', 400),
      { role: 'toolResult', toolCallId: 'call-1', content: [{ type: 'text', text: 'output' }], isError: false },
    ] as unknown as AgentMessage[]

    expect(tokensOf(spoken)).toBe(400)
  })

  it('answers zero for a transcript no assistant message ever measured', () => {
    expect(tokensOf([{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] as unknown as AgentMessage[])).toBe(
      0,
    )
    expect(tokensOf([])).toBe(0)
  })
})

describe('[compaction] the tail a summary leaves', () => {
  it('keeps nothing when the budget is nothing, and everything when it is past the transcript', () => {
    const messages = [said('one', 0), said('two', 0)]

    expect(keptCountOf(messages, 0)).toBe(0)
    expect(keptCountOf(messages, 1_000_000)).toBe(2)
  })

  it('keeps exactly the messages a budget pays for, counting from the end', () => {
    const messages = [said('one', 0), said('two', 0)]
    const last = messages[1] as AgentMessage
    const cost = estimateTokens(last)

    // The budget is the last message's own estimate: it fits, and the one before it does not.
    expect(keptCountOf(messages, cost)).toBe(1)
    expect(keptCountOf(messages, cost - 1)).toBe(0)
  })
})

describe('[compaction] the threshold', () => {
  it('is not due while the transcript fits, and due once it passes the window minus the reserve', () => {
    const small = [said('an answer', 10)]

    expect(compactionDue(small, 100, settings)).toBe(false)
    // The reserve is what makes the difference: the same 10 tokens against a window that leaves
    // no room for the summary it would write.
    expect(compactionDue(small, 12, settings)).toBe(true)
  })

  it('measures the largest usage, not the sum: a long conversation with one big report is due', () => {
    const messages = [said('one', 5), said('two', 5), said('three', 90)]

    expect(compactionDue(messages, 50, settings)).toBe(true)
  })
})
