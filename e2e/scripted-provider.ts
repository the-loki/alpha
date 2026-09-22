/**
 * The model the suites script: an OpenAI-completions endpoint on loopback, run in the test process,
 * speaking the wire pi-ai's client speaks — SSE `data:` frames, content and reasoning deltas,
 * tool-call deltas that end in finish_reason `tool_calls`, a usage chunk, and `[DONE]`. It answers
 * the same script the retired RPC stand-in took (the `ALPHA_FAUX_REPLIES` JSON, read the same way:
 * a string is text, an object carries `thinking`, `text` and a `tool`), so a spec's answers keep
 * their shape; the steps go out one per provider request, the last one repeating when a
 * conversation asks again.
 *
 * The tools a script asks for are the real ones: the embedded runtime runs read, bash, edit and
 * write against the real workspace, so a script names real paths, and the gate Alpha owns is the
 * one that answers. The server never sees a credential requirement — it ignores Authorization —
 * because the vault key a spec writes is for the workbench, not for this endpoint.
 */
import { createServer, type ServerResponse } from 'node:http'

/** One scripted answer, in the schema the old stand-in read out of `ALPHA_FAUX_REPLIES`. */
interface Step {
  thinking?: string
  text?: string
  tool?: { name: string; args?: Record<string, unknown> }
}

const DEFAULT: Step[] = [{ text: 'Scripted reply.' }]

/** The script, parsed the way `tools/scripted-agent/script.mjs` used to parse it. */
export function readScript(raw: string | undefined): Step[] {
  if (raw === undefined || raw === '') return DEFAULT
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT
    const steps = parsed.flatMap((item): Step[] =>
      typeof item === 'string' ? [{ text: item }] : typeof item === 'object' && item !== null ? [item] : [],
    )
    return steps.length === 0 ? DEFAULT : steps
  } catch {
    return DEFAULT
  }
}

/** How fast the script streams, when a test wants a turn it can catch between pieces. */
interface Pace {
  tokenSize?: number
  tokensPerSecond?: number
}

/** One running endpoint: the port it took, the base URL a provider entry points at, and its stop. */
export interface ScriptedProvider {
  port: number
  url: string
  close(): Promise<void>
}

const split = (text: string, size: number): string[] => text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) ?? [text]
const sleep = (ms: number) => new Promise((settle) => setTimeout(settle, ms))
const positive = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined

/** The endpoints started but not yet stopped, so a spec can close what its tests opened. */
const started: Array<() => Promise<void>> = []

/** Stops every provider a test started, in the spec's own `afterEach`. */
export async function closeScriptedProviders(): Promise<void> {
  const pending = [...started]
  started.length = 0
  await Promise.all(pending.map((close) => close()))
}

/**
 * Starts one endpoint on a port of its own, with the script for one app launch. A turn is refused
 * before the provider is asked unless Alpha knows a model and holds a key, so the spec still
 * writes both files — `configureProvider` with this endpoint as the base URL.
 */
export async function startScriptedProvider(options: { script?: string } & Pace = {}): Promise<ScriptedProvider> {
  const script = readScript(options.script)
  const tokenSize = positive(options.tokenSize)
  const tokensPerSecond = positive(options.tokensPerSecond)
  let index = 0

  /** The next step, the last one repeating when the conversation asks again. */
  const next = (): Step => script[Math.min(index++, script.length - 1)] ?? (DEFAULT[0] as Step)

  const server = createServer((request, response) => {
    // A client that hangs up mid-stream — a turn the person stopped — is the endpoint's ordinary
    // day, not an error the test process should hear about.
    response.on('error', () => {})
    request.on('error', () => {})
    if (request.method !== 'POST' || request.url?.endsWith('/chat/completions') !== true) {
      response.writeHead(404).end()
      return
    }
    let body = ''
    request.on('data', (chunk: Buffer) => {
      body += chunk
    })
    request.on('end', () => {
      void answer(response, body, { tokenSize, tokensPerSecond, next }).catch(() => response.end())
    })
  })

  await new Promise<void>((settle) => server.listen(0, '127.0.0.1', settle))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  let stopped = false
  const close = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    // A client holding a keep-alive socket must not hold the close open with it.
    server.closeAllConnections()
    await new Promise<void>((settle) => server.close(() => settle()))
  }
  started.push(close)
  return { port, url: `http://127.0.0.1:${port}/v1`, close }
}

/** One provider request, answered with one step of the script, streamed as SSE. */
async function answer(
  response: ServerResponse,
  body: string,
  pace: { tokenSize?: number; tokensPerSecond?: number; next: () => Step },
): Promise<void> {
  const request = safeJson(body)
  const id = `chatcmpl-scripted-${Math.floor(Math.random() * 1e6)}`
  const model = typeof request.model === 'string' ? request.model : 'scripted'
  const step = pace.next()

  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  const send = (payload: unknown): boolean => response.write(`data: ${JSON.stringify(payload)}\n\n`)
  const chunk = (delta: Record<string, unknown>) => ({
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta }],
  })

  send(chunk({ role: 'assistant', content: '' }))
  if (step.thinking !== undefined) await streamDeltas(response, send, chunk, 'reasoning_content', step.thinking, pace)
  if (step.text !== undefined) await streamDeltas(response, send, chunk, 'content', step.text, pace)
  if (step.tool !== undefined) {
    send(
      chunk({
        tool_calls: [
          {
            index: 0,
            id: `call_${Math.random().toString(16).slice(2, 10)}`,
            type: 'function',
            function: { name: step.tool.name, arguments: '' },
          },
        ],
      }),
    )
    send(chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(step.tool.args ?? {}) } }] }))
  }

  // The final frame carries the finish the client requires and the usage the header's totals read.
  const asked = JSON.stringify(request.messages ?? '')
  const input = Math.max(1, Math.ceil(asked.length / 4))
  const output = Math.max(1, Math.ceil(`${step.thinking ?? ''}${step.text ?? ''}`.length / 4))
  send({
    ...chunk({}),
    choices: [{ index: 0, delta: {}, finish_reason: step.tool === undefined ? 'stop' : 'tool_calls' }],
    usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output },
  })
  response.write('data: [DONE]\n\n')
  response.end()
}

/** One field's text, in pieces, at the pace the test asked for. */
async function streamDeltas(
  response: ServerResponse,
  send: (payload: unknown) => boolean,
  chunk: (delta: Record<string, unknown>) => object,
  field: 'content' | 'reasoning_content',
  text: string,
  pace: { tokenSize?: number; tokensPerSecond?: number },
): Promise<void> {
  const pieces = pace.tokenSize === undefined ? [text] : split(text, pace.tokenSize)
  const pause =
    pace.tokenSize === undefined || pace.tokensPerSecond === undefined
      ? 0
      : (pace.tokenSize / pace.tokensPerSecond) * 1000
  for (const piece of pieces) {
    // A turn stopped mid-answer takes its socket with it: what was written is what arrived.
    if (response.destroyed || response.writableEnded) return
    send(chunk({ [field]: piece }))
    if (pause > 0) await sleep(pause)
  }
}

const safeJson = (body: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(body)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
