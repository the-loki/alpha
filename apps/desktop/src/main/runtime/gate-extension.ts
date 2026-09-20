/**
 * The extension Alpha writes, and where it writes it.
 *
 * The agent asks before it runs anything, but only because Alpha wrote it a gate to ask with: a
 * file in Alpha's own agent directory (never in the person's `~/.pi`, never in the workspace) that
 * hangs on `tool_call` and puts every call to Alpha. The answer comes back as a sentence — `allow`,
 * or `deny: <why>` — and the reason becomes the tool's result, so a call Alpha refused is a refusal
 * the model reads in Alpha's words rather than an error it retries.
 *
 * The question is an `input` request rather than a `confirm`, and the reason that matters is the
 * sentence: `confirm` carries a boolean, and the thing Alpha has to hand the model is wording. A
 * run-time event is also the only place it may hang — a dialog raised at `session_start` ends the
 * agent — which is why there is no `session_start` handler here.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The file's name, and the title Alpha answers: one marker, two sides of the same protocol. */
export const GATE_EXTENSION_FILE = 'alpha-gate.js'
export const GATE_TITLE = 'alpha:gate'

/** What a call becomes when the answer never came: a closed window, or an abort mid-question. */
const UNANSWERED = 'Alpha did not answer, so this call did not run.'

/** The extension itself: small on purpose, because the policy it asks about lives in Alpha. */
const GATE_EXTENSION_SOURCE = `/**
 * Alpha's gate: every tool call goes past the workbench before it runs.
 *
 * Written by Alpha, in Alpha's own agent directory. Edits to this file are overwritten on start.
 */
export default function alphaGate(pi) { // constraints-ignore 01-typescript: the agent loads a default export
  pi.on('tool_call', async (event, ctx) => {
    const answer = await ctx.ui.input('${GATE_TITLE}', JSON.stringify({
      callId: event.toolCallId,
      toolName: event.toolName,
      args: event.input,
    }))
    if (typeof answer !== 'string' || answer.trim() === '') {
      return { block: true, reason: '${UNANSWERED}' }
    }
    const [decision, ...rest] = answer.split(':')
    if (decision.trim() !== 'deny') return undefined
    const reason = rest.join(':').trim()
    return { block: true, reason: reason === '' ? '${UNANSWERED}' : reason }
  })
}
`

/** Where the gate lives: Alpha's agent directory, in the place the agent loads extensions from. */
export const gateExtensionPath = (agentDirectory: string): string =>
  join(agentDirectory, 'extensions', GATE_EXTENSION_FILE)

/**
 * Makes sure the agent Alpha is about to run has the gate. Idempotent, and rewritten when the
 * source changes so an upgraded Alpha is not gated by last month's rules.
 */
export function ensureGateExtension(agentDirectory: string): void {
  const path = gateExtensionPath(agentDirectory)
  if (existsSync(path) && readFileSync(path, 'utf-8') === GATE_EXTENSION_SOURCE) return
  mkdirSync(join(agentDirectory, 'extensions'), { recursive: true })
  writeFileSync(path, GATE_EXTENSION_SOURCE, 'utf-8')
}
