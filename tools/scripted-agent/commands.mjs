/**
 * The commands Alpha sends, and what the scripted agent answers.
 *
 * This is the half of pi's protocol that is about state rather than about a run: what the session
 * is, which model it is on, and how to move its branch tip. Each answer is the shape Alpha's
 * client reads, so a suite that drives this stands in for the real agent's own answers.
 */

import { textOf } from './script.mjs'

/** Handed one command, answers it. Everything mutable it touches is an argument. */
export async function runCommand(command, ports) {
  const { send, succeed, fail, session, nextStep } = ports
  const id = command.id
  switch (command.type) {
    case 'steer': {
      ports.steer(command.message)
      succeed(id, 'steer')
      return
    }
    case 'follow_up': {
      session.append({ role: 'user', content: userContent(command.message), timestamp: Date.now() })
      succeed(id, 'follow_up')
      return
    }
    case 'abort': {
      ports.abortNow()
      succeed(id, 'abort')
      return
    }
    case 'clear_queue': {
      succeed(id, 'clear_queue', ports.clearQueue())
      return
    }
    case 'compact': {
      const summary = nextStep().text ?? 'The earlier turns, summarised.'
      session.appendCompaction(summary)
      send({ type: 'compaction_start', reason: 'manual' })
      send({
        type: 'compaction_end',
        reason: 'manual',
        result: { summary, tokensBefore: 1200 },
        aborted: false,
        willRetry: false,
      })
      succeed(id, 'compact', { summary })
      return
    }
    case 'fork': {
      const sessionId = session.fork(command.entryId)
      if (sessionId === undefined) fail(id, 'fork', `Entry not found: ${command.entryId}`)
      else succeed(id, 'fork', { text: '', cancelled: false })
      return
    }
    case 'get_state': {
      succeed(
        id,
        'get_state',
        session.state({
          model: ports.model(),
          thinkingLevel: ports.thinkingLevel(),
          isStreaming: ports.streaming(),
          pending: ports.pending(),
        }),
      )
      return
    }
    case 'get_entries': {
      const entries = session.all()
      const since = command.since === undefined ? -1 : entries.findIndex((entry) => entry.id === command.since)
      succeed(id, 'get_entries', { entries: entries.slice(since + 1), leafId: session.leafId() })
      return
    }
    case 'get_session_stats': {
      const messages = session.all().filter((entry) => entry.type === 'message').length
      succeed(id, 'get_session_stats', {
        sessionId: session.id(),
        sessionFile: session.file(),
        messageCount: messages,
        usage: session.stats(),
      })
      return
    }
    case 'get_last_assistant_text': {
      const said = [...session.all()]
        .reverse()
        .find((entry) => entry.type === 'message' && entry.message.role === 'assistant')
      succeed(id, 'get_last_assistant_text', { text: textOf(said?.message.content) })
      return
    }
    case 'set_model': {
      ports.setModel({ id: command.modelId, name: command.modelId, provider: command.provider })
      succeed(id, 'set_model', ports.model())
      return
    }
    case 'set_thinking_level': {
      ports.setThinkingLevel(command.level)
      succeed(id, 'set_thinking_level')
      return
    }
    default: {
      fail(id, command.type, `the scripted agent does not know ${command.type}`)
    }
  }
}
