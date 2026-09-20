/**
 * The script the stand-in agent answers with, and the tools it really runs.
 *
 * The language is the one the suites have always written replies in: a string is text, and an
 * object carries thinking, text, and a tool call. The tools a script asks for are not simulated —
 * a `write` writes, a `bash` runs — because a suite that looks for a written file has to find one
 * for the test to mean anything.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const DEFAULT = [{ text: 'Scripted reply.' }]

/** The whole script, read fresh each time so a test can change it between turns. */
export function readScript(raw) {
  if (raw === undefined || raw === '') return DEFAULT
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT
    const steps = parsed.flatMap((item) =>
      typeof item === 'string' ? [{ text: item }] : typeof item === 'object' && item !== null ? [item] : [],
    )
    return steps.length === 0 ? DEFAULT : steps
  } catch {
    return DEFAULT
  }
}

/** How fast the script streams, when a test wants a turn it can interrupt between pieces. */
export const pace = (env) => ({
  size: readNumber(env.ALPHA_FAUX_TOKEN_SIZE),
  rate: readNumber(env.ALPHA_FAUX_TOKENS_PER_SECOND),
})

export const split = (text, size) => text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) ?? []
export const sleep = (ms) => new Promise((settle) => setTimeout(settle, ms))

const readNumber = (raw) => {
  const value = Number(raw ?? '')
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * One scripted call, run for real in the workspace. A script can also dictate the result, which is
 * how a suite asks for a tool that fails without needing one that does.
 */
export function execute(tool, args, cwd) {
  if (typeof tool.result === 'string') {
    return { content: [{ type: 'text', text: tool.result }], isError: tool.isError === true }
  }
  const path = typeof args.path === 'string' ? resolve(cwd, args.path) : ''
  switch (tool.name) {
    case 'bash': {
      const output = spawnSync(String(args.command ?? ''), { shell: true, cwd, encoding: 'utf8' })
      return {
        content: [{ type: 'text', text: `${output.stdout ?? ''}${output.stderr ?? ''}` }],
        isError: (output.status ?? 1) !== 0,
        details: { exitCode: output.status ?? 1 },
      }
    }
    case 'read': {
      if (!existsSync(path)) return { content: [{ type: 'text', text: `No such file: ${args.path}` }], isError: true }
      return { content: [{ type: 'text', text: readFileSync(path, 'utf8') }], isError: false }
    }
    case 'write': {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, String(args.content ?? ''))
      return { content: [{ type: 'text', text: `Wrote ${args.path}` }], isError: false, details: { path: args.path } }
    }
    case 'edit': {
      const before = existsSync(path) ? readFileSync(path, 'utf8') : ''
      const edits = Array.isArray(args.edits) ? args.edits : []
      const after = edits.reduce(
        (text, one) => text.replace(String(one.oldText ?? ''), String(one.newText ?? '')),
        before,
      )
      writeFileSync(path, after)
      return {
        content: [{ type: 'text', text: `Edited ${args.path}` }],
        isError: false,
        details: { path: args.path, diff: diffOf(before, after) },
      }
    }
    case 'ls': {
      const listed = readdirSync(path === '' ? cwd : path, { withFileTypes: true })
      const text = listed.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name)).join('\n')
      return { content: [{ type: 'text', text }], isError: false }
    }
    default: {
      return { content: [{ type: 'text', text: `(${tool.name}) done` }], isError: false }
    }
  }
}

/** The text of a message's content, whether it arrives as blocks or as a string. */
export const textOf = (content) =>
  (Array.isArray(content) ? content : [])
    .filter((part) => part !== null && typeof part === 'object' && part.type === 'text')
    .map((part) => String(part.text ?? ''))
    .join('')

/**
 * A unified-style diff of two texts, line by line: the common head and tail are found, and what
 * sits between them is the change. Enough for a transcript to render what an edit did, which is
 * what the tool's details are for.
 */
export function diffOf(before, after) {
  const a = before.split('\n')
  const b = after.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }
  return [
    `@@ -${start + 1},${endA - start} +${start + 1},${endB - start} @@`,
    ...a.slice(start, endA).map((line) => `-${line}`),
    ...b.slice(start, endB).map((line) => `+${line}`),
  ].join('\n')
}
