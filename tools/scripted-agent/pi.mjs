#!/usr/bin/env node
/**
 * A stand-in for `pi`, for the suites that need an agent without needing a model.
 *
 * Alpha ships no agent and drives the one the person installed, so the thing every test needs is
 * an agent that behaves: it speaks the RPC protocol Alpha's client speaks, it owns a session the
 * way pi does (see `session.mjs`), and it asks Alpha's gate before running anything. What it does
 * not have is a model: its replies are scripted (`script.mjs`), and the tools those replies call
 * really do land in the workspace, so a suite that looks for a written file still finds one.
 *
 * Only stdout carries protocol records; anything else goes to stderr, which Alpha keeps but does
 * not parse.
 */

import { join } from 'node:path'
import { runCommand } from './commands.mjs'
import { execute, pace, readScript, sleep, split, textOf } from './script.mjs'
import { createSession } from './session.mjs'

const VERSION = '0.86.0'

/** The title Alpha's gate answers: the whole call travels in `placeholder`, as JSON. */
const GATE_TITLE = 'alpha:gate'

/** What a call becomes when nobody ever answered the gate — an abort or a closed window. */
const UNANSWERED = 'This call was never answered, so Alpha did not run it.'

const options = parseArgs(process.argv.slice(2))

if (options.version === true) {
  process.stdout.write(`${VERSION}\n`)
  process.exit(0)
}

const cwd = process.cwd()
const session = createSession({
  cwd,
  directory: options.sessionDirectory ?? join(cwd, '.pi-sessions'),
  sessionId: options.sessionId,
  name: options.name,
  send: (record) => send(record),
})
let model = { id: options.model ?? 'scripted', name: 'Scripted', provider: options.provider ?? 'scripted' }
let thinkingLevel = options.thinking ?? 'medium'
let streaming = false
let aborted = false
let scriptIndex = 0
const steering = []
const pending = new Map()

// ---------------------------------------------------------------------------------------------
// The protocol's two halves: records off stdout, records onto stdin.
// ---------------------------------------------------------------------------------------------

function send(record) {
  process.stdout.write(`${JSON.stringify(record)}\n`)
}

function succeed(id, command, data) {
  const answer = { id, type: 'response', command, success: true }
  send(data === undefined ? answer : { ...answer, data })
}

function fail(id, command, error) {
  send({ id, type: 'response', command, success: false, error })
}

/** A question for Alpha, answered by an `extension_ui_response` carrying this id. */
function ask(title, payload) {
  const requestId = randomId()
  return new Promise((settle) => {
    pending.set(requestId, settle)
    send({ type: 'extension_ui_request', id: requestId, method: 'input', title, placeholder: payload })
  })
}

/**
 * Alpha's answer to a tool call: what its gate decided, in its own words when it said no. The title
 * is Alpha's marker and the payload is the whole call, because an `input` request has nowhere else
 * to put it and Alpha builds the card itself.
 */
async function permissionFor(callId, toolName, args) {
  const answer = await ask(GATE_TITLE, JSON.stringify({ callId, toolName, args }))
  if (typeof answer !== 'string' || answer.trim() === '') return { allowed: false, reason: UNANSWERED }
  const [decision, ...rest] = answer.split(':')
  if (decision.trim() !== 'deny') return { allowed: true }
  const reason = rest.join(':').trim()
  return { allowed: false, reason: reason === '' ? UNANSWERED : reason }
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  input += chunk
  let at = input.indexOf('\n')
  while (at !== -1) {
    const line = input.slice(0, at)
    input = input.slice(at + 1)
    if (line.trim() !== '') {
      const record = JSON.parse(line)
      if (record.type === 'extension_ui_response') answer(record)
      else void handle(record)
    }
    at = input.indexOf('\n')
  }
})
process.stdin.on('end', () => process.exit(0))
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0))

/**
 * Commands are read as they arrive, never queued behind each other: a run takes as long as a run
 * takes, and `abort` has to be heard while one is going on. Runs themselves are chained, so a
 * second message waits for the first the way a second message does.
 */
let runs = Promise.resolve()

function handle(command) {
  // A command that goes wrong is answered, not fatal: the agent stays up and says what happened,
  // which is what makes a broken answer a failed command rather than a dead process.
  return Promise.resolve(dispatch(command)).catch((error) => fail(command.id, command.type, String(error)))
}

function dispatch(command) {
  const id = command.id
  if (command.type === 'prompt') {
    if (command.streamingBehavior === 'steer' && streaming) {
      succeed(id, 'prompt')
      steering.push(command.message)
      announceQueue()
      return
    }
    session.append({ role: 'user', content: userContent(command.message, command.images), timestamp: Date.now() })
    succeed(id, 'prompt')
    runs = runs
      .then(() => converse())
      .catch((error) => send({ type: 'agent_end', messages: [], willRetry: false, error: String(error) }))
    return
  }
  return runCommand(command, {
    send,
    succeed,
    fail,
    session,
    nextStep,
    steer: (message) => {
      steering.push(message)
      announceQueue()
    },
    abortNow: () => {
      aborted = true
    },
    clearQueue: () => {
      const cleared = { steering: [...steering], followUp: [] }
      steering.length = 0
      announceQueue()
      return cleared
    },
    model: () => model,
    setModel: (next) => {
      model = next
    },
    thinkingLevel: () => thinkingLevel,
    setThinkingLevel: (level) => {
      thinkingLevel = level
    },
    streaming: () => streaming,
    pending: () => steering.length,
  })
}

function answer(record) {
  const settle = pending.get(record.id)
  pending.delete(record.id)
  if (settle === undefined) return
  if (record.cancelled === true) settle(undefined)
  else settle(record.value)
}

// ---------------------------------------------------------------------------------------------
// A run: the scripted replies, one after another, tools and all.
// ---------------------------------------------------------------------------------------------

/** One run of the script, which is what Alpha calls a turn. */
async function converse() {
  streaming = true
  aborted = false
  send({ type: 'agent_start' })
  const produced = []

  for (;;) {
    consumeSteering()
    const step = nextStep()
    send({ type: 'turn_start' })
    const message = assistant()
    send({ type: 'message_start', message })

    if (step.thinking !== undefined) await stream(message, 'thinking', step.thinking)
    if (step.text !== undefined) await stream(message, 'text', step.text)
    const callId = step.tool === undefined ? undefined : `call_${randomId()}`
    if (callId !== undefined) {
      message.content.push({ type: 'toolCall', id: callId, name: step.tool.name, arguments: step.tool.args ?? {} })
    }

    // A run that failed is a message that failed: pi ends it the same way, saying so in the
    // message the model would have written.
    if (step.error !== undefined) {
      message.stopReason = 'error'
      message.errorMessage = String(step.error)
    } else {
      message.stopReason = aborted ? 'aborted' : 'stop'
    }
    message.usage = messageUsage(message)
    addTotals(message.usage)
    send({
      type: 'message_update',
      usage: message.usage,
      assistantMessageEvent: { type: 'text_end', contentIndex: 0, content: '' },
    })
    send({ type: 'message_end', message })
    // The message is recorded when it ends; the tools it asked for run after it, which is the
    // order a session is written in and the order a transcript is read back in.
    session.append(message)
    produced.push(message)
    if (!aborted && step.tool !== undefined && callId !== undefined) await callTool(callId, step.tool)
    send({ type: 'turn_end', message, toolResults: [] })
    if (aborted) break
    // The agent goes on while it has something to do: a tool result to read, or a message that
    // arrived while it was working. A failed message ends the run where it stands.
    if (step.error !== undefined) break
    if (step.tool === undefined && steering.length === 0) break
  }

  streaming = false
  aborted = false
  send({ type: 'agent_end', messages: produced, willRetry: false })
  send({ type: 'agent_settled' })
}

/** Deltas, at the pace the script asks for: a suite that wants a turn it can interrupt slows it. */
async function stream(message, kind, text) {
  const { size, rate } = pace(process.env)
  const pieces = size === undefined ? [text] : split(text, size)
  const pause = size === undefined || rate === undefined ? 0 : (size / rate) * 1000
  for (const piece of pieces) {
    if (aborted) return
    // Deltas pile onto the part they belong to, the way a model's message is really kept: a
    // transcript read back later is paragraphs of prose, not one fragment per streamed piece.
    const kindOf = kind === 'thinking' ? 'thinking' : 'text'
    const last = message.content.at(-1)
    if (last?.type === kindOf) last.text += piece
    else message.content.push({ type: kindOf, text: piece })
    // The wire shape pi's RPC mode sends: the message's usage, and a delta with no partial in it.
    send({
      type: 'message_update',
      usage: zeroUsage(),
      assistantMessageEvent: { type: `${kind}_delta`, contentIndex: message.content.length - 1, delta: piece },
    })
    if (pause > 0) await sleep(pause)
  }
}

/** A call the gate has to let through: asked first, run second, blocked with Alpha's words. */
async function callTool(callId, tool) {
  send({ type: 'tool_execution_start', toolCallId: callId, toolName: tool.name, args: tool.args ?? {} })

  const permission = await permissionFor(callId, tool.name, tool.args ?? {})
  const result = permission.allowed
    ? execute(tool, tool.args ?? {}, cwd)
    : { content: [{ type: 'text', text: permission.reason }], isError: true }

  const started = { toolCallId: callId, toolName: tool.name, args: tool.args ?? {} }
  send({ type: 'tool_execution_update', ...started, partialResult: { content: result.content } })
  send({ type: 'tool_execution_end', ...started, result, isError: result.isError === true })
  session.append({
    role: 'toolResult',
    toolCallId: callId,
    toolName: tool.name,
    content: result.content,
    isError: result.isError === true,
    details: result.details,
    timestamp: Date.now(),
  })
}

// ---------------------------------------------------------------------------------------------
// The script, the queue, and the numbers the agent reports.
// ---------------------------------------------------------------------------------------------

function nextStep() {
  const script = readScript(process.env.ALPHA_FAUX_REPLIES)
  const step = script[Math.min(scriptIndex, script.length - 1)] ?? { text: 'Scripted reply.' }
  scriptIndex += 1
  return step
}

function announceQueue() {
  send({ type: 'queue_update', steering: [...steering], followUp: [] })
}

function consumeSteering() {
  while (steering.length > 0) {
    session.append({ role: 'user', content: userContent(steering.shift()), timestamp: Date.now() })
  }
  announceQueue()
}

/** The context Alpha sent and what came back, counted the way a provider's numbers behave. */
function messageUsage(message) {
  const asked = textOf(
    session
      .all()
      .filter((entry) => entry.type === 'message')
      .flatMap((entry) => entry.message.content),
  )
  const input = Math.ceil(asked.length / 4)
  const output = Math.ceil(textOf(message.content).length / 4)
  return { ...zeroUsage(), input, output, totalTokens: input + output }
}

function addTotals(usage) {
  session.totals.input += usage.input
  session.totals.output += usage.output
  session.totals.totalTokens += usage.totalTokens
}

const assistant = () => ({
  role: 'assistant',
  content: [],
  api: 'scripted',
  provider: model.provider,
  model: model.id,
  usage: zeroUsage(),
  stopReason: 'stop',
  timestamp: Date.now(),
})

const zeroUsage = () => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
})

const userContent = (text, images) => [
  { type: 'text', text: String(text ?? '') },
  ...(Array.isArray(images) ? images : []),
]

const randomId = () => Math.random().toString(16).slice(2, 10)

function parseArgs(args) {
  const parsed = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--version' || arg === '-v') parsed.version = true
    if (arg === '--mode') parsed.mode = args[++index]
    if (arg === '--session-dir') parsed.sessionDirectory = args[++index]
    // `--session-id` names a session to start; `--session` finds one that already has an id.
    if (arg === '--session-id' || arg === '--session') parsed.sessionId = args[++index]
    if (arg === '--name') parsed.name = args[++index]
    if (arg === '--model') parsed.model = args[++index]
    if (arg === '--provider') parsed.provider = args[++index]
    if (arg === '--thinking') parsed.thinking = args[++index]
  }
  return parsed
}
