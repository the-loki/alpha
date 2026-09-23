/**
 * A provider's endpoint on loopback, speaking whichever of the three wires Alpha stores it is
 * asked for (ADR-0015), so a test drives a real turn at the protocol rather than asserting a
 * string. What arrived is kept — the request line, the headers, the body — because the request a
 * protocol builds is half of what speaking it means, and the answer it streams back is the other.
 *
 * Fixtures only: no key is checked, and every turn says the same word.
 */
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { ProviderApi, Undef } from '@alpha/domain'

/** One request as it arrived, before anything interpreted it. */
export interface ArrivedRequest {
  method: string
  path: string
  headers: Record<string, Undef<string | string[]>>
  body: Record<string, unknown>
}

export interface ScriptedWire {
  /** The port it took: a test composes the base url, which is what a stored provider holds. */
  port: number
  requests: ArrivedRequest[]
  close(): Promise<void>
}

/** Where the wire is run from, never dialed out to. */
const LOOPBACK = '127.0.0.1'

/** What a frame writer is: one event, named the way the wire names events. */
type Send = (payload: unknown, event?: string) => void

/** The wires started but not yet stopped, so a suite can close what its tests opened. */
const started: Array<() => Promise<void>> = []

/** Stops every wire a test started, in the suite's own `afterEach`. */
export async function closeScriptedWires(): Promise<void> {
  const pending = [...started]
  started.length = 0
  await Promise.all(pending.map((close) => close()))
}

export async function startScriptedWire(api: ProviderApi, answer = 'ready'): Promise<ScriptedWire> {
  const requests: ArrivedRequest[] = []
  const server = createServer((request, response) => {
    // A client that hangs up mid-stream is this endpoint's ordinary day, not the test's problem.
    response.on('error', () => {})
    request.on('error', () => {})
    let body = ''
    request.on('data', (chunk: Buffer) => {
      body += chunk
    })
    request.on('end', () => {
      const arrived = asObject(body)
      requests.push({
        method: request.method ?? '',
        path: request.url ?? '',
        headers: request.headers,
        body: arrived,
      })
      answerOnce(api, response, answer, typeof arrived.model === 'string' ? arrived.model : 'scripted')
    })
  })
  await new Promise<void>((settle) => server.listen(0, LOOPBACK, settle))
  const address = server.address()
  const close = (): Promise<void> => closeServer(server)
  started.push(close)
  return { port: typeof address === 'object' && address !== null ? address.port : 0, requests, close }
}

/** One turn, said the way the wire being spoken says it. */
function answerOnce(api: ProviderApi, response: ServerResponse, answer: string, model: string): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  const send: Send = (payload, event) => {
    if (event !== undefined) response.write(`event: ${event}\n`)
    response.write(`data: ${JSON.stringify(payload)}\n\n`)
  }
  if (api === 'openai-completions') completionsTurn(send, response, answer, model)
  else if (api === 'openai-responses') responsesTurn(send, answer, model)
  else anthropicTurn(send, answer, model)
  response.end()
}

/** Chunks of `chat.completion`, ended by `[DONE]`, which is the only shape this wire ends with. */
function completionsTurn(send: Send, response: ServerResponse, answer: string, model: string): void {
  const chunk = (delta: Record<string, unknown>, finish?: string): Record<string, unknown> => ({
    id: 'chatcmpl-scripted',
    object: 'chat.completion.chunk',
    created: 0,
    model,
    choices: [{ index: 0, delta, ...(finish === undefined ? {} : { finish_reason: finish }) }],
  })
  send(chunk({ role: 'assistant', content: '' }))
  send(chunk({ content: answer }))
  send({ ...chunk({}, 'stop'), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
  response.write('data: [DONE]\n\n')
}

/** Named events, the message item added first so there is a text block to stream into. */
function responsesTurn(send: Send, answer: string, model: string): void {
  send({ type: 'response.created', response: { id: 'resp-scripted', status: 'in_progress' } }, 'response.created')
  send(
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { id: 'msg-scripted', type: 'message', status: 'in_progress', role: 'assistant', content: [] },
    },
    'response.output_item.added',
  )
  send(
    { type: 'response.output_text.delta', output_index: 0, item_id: 'msg-scripted', content_index: 0, delta: answer },
    'response.output_text.delta',
  )
  send(
    {
      type: 'response.completed',
      response: {
        id: 'resp-scripted',
        status: 'completed',
        model,
        output: [],
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          total_tokens: 2,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      },
    },
    'response.completed',
  )
}

/** A message, one text block opened and closed in it, then the stop that ends the stream. */
function anthropicTurn(send: Send, answer: string, model: string): void {
  send(
    {
      type: 'message_start',
      message: {
        id: 'msg-scripted',
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 0 },
      },
    },
    'message_start',
  )
  send({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, 'content_block_start')
  send({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: answer } }, 'content_block_delta')
  send({ type: 'content_block_stop', index: 0 }, 'content_block_stop')
  send(
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
    'message_delta',
  )
  send({ type: 'message_stop' }, 'message_stop')
}

function closeServer(server: Server): Promise<void> {
  return new Promise((settle) => {
    // A client holding a keep-alive socket must not hold the close open with it.
    server.closeAllConnections()
    server.close(() => settle())
  })
}

const asObject = (body: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(body)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
