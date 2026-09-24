/**
 * A server as the settings form holds it: every field is text, because every field is a box. The
 * two lists a server can carry — the arguments a command is run with, the environment or headers it
 * is reached with — are one line each, which is the shortest thing a person can edit without a
 * second editor for a list of pairs.
 *
 * The conversion both ways lives here rather than in the components: it is the only part of the
 * panel that can be wrong in a way nobody would see, and it is pure.
 */

import type { McpServerView } from '@alpha/contract'
import { describe, expect, it } from 'vitest'
import { draftOf, inputOf, pairsIn } from './mcp-draft.ts'

describe('[renderer] the MCP settings form, as text', () => {
  it('shows a stored command, its arguments and its environment as the boxes they were typed in', () => {
    const server: McpServerView = {
      name: 'files',
      command: 'mcp-files',
      args: ['/tmp', '--read-only'],
      env: { HOME: '/tmp', TOKEN: 'a=b' },
      reached: { state: 'connected', tools: 5 },
    }
    expect(draftOf(server)).toEqual({
      name: 'files',
      kind: 'command',
      target: 'mcp-files',
      args: '/tmp\n--read-only',
      pairs: 'HOME=/tmp\nTOKEN=a=b',
    })
  })

  it('reads those boxes back as the definition the main process takes', () => {
    expect(
      inputOf({
        name: 'files',
        kind: 'command',
        target: 'mcp-files',
        args: '/tmp\n\n  --read-only  ',
        pairs: 'HOME=/tmp\nTOKEN=a=b',
      }),
    ).toEqual({
      name: 'files',
      command: 'mcp-files',
      args: ['/tmp', '--read-only'],
      env: { HOME: '/tmp', TOKEN: 'a=b' },
    })
  })

  it('has nothing to say about boxes that were left empty, rather than empty lists', () => {
    // An absent field and an empty one are the same server, and the hub compares definitions field
    // by field: a save that turned "" into [] would look like a change and reach the server again.
    expect(inputOf({ name: 'files', kind: 'command', target: 'mcp-files', args: '', pairs: '' })).toEqual({
      name: 'files',
      command: 'mcp-files',
    })
  })

  it('reads a url and its headers instead, when that is what the server is', () => {
    expect(
      inputOf({ name: 'hosted', kind: 'url', target: 'http://127.0.0.1:8787/mcp', args: '', pairs: 'a=b' }),
    ).toEqual({ name: 'hosted', url: 'http://127.0.0.1:8787/mcp', headers: { a: 'b' } })
    expect(
      draftOf({ name: 'hosted', url: 'http://x/mcp', headers: { a: 'b' }, reached: { state: 'starting' } }),
    ).toEqual({
      name: 'hosted',
      kind: 'url',
      target: 'http://x/mcp',
      args: '',
      pairs: 'a=b',
    })
  })

  it('leaves out a line that is not a pair, and keeps an empty value', () => {
    expect(pairsIn('HOME=/tmp\nnot a pair\nEMPTY=\n= nameless')).toEqual({ HOME: '/tmp', EMPTY: '' })
  })
})
