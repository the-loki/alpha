import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentRpc, rpcArgs, rpcEnv } from './rpc.ts'

/**
 * The stand-in agent: a real child process that speaks the documented protocol on its own pipes.
 * Testing the client against this rather than against a mock is the point — spawn, framing, the
 * answer that never comes and the child that dies are exactly what a mock would not show.
 */
const SCRIPT = `
let buffer = ''
const answer = (command, payload) => process.stdout.write(JSON.stringify(payload) + '\\n')
const respond = (command, extra = {}) =>
  answer(command, { type: 'response', id: command.id, command: command.type, success: true, data: { echo: command.type }, ...extra })

process.stdin.on('data', (chunk) => {
  buffer += chunk.toString()
  let at
  while ((at = buffer.indexOf('\\n')) !== -1) {
    const line = buffer.slice(0, at)
    buffer = buffer.slice(at + 1)
    if (line.trim() === '') continue
    const command = JSON.parse(line)
    if (command.type === 'events') {
      answer(command, { type: 'agent_start' })
      answer(command, { type: 'turn_start' })
      respond(command)
      continue
    }
    if (command.type === 'wide') {
      // A record holding a line separator, written in two pieces, and the newline last.
      const record = JSON.stringify({ type: 'message_update', text: 'one\\u2028two' })
      process.stdout.write(record.slice(0, 10))
      setTimeout(() => process.stdout.write(record.slice(10) + '\\n'), 20)
      setTimeout(() => respond(command), 40)
      continue
    }
    if (command.type === 'fail') {
      answer(command, { type: 'response', id: command.id, command: 'fail', success: false, error: 'the model refused' })
      continue
    }
    if (command.type === 'quiet') continue
    if (command.type === 'die') process.exit(7)
    if (command.type === 'stderr') process.stderr.write('something went wrong in there\\n')
    respond(command)
  }
})
process.stderr.write('stand-in ready\\n')
`

let directory: string
let script: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'alpha-rpc-'))
  script = join(directory, 'agent.mjs')
  writeFileSync(script, SCRIPT, 'utf-8')
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

const open = (options: { answerWithinMs?: number } = {}): AgentRpc =>
  AgentRpc.open({
    file: process.execPath,
    args: [script],
    cwd: directory,
    env: process.env,
    ...options,
  })

const settle = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

describe('[agent] talking to the agent process', () => {
  it('sends a command and reads its answer, matched by the id on both', async () => {
    const rpc = open()

    const outcome = await rpc.send({ type: 'get_state' })

    expect(outcome).toEqual({ ok: true, data: { echo: 'get_state' } })
    await rpc.close()
  })

  it('hands the events to the listener in the order they arrived, and the answer too', async () => {
    const rpc = open()
    const seen: string[] = []
    rpc.onEvent((event) => seen.push(event.type))

    await rpc.send({ type: 'events' })

    expect(seen).toEqual(['agent_start', 'turn_start'])
    await rpc.close()
  })

  it('reads a record that arrives in pieces, separator and all', async () => {
    const rpc = open()
    const texts: string[] = []
    rpc.onEvent((event) => {
      if (typeof event.text === 'string') texts.push(event.text)
    })

    const outcome = await rpc.send({ type: 'wide' })

    expect(outcome.ok).toBe(true)
    // U+2028 is a character inside this string, not the end of a record.
    expect(texts).toEqual(['one\u2028two'])
    await rpc.close()
  })

  it("answers a command the agent refused as a failure with the agent's own words", async () => {
    const rpc = open()

    expect(await rpc.send({ type: 'fail' })).toEqual({ ok: false, error: 'the model refused' })
    await rpc.close()
  })

  it('answers "gone" rather than hanging when the child has exited', async () => {
    const rpc = open()
    await rpc.send({ type: 'die' })
    await settle(150)

    const outcome = await rpc.send({ type: 'get_state' })

    expect(outcome.ok).toBe(false)
    expect(outcome.ok ? '' : outcome.error).toContain('gone')
    expect(rpc.gone).toBe(true)
  })

  it('tells whoever is listening that the child is gone, once', async () => {
    const rpc = open()
    let exits = 0
    rpc.onExit(() => {
      exits += 1
    })

    await rpc.send({ type: 'die' })
    await settle(150)
    await rpc.send({ type: 'get_state' })

    expect(exits).toBe(1)
  })

  it('reports a command the agent never answers instead of waiting for ever', async () => {
    const rpc = open({ answerWithinMs: 80 })

    const outcome = await rpc.send({ type: 'quiet' })

    expect(outcome.ok).toBe(false)
    expect(outcome.ok ? '' : outcome.error).toContain('did not answer')
    await rpc.close()
  })

  it('keeps what the child wrote to stderr', async () => {
    const rpc = open()

    await rpc.send({ type: 'stderr' })
    await settle(50)

    expect(rpc.stderr).toContain('something went wrong in there')
    expect(rpc.stderr).toContain('stand-in ready')
    await rpc.close()
  })

  it('kills the child when the conversation is closed, and says nothing more', async () => {
    const rpc = open()
    await rpc.send({ type: 'get_state' })

    await rpc.close()

    expect(rpc.gone).toBe(true)
    expect((await rpc.send({ type: 'get_state' })).ok).toBe(false)
  })

  it('builds the command line and the environment the agent is started with', () => {
    const args = rpcArgs({ sessionsDirectory: '/data/sessions', sessionId: 'c1', name: 'a chat' })
    const env = rpcEnv({ PATH: '/usr/bin' }, '/data/agent')

    expect(args).toEqual(['--mode', 'rpc', '--session-dir', '/data/sessions', '--session-id', 'c1', '--name', 'a chat'])
    expect(env.PATH).toBe('/usr/bin')
    // Local-first: no update check, no telemetry, and the person's own ~/.pi is left alone.
    expect(env.PI_OFFLINE).toBe('1')
    expect(env.PI_TELEMETRY).toBe('0')
    expect(env.PI_SKIP_VERSION_CHECK).toBe('1')
    expect(env.PI_CODING_AGENT_DIR).toBe('/data/agent')
  })
})
