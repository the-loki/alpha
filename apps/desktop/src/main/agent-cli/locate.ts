/**
 * Where the agent is. Alpha ships no copy of pi, so the first question it asks is whether there is
 * one to run — and the answer has to be a value, because "not installed" is a normal state of a
 * machine rather than a failure of this program.
 *
 * The search order is: the path the person set, or else `PATH` and the places a global npm install
 * lands. A path that was set is used *instead of* the search, not merely first: a setting is a
 * decision, and silently running a different binary hides that the decision is wrong.
 */

import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { type AgentStatus, meetsMinimum, PI_MINIMUM_VERSION, readVersion } from '@alpha/core'

export interface LocateOptions {
  /** What the settings hold, or an empty string when nobody has said. */
  explicit: string
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
}

export interface LocateDeps {
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  exists(path: string): boolean
  isExecutable(path: string): boolean
  run(path: string): Promise<{ ok: boolean; output: string }>
}

/** What the binary is called, which is not the same on every platform. */
function namesFor(platform: NodeJS.Platform): string[] {
  return platform === 'win32' ? ['pi.cmd', 'pi.exe', 'pi.bat', 'pi'] : ['pi']
}

/** The places a global install lands, per platform, before `PATH` is even considered. */
function usualDirectories(options: LocateOptions): string[] {
  const home = options.env.HOME ?? options.env.USERPROFILE ?? ''
  if (options.platform === 'win32') {
    const appData = options.env.APPDATA
    return appData === undefined ? [] : [join(appData, 'npm')]
  }
  return [join(home, '.local/bin'), join(home, '.bun/bin'), '/usr/local/bin', '/usr/bin', '/opt/homebrew/bin']
}

/** Every path worth looking at, best first, with nothing looked at twice. */
export function candidatesFor(options: LocateOptions): string[] {
  const found: string[] = []
  const add = (path: string): void => {
    if (path !== '' && !found.includes(path)) found.push(path)
  }
  add(options.explicit.trim())

  const fromPath = (options.env.PATH ?? '')
    .split(delimiter)
    .filter((directory) => directory !== '')
    .flatMap((directory) => namesFor(options.platform).map((name) => join(directory, name)))
  for (const path of fromPath) add(path)

  for (const directory of usualDirectories(options)) {
    for (const name of namesFor(options.platform)) add(join(directory, name))
  }
  return found
}

/** `pi --version`, answered as a value: a binary that will not run is a state, not an exception. */
function runVersion(path: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((settle) => {
    const child = spawn(path, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on('error', (error) => settle({ ok: false, output: error.message }))
    child.on('close', (code) => settle({ ok: code === 0, output }))
  })
}

export function locateDeps(overrides: Partial<LocateDeps> = {}): LocateDeps {
  return {
    env: process.env,
    platform: process.platform,
    exists: (path) => existsSync(path),
    isExecutable: (path) => {
      try {
        return existsSync(path) && statSync(path).isFile()
      } catch {
        return false
      }
    },
    run: runVersion,
    ...overrides,
  }
}

/** The search itself, over the paths and the two questions asked about each one. */
export async function locateAgent(options: LocateOptions, deps: LocateDeps): Promise<AgentStatus> {
  const explicit = options.explicit.trim()
  const paths = explicit === '' ? candidatesFor(options) : [explicit]
  for (const path of paths) {
    if (!deps.exists(path)) continue
    if (!deps.isExecutable(path)) {
      // A path the person set that is not runnable is worth saying out loud; in the search, it is
      // just another candidate that was not it.
      if (explicit !== '') return { kind: 'unusable', path, reason: `${path} is not executable` }
      continue
    }
    const ran = await deps.run(path)
    const said = ran.output.trim()
    if (!ran.ok) return { kind: 'unusable', path, reason: said === '' ? `${path} would not run` : said }
    const version = readVersion(said)
    if (version === undefined) return { kind: 'unusable', path, reason: `${path} printed no version` }
    return meetsMinimum(version, PI_MINIMUM_VERSION)
      ? { kind: 'ready', path, version }
      : { kind: 'outdated', path, version }
  }
  return { kind: 'missing' }
}
