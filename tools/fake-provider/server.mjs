#!/usr/bin/env node
/**
 * A model endpoint that answers in a script, for the tests that run the real agent.
 *
 * Every other suite drives the scripted agent and needs no model at all. This is for the one thing
 * that cannot be faked: proving that the agent Alpha installs really does ask Alpha's gate, which
 * takes a real `pi`, which takes something to talk to. It speaks the OpenAI-completions wire —
 * `POST /v1/chat/completions`, streamed as SSE — so a `models.json` entry pointing at it is enough
 * to drive a run.
 *
 * The script is one tool call, then text: enough for a run to reach the gate and to say what the
 * model received afterwards. What the model was sent is recorded, because that is the evidence a
 * refusal reached it as a refusal.
 */

import { createServer } from 'node:http'

const port = Number(process.env.FAKE_PROVIDER_PORT ?? '0')
const tool = JSON.parse(process.env.FAKE_TOOL_CALL ?? '{"name":"bash","arguments":{"command":"echo hello"}}')
const answer = process.env.FAKE_REPLY ?? 'Understood.'

/** Every request the model was sent, for the test to read afterwards. */
const requests = []

const server = createServer((request, response) => {
  // What the model was sent, which is the evidence a refusal reached it as a refusal.
  if (request.method === 'GET' && request.url === '/captured') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(requests))
    return
  }
  if (request.url?.endsWith('/chat/completions') !== true) {
    response.writeHead(404).end()
    return
  }
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
  })
  request.on('end', () => {
    requests.push({ body: safe(body), authorization: request.headers.authorization ?? '' })
    stream(response, requests.length === 1 ? first() : [{ text: answer }])
  })
})

/** The provider answers once with a tool call, and every time after that with words. */
const first = () => [{ tool: tool.name, arguments: tool.arguments ?? {}, id: `call_${requests.length}` }]

function stream(response, parts) {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  send(response, chunk({ role: 'assistant', content: '' }))
  for (const part of parts) {
    if (part.thinking !== undefined) send(response, chunk({ content: part.thinking }))
    if (part.text !== undefined) send(response, chunk({ content: part.text }))
    if (part.tool !== undefined) {
      send(response, {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index: 0, id: part.id, type: 'function', function: { name: part.tool, arguments: '' } }],
            },
          },
        ],
      })
      send(response, {
        choices: [
          { index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(part.arguments) } }] } },
        ],
      })
    }
  }
  send(response, chunk({}, 'tool_calls'))
  response.write('data: [DONE]\n\n')
  response.end()
}

const chunk = (delta, finish) => ({
  id: 'chatcmpl-scripted',
  object: 'chat.completion.chunk',
  created: Math.floor(Date.now() / 1000),
  model: 'scripted',
  choices: [{ index: 0, delta, ...(finish === undefined ? {} : { finish_reason: finish }) }],
})

const send = (response, payload) => response.write(`data: ${JSON.stringify(payload)}\n\n`)

const safe = (body) => {
  try {
    return JSON.parse(body)
  } catch {
    return { raw: body }
  }
}

server.listen(port, '127.0.0.1', () => {
  const address = server.address()
  process.stdout.write(`${typeof address === 'object' && address !== null ? address.port : 0}\n`)
})

process.on('SIGTERM', () => process.exit(0))
