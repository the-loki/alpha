/**
 * A server as the settings form holds it: every field is text, because every field is a box. The
 * two lists a server can carry — the arguments a command is run with, the environment or headers it
 * is reached with — are one line each, which is the shortest thing a person can edit without a
 * second editor for a list of pairs.
 *
 * The conversion both ways lives here rather than in the components: it is the only part of the
 * panel that can be wrong in a way nobody would see, and it is pure.
 */

import type { McpServerInput, McpServerView } from '@alpha/contract'
import type { Undef } from '@alpha/domain'

export interface McpDraft {
  name: string
  /** Which of the two ways this server is reached: a command to run, or a url to post to. */
  kind: 'command' | 'url'
  /** The command, or the url. */
  target: string
  /** The command's arguments, one per line. */
  args: string
  /** The command's environment, or the url's headers, one `NAME=value` per line. */
  pairs: string
}

function pairsText(pairs: Undef<Record<string, string>>): string {
  return Object.entries(pairs ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')
}

/** A stored server as the form shows it, so a card opens on what is there rather than on nothing. */
export function draftOf(server: McpServerView): McpDraft {
  if ('command' in server) {
    return {
      name: server.name,
      kind: 'command',
      target: server.command,
      args: (server.args ?? []).join('\n'),
      pairs: pairsText(server.env),
    }
  }
  return { name: server.name, kind: 'url', target: server.url, args: '', pairs: pairsText(server.headers) }
}

/** The lines of a text box that mean something: a blank one is not a value. */
export function linesIn(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/**
 * The pairs a text box holds, as pairs. The box says `NAME=value`, so a line without the `=` is not
 * one; the name is what is before the first `=` and the value is everything after it, which is what
 * lets a token with an `=` in it survive being pasted in.
 */
export function pairsIn(text: string): Undef<Record<string, string>> {
  const pairs = linesIn(text).flatMap((line): [string, string][] => {
    const at = line.indexOf('=')
    return at <= 0 ? [] : [[line.slice(0, at).trim(), line.slice(at + 1)]]
  })
  return pairs.length === 0 ? undefined : Object.fromEntries(pairs)
}

/** What the form's boxes mean, as the definition the main process reads. */
export function inputOf(draft: McpDraft): McpServerInput {
  const name = draft.name.trim()
  const pairs = pairsIn(draft.pairs)
  if (draft.kind === 'url') {
    return { name, url: draft.target.trim(), ...(pairs === undefined ? {} : { headers: pairs }) }
  }
  const args = linesIn(draft.args)
  return {
    name,
    command: draft.target.trim(),
    ...(args.length === 0 ? {} : { args }),
    ...(pairs === undefined ? {} : { env: pairs }),
  }
}
