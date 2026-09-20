/**
 * The session the scripted agent owns, in the shape pi owns one.
 *
 * A session is a header line and then entries, each pointing at the one before it, written to one
 * JSONL file under the session directory. The file appears when there is an answer to keep: a turn
 * that was killed before the model said anything leaves nothing behind, which is pi's rule and the
 * reason a conversation that was cut off mid-turn has nothing to read back.
 *
 * `--session-id` names a session to start and `--session` finds one that already has an id of its
 * own, which is what a fork leaves behind. Both are how a conversation survives a relaunch.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** pi's rule for a session file's name: when it started, and which session it is. */
const fileName = (timestamp, id) => `${timestamp.replace(/[:.]/g, '-')}_${id}.jsonl`

export function createSession(options) {
  const { cwd, directory, send } = options
  let sessionId = options.sessionId ?? randomId()
  let name = options.name
  let file = join(directory, fileName(new Date().toISOString(), sessionId))
  let flushed = false
  let leaf = null
  const entries = []
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 }

  mkdirSync(directory, { recursive: true })
  const restored = restore()
  if (restored.length > 0) {
    entries.push(...restored)
    leaf = restored.filter((entry) => entry.type !== 'session').at(-1)?.id ?? null
  } else {
    entries.push({ type: 'session', version: 3, id: sessionId, timestamp: new Date().toISOString(), cwd })
  }

  /** Reading an existing session back, when the id names one: a relaunch, or a session of a fork. */
  function restore() {
    if (!existsSync(directory)) return []
    const found = readdirSync(directory).find((name) => name.endsWith(`_${sessionId}.jsonl`))
    if (found === undefined) return []
    file = join(directory, found)
    flushed = true
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .flatMap((line) => {
        try {
          return [JSON.parse(line)]
        } catch {
          return []
        }
      })
  }

  /** The file appears once there is an answer to keep, and holds everything up to that answer. */
  function persist(entry) {
    if (!flushed) {
      const answered = entries.some((one) => one.type === 'message' && one.message.role === 'assistant')
      if (!answered) return
      writeFileSync(file, entries.map((one) => `${JSON.stringify(one)}\n`).join(''))
      flushed = true
      return
    }
    appendFileSync(file, `${JSON.stringify(entry)}\n`)
  }

  function add(entry) {
    entries.push(entry)
    leaf = entry.id
    persist(entry)
    send({ type: 'entry_appended', entry })
  }

  return {
    append(message) {
      add({ type: 'message', id: randomId(), parentId: leaf, timestamp: new Date().toISOString(), message })
    },
    appendCompaction(summary) {
      add({
        type: 'compaction',
        id: randomId(),
        parentId: leaf,
        timestamp: new Date().toISOString(),
        summary,
        tokensBefore: 1200,
      })
    },
    all: () => entries,
    leafId: () => leaf,
    now: () => new Date().toISOString(),
    file: () => file,
    id: () => sessionId,
    setName(next) {
      name = next
    },
    /** What the agent says about itself: what `get_state` answers with. */
    state(extra) {
      return {
        model: extra.model,
        thinkingLevel: extra.thinkingLevel,
        isStreaming: extra.isStreaming,
        isCompacting: false,
        steeringMode: 'all',
        followUpMode: 'all',
        sessionFile: file,
        sessionId,
        ...(name === undefined ? {} : { sessionName: name }),
        autoCompactionEnabled: true,
        messageCount: entries.filter((entry) => entry.type === 'message').length,
        pendingMessageCount: extra.pending,
      }
    },
    totals,
    stats() {
      return {
        input: totals.input,
        output: totals.output,
        cacheRead: totals.cacheRead,
        cacheWrite: totals.cacheWrite,
        totalTokens: totals.totalTokens,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: totals.cost },
      }
    },
    /**
     * pi forks at an entry: what came before it is copied into a session of its own and the agent
     * carries on there. What was replaced stays in the file it was written to.
     */
    fork(entryId) {
      const target = entries.find((entry) => entry.id === entryId)
      if (target === undefined) return undefined
      const previous = file
      const kept = []
      let current = entries.find((entry) => entry.id === target.parentId)
      while (current !== undefined) {
        kept.push(current)
        current = entries.find((entry) => entry.id === current.parentId)
      }
      kept.reverse()
      sessionId = randomId(true)
      file = join(directory, fileName(new Date().toISOString(), sessionId))
      entries.length = 0
      entries.push(
        {
          type: 'session',
          version: 3,
          id: sessionId,
          timestamp: new Date().toISOString(),
          cwd,
          parentSession: previous,
        },
        ...kept,
      )
      leaf = kept.at(-1)?.id ?? null
      writeFileSync(file, entries.map((entry) => `${JSON.stringify(entry)}\n`).join(''))
      flushed = true
      return sessionId
    },
  }
}

const randomId = (uuid = false) => (uuid ? crypto.randomUUID() : Math.random().toString(16).slice(2, 10))
