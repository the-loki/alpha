import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { candidatesFor, type LocateDeps, locateAgent } from './locate.ts'

/** A filesystem and a runner that answer from a table, so the search can be read like a story. */
const depsOf = (options: {
  present?: string[]
  executable?: string[]
  version?: (path: string) => string | undefined
  env?: Record<string, string>
  platform?: NodeJS.Platform
}): LocateDeps => ({
  platform: options.platform ?? 'linux',
  env: { PATH: options.env?.PATH ?? '', ...options.env },
  exists: (path) => (options.present ?? []).includes(path),
  isExecutable: (path) =>
    (options.present ?? []).includes(path) && (options.executable ?? options.present ?? []).includes(path),
  run: async (path) => {
    const printed = options.version?.(path)
    return printed === undefined ? { ok: false, output: `${path}: not found` } : { ok: true, output: printed }
  },
})

describe('[agent] finding the binary to run', () => {
  it('looks where the settings say, then along PATH, then where pi is usually installed', () => {
    const found = candidatesFor({
      explicit: '/opt/pi/bin/pi',
      env: { HOME: '/home/someone', PATH: `/usr/bin${delimiter}/usr/local/bin` },
      platform: 'linux',
    })

    expect(found[0]).toBe('/opt/pi/bin/pi')
    expect(found).toContain('/usr/bin/pi')
    expect(found).toContain('/usr/local/bin/pi')
    expect(found).toContain(join('/home/someone', '.local/bin/pi'))
    // Nothing is looked at twice, and the settings' path stays first.
    expect(new Set(found).size).toBe(found.length)
  })

  it('knows the names a binary has on Windows', () => {
    const found = candidatesFor({ explicit: 'C:\\pi\\pi.exe', env: { PATH: 'C:\\tools' }, platform: 'win32' })

    expect(found[0]).toBe('C:\\pi\\pi.exe')
    expect(found.some((path) => path.endsWith('pi.exe'))).toBe(true)
    expect(found.some((path) => path.endsWith('pi.cmd'))).toBe(true)
  })

  it('answers ready with the path and the version it printed', async () => {
    const status = await locateAgent(
      { explicit: '', env: { PATH: '/usr/bin' }, platform: 'linux' },
      depsOf({ present: ['/usr/bin/pi'], version: () => '0.86.0\n' }),
    )

    expect(status).toEqual({ kind: 'ready', path: '/usr/bin/pi', version: '0.86.0' })
  })

  it('answers missing when there is nothing anywhere', async () => {
    const status = await locateAgent({ explicit: '', env: {}, platform: 'linux' }, depsOf({}))

    expect(status).toEqual({ kind: 'missing' })
  })

  it('answers outdated when what it found is older than Alpha needs', async () => {
    const status = await locateAgent(
      { explicit: '/opt/pi', env: {}, platform: 'linux' },
      depsOf({ present: ['/opt/pi'], version: () => '0.85.1' }),
    )

    expect(status).toEqual({ kind: 'outdated', path: '/opt/pi', version: '0.85.1' })
  })

  it('answers unusable when the binary is there but will not run', async () => {
    const status = await locateAgent(
      { explicit: '/opt/pi', env: {}, platform: 'linux' },
      depsOf({ present: ['/opt/pi'], version: () => undefined }),
    )

    expect(status).toEqual({ kind: 'unusable', path: '/opt/pi', reason: '/opt/pi: not found' })
  })

  it('skips a file that is not executable and keeps looking', async () => {
    const status = await locateAgent(
      { explicit: '', env: { PATH: '/usr/bin' }, platform: 'linux' },
      depsOf({ present: ['/usr/bin/pi'], executable: [], version: () => '0.86.0' }),
    )

    expect(status).toEqual({ kind: 'missing' })
  })

  it('keeps a path the person set to itself, rather than quietly using another binary', async () => {
    const status = await locateAgent(
      { explicit: '/gone/pi', env: { PATH: '/usr/bin' }, platform: 'linux' },
      depsOf({ present: ['/usr/bin/pi'], version: () => '0.86.0' }),
    )

    // A path in the settings is a decision: falling through to PATH would hide that it is wrong.
    expect(status).toEqual({ kind: 'missing' })
  })

  it('says a path that is there but cannot be run', async () => {
    const status = await locateAgent(
      { explicit: '/opt/pi', env: {}, platform: 'linux' },
      depsOf({ present: ['/opt/pi'], executable: [] }),
    )

    expect(status.kind).toBe('unusable')
    expect(status.kind === 'unusable' ? status.reason : '').toContain('not executable')
  })
})
