import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentSnapshot } from '@alpha/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StateStore } from '../state-store.ts'
import { type AgentCliDeps, AgentCliService } from './service.ts'

let directory: string
let store: StateStore

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'alpha-agent-cli-'))
  store = new StateStore(directory)
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

/** A world where pi is wherever the test says it is, and installing it puts it there. */
function depsFor(options: { at?: string; version?: string; install?: { ok: boolean; output: string } }): {
  deps: AgentCliDeps
  installed: () => boolean
  commands: string[]
  pushed: AgentSnapshot[]
} {
  let present = options.at
  const commands: string[] = []
  const pushed: AgentSnapshot[] = []
  return {
    installed: () => present !== undefined,
    commands,
    pushed,
    deps: {
      locate: async () => {
        if (present === undefined) return { kind: 'missing' }
        const version = options.version ?? '0.86.0'
        return version === '0.85.1'
          ? { kind: 'outdated', path: present, version }
          : { kind: 'ready', path: present, version }
      },
      runInstall: async (command, onOutput) => {
        commands.push(command)
        onOutput(options.install?.output ?? 'added 1 package\n')
        if (options.install?.ok !== false) present = '/installed/pi'
        return {
          ok: options.install?.ok !== false,
          exitCode: options.install?.ok === false ? 1 : 0,
          output: options.install?.output ?? '',
        }
      },
      publish: (snapshot) => pushed.push(snapshot),
    },
  }
}

describe('[agent] the panel behind the settings page', () => {
  it('answers with the state of the world, and the command that would change it', async () => {
    const harness = depsFor({ at: '/usr/bin/pi' })
    const service = new AgentCliService({ store, deps: harness.deps })

    const snapshot = await service.snapshot()

    expect(snapshot.status).toEqual({ kind: 'ready', path: '/usr/bin/pi', version: '0.86.0' })
    expect(snapshot.path).toBe('')
    expect(snapshot.command).toContain('@earendil-works/pi-coding-agent')
    expect(snapshot.installing).toBe(false)
  })

  it('remembers a path the person set, and uses it instead of searching', async () => {
    const harness = depsFor({ at: '/opt/pi' })
    const service = new AgentCliService({ store, deps: harness.deps })

    const snapshot = await service.setPath('/opt/pi')

    expect(snapshot.path).toBe('/opt/pi')
    expect(snapshot.status.kind).toBe('ready')
    expect(new StateStore(directory).read().agent.path).toBe('/opt/pi')
  })

  it('runs the install, streams what it prints, and re-checks afterwards', async () => {
    const harness = depsFor({ at: undefined, install: { ok: true, output: 'added 1 package\n' } })
    const service = new AgentCliService({ store, deps: harness.deps })

    const snapshot = await service.install()

    expect(harness.commands).toEqual([snapshot.command])
    expect(snapshot.output).toContain('added 1 package')
    expect(snapshot.installing).toBe(false)
    expect(snapshot.status.kind).toBe('ready')
    // The window watches it happen: a push while installing, then one with the new state.
    expect(harness.pushed.some((one) => one.installing)).toBe(true)
    expect(harness.pushed.at(-1)?.status.kind).toBe('ready')
  })

  it('reports an install that failed as a failure, and does not pretend a pi appeared', async () => {
    const harness = depsFor({ at: undefined, install: { ok: false, output: 'EACCES: permission denied' } })
    const service = new AgentCliService({ store, deps: harness.deps })

    const snapshot = await service.install()

    expect(snapshot.output).toContain('EACCES')
    expect(snapshot.installing).toBe(false)
    expect(snapshot.status).toEqual({ kind: 'missing' })
  })

  it('answers an install already running without starting a second one', async () => {
    let release: () => void = () => undefined
    const harness = depsFor({ at: undefined })
    const service = new AgentCliService({
      store,
      deps: {
        ...harness.deps,
        runInstall: async () => {
          await new Promise<void>((settle) => {
            release = settle
          })
          return { ok: true, exitCode: 0, output: '' }
        },
      },
    })

    const first = service.install()
    const second = await service.install()

    expect(second.installing).toBe(true)
    release()
    await first
    expect((await service.snapshot()).installing).toBe(false)
  })
})
