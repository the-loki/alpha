/**
 * An MCP server as data: a command for this machine to run, or a URL to post to. It sits here, not
 * in `@alpha/mcp`, for the reason a provider's shape sits here — the *type* of a connection is a
 * rule the workbench decides with, and how one is spoken to is the library's. It is also what lets
 * the contract say `McpServerDefinition & { reached: McpReached }` instead of holding a second
 * copy of the same shape it would have to translate to and from (C2.1).
 */

import type { Undef } from './maybe.ts'

export type McpServerDefinition =
  | { name: string; command: string; args?: string[]; env?: Record<string, string> }
  | { name: string; url: string; headers?: Record<string, string> }

export interface McpServerResult {
  server?: McpServerDefinition
  error?: string
}

/** The name a server may be known by: lower-case letters, digits and dashes, like a provider's. */
const NAME = /^[a-z0-9][a-z0-9-]*$/

/** A record of strings — an environment, a set of headers — as far as the input got it right. */
function pairsOf(value: unknown): Undef<Record<string, string>> {
  if (typeof value !== 'object' || value === null) return undefined
  const pairs = Object.entries(value as Record<string, unknown>).flatMap(([key, item]): [string, string][] =>
    typeof item === 'string' ? [[key, item]] : [],
  )
  return pairs.length === 0 ? undefined : Object.fromEntries(pairs)
}

/** The string entries of a list, keeping the ones that are strings when the rest are not. */
function stringsIn(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item): string[] => (typeof item === 'string' ? [item] : [])) : []
}

/**
 * One server as a person wrote it down, or said in the settings form, or why it is not one.
 *
 * A field that is the wrong shape is dropped rather than fatal — a file half-edited by hand is
 * still worth reading as far as it goes — while the two things a server cannot be without are
 * required: a name, and one of the two ways to reach it.
 */
export function readMcpServer(input: unknown): McpServerResult {
  if (typeof input !== 'object' || input === null) return { error: 'a server must be an object' }
  const candidate = input as Record<string, unknown>

  const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
  if (!NAME.test(name)) {
    return { error: 'the name must be lower-case letters, digits and dashes' }
  }

  const url = typeof candidate.url === 'string' ? candidate.url.trim() : ''
  if (url !== '') {
    if (!/^https?:\/\/[^\s]+$/.test(url)) return { error: 'the url must be an http(s) address' }
    const headers = pairsOf(candidate.headers)
    return { server: { name, url, ...(headers === undefined ? {} : { headers }) } }
  }

  const command = typeof candidate.command === 'string' ? candidate.command.trim() : ''
  if (command === '') return { error: 'a server needs a command to run or a url to reach' }
  const args = stringsIn(candidate.args)
  const env = pairsOf(candidate.env)
  return {
    server: { name, command, ...(args.length === 0 ? {} : { args }), ...(env === undefined ? {} : { env }) },
  }
}

function samePairs(left: Undef<Record<string, string>>, right: Undef<Record<string, string>>): boolean {
  const mine = Object.entries(left ?? {})
  if (mine.length !== Object.keys(right ?? {}).length) return false
  return mine.every(([key, value]) => right?.[key] === value)
}

function sameArgs(left: Undef<string[]>, right: Undef<string[]>): boolean {
  const mine = left ?? []
  const theirs = right ?? []
  return mine.length === theirs.length && mine.every((item, at) => item === theirs[at])
}

/**
 * Whether two readings describe the same server, field by field.
 *
 * The hub asks this to decide what a change to the configured list means: a definition that came
 * back identical keeps the connection it already has, and one that did not is a different server
 * wearing the same name, which has to be reached again. Compared field by field rather than as
 * serialised text, because an environment written in another order is the same environment.
 */
export function sameMcpServer(left: McpServerDefinition, right: McpServerDefinition): boolean {
  if (left.name !== right.name) return false
  if ('command' in left && 'command' in right) {
    return left.command === right.command && sameArgs(left.args, right.args) && samePairs(left.env, right.env)
  }
  if ('url' in left && 'url' in right) {
    return left.url === right.url && samePairs(left.headers, right.headers)
  }
  return false
}
