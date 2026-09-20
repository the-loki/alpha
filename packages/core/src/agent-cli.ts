/**
 * The agent Alpha runs, as Alpha describes it: the command to install it, the version Alpha's
 * integration was written against, and what "found it" or "did not" means as a value.
 *
 * Alpha does not ship the agent, so every one of these states is a normal state of the world
 * rather than an error: not installed is a sentence and a command, an old one is a sentence and a
 * version, and a binary that will not run is a sentence and the reason. Nothing here throws.
 */

import type { TextKey } from './i18n.ts'
import type { Undef } from './maybe.ts'

/**
 * The command Alpha offers to run, and the one it tells people to run themselves. It carries no
 * host — the other documented install method does, and it lives in the docs rather than in
 * Alpha's source (constraint C3.1).
 */
export const PI_INSTALL_COMMAND = 'npm install -g --ignore-scripts @earendil-works/pi-coding-agent'

/**
 * What Alpha needs of pi. Not a guess: the RPC protocol and the extension UI protocol Alpha
 * depends on are the ones documented for this version in `docs/research/pi-coding-agent.md`.
 */
export const PI_MINIMUM_VERSION = '0.86.0'

export type AgentStatus =
  /** Found, and it answered with a version Alpha can use. */
  | { kind: 'ready'; path: string; version: string }
  /** Nowhere Alpha looked. */
  | { kind: 'missing' }
  /** Found, but running it failed: a broken install, a wrong architecture, no permission. */
  | { kind: 'unusable'; path: string; reason: string }
  /** Found and running, but older than Alpha needs. */
  | { kind: 'outdated'; path: string; version: string }

const VERSION_SHAPE = /(\d+)\.(\d+)\.(\d+)/

/**
 * The version in what a version command printed, or nothing when it printed no version. `pi -v`
 * answers with the bare number; a banner is tolerated because other builds may add a prefix.
 */
export function readVersion(output: string): Undef<string> {
  const found = output.match(VERSION_SHAPE)
  return found === null ? undefined : `${found[1]}.${found[2]}.${found[3]}`
}

/** Whether a version is at least a minimum, compared as three numbers rather than as text. */
export function meetsMinimum(version: Undef<string>, minimum: string): boolean {
  const found = version === undefined ? null : version.match(VERSION_SHAPE)
  if (found === null) return false
  const left = [found[1], found[2], found[3]].map(Number)
  const right = (minimum.match(VERSION_SHAPE) ?? []).slice(1, 4).map(Number)
  for (let part = 0; part < 3; part += 1) {
    const mine = left[part] ?? 0
    const theirs = right[part] ?? 0
    if (mine !== theirs) return mine > theirs
  }
  return true
}

/** What the interface says about a state. The words are the dictionary's; this is the choice. */
export function agentStatusKey(status: AgentStatus): TextKey {
  if (status.kind === 'ready') return 'agent.ready'
  if (status.kind === 'outdated') return 'agent.outdated'
  if (status.kind === 'unusable') return 'agent.unusable'
  return 'agent.missing'
}
