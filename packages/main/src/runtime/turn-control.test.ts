import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuntimeEvent } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { ConversationRuntime } from './conversation-runtime.ts'
import { resolveModelRuntime } from './models.ts'

/**
 * Turn control, through a real harness: stopping mid-stream, redirecting the agent while it works,
 * queueing behind the turn, and answering a message again. The scripted model makes the timing
 * decidable, so "mid-flight" is a fact of the test rather than a race.
 */
const open = async (options: { replies: unknown[]; workspace?: string; sessionsRoot?: string; slow?: boolean }) => {
  const workspace = options.workspace ?? mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  const events: RuntimeEvent[] = []
  const opened = await ConversationRuntime.open({
    conversationId: 'turn',
    workspacePath: workspace,
    sessionsRoot: options.sessionsRoot ?? mkdtempSync(join(tmpdir(), 'alpha-sessions-')),
    modelRuntime: resolveModelRuntime({
      ALPHA_FAUX: '1',
      ALPHA_FAUX_REPLIES: JSON.stringify(options.replies),
      // Slow, in small pieces: "while it is working" becomes a fact rather than a race.
      ...(options.slow === true ? { ALPHA_FAUX_TOKENS_PER_SECOND: '20', ALPHA_FAUX_TOKEN_SIZE: '4' } : {}),
    }),
    systemPrompt: 'You are Alpha.',
    emit: (event) => events.push(event),
  })
  return { ...opened, events, workspace }
}

const userTexts = (messages: { role: string; blocks: unknown[] }[]): string[] =>
  messages
    .filter((message) => message.role === 'user')
    .flatMap((message) =>
      message.blocks.map((block) => ('text' in (block as object) ? (block as { text: string }).text : '')),
    )

/** Waits for a number of streamed pieces to arrive, which is the sign the run is under way. */
const waitForDeltas = async (events: RuntimeEvent[], count: number): Promise<void> => {
  await waitFor(() => events.filter((event) => event.type === 'assistant_text_delta').length >= count)
}

const waitFor = async (predicate: () => boolean, timeoutMs = 4000): Promise<void> => {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for the condition')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('[runtime] stopping a turn', () => {
  it('keeps the part of the answer that arrived, and marks it interrupted', async () => {
    const { runtime, events } = await open({
      slow: true,
      replies: ['A long answer that keeps going and going until somebody stops it.'],
    })

    const running = runtime.prompt('write me an essay')
    await waitForDeltas(events, 2)
    await runtime.abort()
    await running

    const deltas = events.filter((event) => event.type === 'assistant_text_delta')
    expect(deltas.length).toBeGreaterThan(0)
    expect(deltas.length).toBeLessThan(17)
    const finished = events.find((event) => event.type === 'assistant_message_finished')
    expect(finished?.type === 'assistant_message_finished' && finished.interrupted).toBe(true)
    expect(events.some((event) => event.type === 'turn_finished')).toBe(true)
  })

  it('is not an error: the conversation goes idle and takes another prompt', async () => {
    const { runtime, events } = await open({ slow: true, replies: ['First answer, cut short.', 'Second answer.'] })

    const running = runtime.prompt('first')
    await waitForDeltas(events, 1)
    await runtime.abort()
    await running

    expect(events.some((event) => event.type === 'run_failed')).toBe(false)
    await runtime.prompt('second')
    await runtime.close()

    const texts = events.filter((event) => event.type === 'assistant_text_delta').map((event) => event.delta)
    expect(texts.join('')).toContain('Second answer.')
  })

  it('keeps the interrupted answer and its marker in the transcript', async () => {
    const { runtime, events } = await open({ slow: true, replies: ['Something long enough to interrupt mid-way.'] })

    const running = runtime.prompt('go')
    await waitForDeltas(events, 2)
    await runtime.abort()
    await running
    const transcript = await runtime.transcript()
    await runtime.close()

    const assistant = transcript.find((message) => message.role === 'assistant')
    expect(assistant?.status).toBe('interrupted')
    expect(assistant?.blocks.length).toBeGreaterThan(0)
  })
})

describe('[runtime] closing a conversation', () => {
  it('stops the run it was in the middle of, so the next open can edit', async () => {
    const sessionsRoot = mkdtempSync(join(tmpdir(), 'alpha-sessions-'))
    const first = await open({ slow: true, sessionsRoot, replies: ['An answer still arriving when it closed.'] })
    const running = first.runtime.prompt('a long task')
    await waitForDeltas(first.events, 1)
    // No Stop first: the window going away is what interrupts the turn.
    await first.runtime.close()
    await running.catch(() => undefined)

    const second = await open({ workspace: first.workspace, sessionsRoot, replies: ['The corrected answer.'] })
    const resent = await second.runtime.resend(0, 'a better question')
    await second.runtime.close()

    expect(resent).toBe(true)
  })
})

describe('[runtime] steering and queueing', () => {
  it('delivers a steer while a tool is running, and it changes what happens next', async () => {
    const { runtime, events } = await open({
      replies: [{ tool: { name: 'bash', args: { command: 'sleep 0.6' } } }, 'Redirected answer.'],
    })

    const running = runtime.prompt('do the thing')
    await waitFor(() => events.some((event) => event.type === 'tool_started'))
    await runtime.steer('actually, do the other thing')
    await running
    const transcript = await runtime.transcript()
    await runtime.close()

    // The steer sits between the tool call and the answer that follows it: the agent read it
    // before deciding what to do next, rather than finishing and starting a second turn.
    const shape = transcript.map(
      (message) =>
        `${message.role}:${message.blocks.map((block) => ('text' in block ? block.text : block.kind)).join(',')}`,
    )
    expect(shape).toEqual([
      'user:do the thing',
      'assistant:tool',
      'user:actually, do the other thing',
      'assistant:Redirected answer.',
    ])
    expect(events.filter((event) => event.type === 'turn_finished')).toHaveLength(1)
  })

  it('holds a queued message until the turn it was queued behind ends', async () => {
    const { runtime, events } = await open({
      replies: [{ tool: { name: 'bash', args: { command: 'sleep 0.4' } } }, 'The first answer.', 'The queued answer.'],
    })

    const running = runtime.prompt('first task')
    await waitFor(() => events.some((event) => event.type === 'tool_started'))
    await runtime.followUp('then do this')
    await waitFor(() => events.some((event) => event.type === 'queue_updated' && event.queued.length === 1))

    const pending = events.flatMap((event) => (event.type === 'queue_updated' ? event.queued : []))
    expect(pending.some((item) => item.text === 'then do this')).toBe(true)

    await running
    const transcript = await runtime.transcript()
    await runtime.close()

    // Unlike a steer, the queued message waits: the answer to the first task is written first.
    const shape = transcript.map(
      (message) =>
        `${message.role}:${message.blocks.map((block) => ('text' in block ? block.text : block.kind)).join(',')}`,
    )
    expect(shape).toEqual([
      'user:first task',
      'assistant:tool',
      'assistant:The first answer.',
      'user:then do this',
      'assistant:The queued answer.',
    ])
  })

  it('takes a queued message back when it is cancelled before the turn ends', async () => {
    const { runtime, events } = await open({
      replies: [{ tool: { name: 'bash', args: { command: 'sleep 0.6' } } }, 'The only answer.'],
    })

    const running = runtime.prompt('first task')
    await waitFor(() => events.some((event) => event.type === 'tool_started'))
    await runtime.followUp('never mind this')
    await waitFor(() => events.some((event) => event.type === 'queue_updated' && event.queued.length === 1))
    const queued = events.find((event) => event.type === 'queue_updated' && event.queued.length === 1)
    await runtime.cancelQueued(queued?.type === 'queue_updated' ? queued.queued[0].entryId : '')
    await waitFor(() => events.some((event) => event.type === 'queue_updated' && event.queued.length === 0))

    await running
    const transcript = await runtime.transcript()
    await runtime.close()

    expect(userTexts(transcript)).toEqual(['first task'])
  })
})

describe('[runtime] whether a turn is in flight', () => {
  it('is asked of the lane: idle before a prompt, working during it, idle after it', async () => {
    const { runtime, events } = await open({ slow: true, replies: ['An answer long enough to catch it working.'] })

    expect(runtime.isRunning()).toBe(false)
    const running = runtime.prompt('go')
    await waitForDeltas(events, 1)
    expect(runtime.isRunning()).toBe(true)

    await running
    expect(runtime.isRunning()).toBe(false)
    await runtime.close()
  })
})

describe('[runtime] answering a message again', () => {
  it('replaces the previous answer with a new one from the same question', async () => {
    const { runtime, events } = await open({ replies: ['The first answer.', 'The second answer.'] })

    await runtime.prompt('what is the plan')
    const regenerated = await runtime.regenerate()
    const transcript = await runtime.transcript()
    await runtime.close()

    expect(regenerated).toBe(true)
    const texts = events.filter((event) => event.type === 'assistant_text_delta').map((event) => event.delta)
    expect(texts.join('')).toBe('The first answer.The second answer.')

    const assistantText = transcript
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => message.blocks.filter((block) => block.kind === 'text').map((block) => block.text))
    // The transcript holds one question and one answer: the replaced answer left the path.
    expect(assistantText).toEqual(['The second answer.'])
    expect(userTexts(transcript)).toEqual(['what is the plan'])
  })

  it('replaces an earlier message and everything after it', async () => {
    const { runtime, events } = await open({ replies: ['First answer.', 'Second answer.', 'The corrected answer.'] })

    await runtime.prompt('first question')
    await runtime.prompt('second question')
    const resent = await runtime.resend(0, 'first question, corrected')
    const transcript = await runtime.transcript()
    await runtime.close()

    expect(resent).toBe(true)
    expect(userTexts(transcript)).toEqual(['first question, corrected'])
    const assistantText = transcript
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => message.blocks.filter((block) => block.kind === 'text').map((block) => block.text))
    expect(assistantText).toEqual(['The corrected answer.'])
    expect(events.some((event) => event.type === 'assistant_text_delta')).toBe(true)
  })

  it('edits a conversation whose last run died with the process', async () => {
    // Closed mid-stream, so the lane still holds the operation nobody is driving. Asking for the
    // edit is what proves it was settled: a lane with an active operation refuses to navigate.
    const sessionsRoot = mkdtempSync(join(tmpdir(), 'alpha-sessions-'))
    const first = await open({ slow: true, sessionsRoot, replies: ['An answer still arriving when the app went.'] })
    const running = first.runtime.prompt('a long task')
    await waitForDeltas(first.events, 1)
    await first.runtime.close()
    await running.catch(() => undefined)

    // The same workspace as well as the same sessions root: a session is found by both, and a
    // fresh workspace would leave this opening a new session that has nothing to edit.
    const second = await open({ workspace: first.workspace, sessionsRoot, replies: ['The corrected answer.'] })
    const resent = await second.runtime.resend(0, 'a better question')
    const transcript = await second.runtime.transcript()
    await second.runtime.close()

    expect(resent).toBe(true)
    expect(userTexts(transcript)).toEqual(['a better question'])
  })

  it('refuses to regenerate a conversation with nothing to re-run', async () => {
    const { runtime } = await open({ replies: ['unused'] })
    expect(await runtime.regenerate()).toBe(false)
    await runtime.close()
  })
})
