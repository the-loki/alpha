import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureGateExtension, GATE_EXTENSION_FILE, GATE_TITLE, gateExtensionPath } from './gate-extension.ts'

/**
 * The gate is a file the agent loads, so what has to be tested is the file: that it lands in
 * Alpha's own directory, and that the handler it installs asks Alpha and blocks with the answer.
 */
const directories: string[] = []

const agentDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'alpha-agent-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** Loads the file Alpha actually wrote, the way the agent loads it: as a factory it calls. */
async function loadExtension(directory: string) {
  ensureGateExtension(directory)
  const module = (await import(pathToFileURL(gateExtensionPath(directory)).href)) as {
    default: (pi: unknown) => void
  }
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<unknown>>()
  module.default({
    on: (name: string, handler: (event: unknown, ctx: unknown) => Promise<unknown>) => handlers.set(name, handler),
  })
  return handlers
}

describe('[runtime] the gate Alpha writes for the agent', () => {
  it('is Alpha’s own file, in Alpha’s own directory', () => {
    const directory = agentDirectory()
    ensureGateExtension(directory)

    expect(gateExtensionPath(directory)).toBe(join(directory, 'extensions', GATE_EXTENSION_FILE))
    // Not the person's pi, which Alpha has no business rewriting, and not the workspace.
    expect(gateExtensionPath(directory)).not.toContain('.pi')
    expect(readFileSync(gateExtensionPath(directory), 'utf-8')).toContain(GATE_TITLE)
  })

  it('asks Alpha about a call and lets it through when Alpha says so', async () => {
    const handlers = await loadExtension(agentDirectory())
    const asked: string[] = []
    const handler = handlers.get('tool_call')
    expect(handler).toBeDefined()

    const verdict = await handler?.(
      { toolCallId: 'call_1', toolName: 'bash', input: { command: 'ls' } },
      {
        ui: {
          input: (title: string, payload: string) => {
            asked.push(`${title} ${payload}`)
            return Promise.resolve('allow')
          },
        },
      },
    )

    expect(verdict).toBeUndefined()
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain(GATE_TITLE)
    // The whole call travels with the question, so the card Alpha draws is about this call.
    expect(asked[0]).toContain('"toolName":"bash"')
    expect(asked[0]).toContain('"command":"ls"')
  })

  it('blocks a call Alpha refused, in Alpha’s words', async () => {
    const handlers = await loadExtension(agentDirectory())
    const verdict = (await handlers.get('tool_call')?.(
      { toolCallId: 'call_2', toolName: 'write', input: { path: 'made.txt' } },
      { ui: { input: () => Promise.resolve('deny: that file is generated') } },
    )) as { block?: boolean; reason?: string }

    expect(verdict).toEqual({ block: true, reason: 'that file is generated' })
  })

  it('blocks a call when a sentence of Alpha’s own says why', async () => {
    const handlers = await loadExtension(agentDirectory())
    const blocked = (await handlers.get('tool_call')?.(
      { toolCallId: 'call_3', toolName: 'bash', input: { command: 'rm -rf /' } },
      { ui: { input: () => Promise.resolve('deny') } },
    )) as { block?: boolean; reason?: string }

    // A denial with no words is still a denial, and the model is told what happened.
    expect(blocked.block).toBe(true)
    expect(blocked.reason).not.toBe('')
  })

  it('blocks a call nobody answered, rather than running it', async () => {
    const handlers = await loadExtension(agentDirectory())
    const blocked = (await handlers.get('tool_call')?.(
      { toolCallId: 'call_4', toolName: 'bash', input: {} },
      { ui: { input: () => Promise.resolve(undefined) } },
    )) as { block?: boolean; reason?: string }

    expect(blocked.block).toBe(true)
    expect(blocked.reason).toContain('did not answer')
  })

  it('does not write over itself when it is already there', () => {
    const directory = agentDirectory()
    ensureGateExtension(directory)
    const before = readFileSync(gateExtensionPath(directory), 'utf-8')
    ensureGateExtension(directory)
    expect(readFileSync(gateExtensionPath(directory), 'utf-8')).toBe(before)
  })
})
