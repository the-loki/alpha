import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The ADR index, held to the decisions it maps. A decision is a file with a number, a title and
 * possibly a banner saying what replaced it; the index (`docs/adr/README.md`) is the only place the
 * live set is visible without opening twenty-seven files, so an entry that drifts from its file is
 * worse than no index at all.
 */

const ADR_DIR = join(process.cwd(), 'docs/adr')
const INDEX = join(ADR_DIR, 'README.md')
const NUMBERED = /^(\d{4})-[a-z0-9-]+\.md$/

interface Decision {
  number: string
  file: string
  title: string
  replacedBy: string | undefined
}

const decisions = (): Decision[] =>
  readdirSync(ADR_DIR)
    .filter((name) => NUMBERED.test(name))
    .sort()
    .map((file) => {
      const text = readFileSync(join(ADR_DIR, file), 'utf-8')
      // Both banner spellings are in the set: `[ADR-0021]` and the older `[0021]`.
      const banner = /Superseded by \[(?:ADR-)?(\d{4})\]/.exec(text)
      return {
        number: file.slice(0, 4),
        file,
        title: (/^# (.+)$/m.exec(text)?.[1] ?? '').trim(),
        replacedBy: banner?.[1],
      }
    })

/** The index rows, read as `| [0001](0001-....md) | Title |` with the replacement column optional. */
const rows = (): Array<{ number: string; file: string; title: string; replacedBy: string | undefined }> =>
  readFileSync(INDEX, 'utf-8')
    .split('\n')
    .flatMap((line) => {
      const row = /^\| \[(\d{4})\]\(([^)]+)\) \| (.+?) \|(?: \[(\d{4})\]\([^)]+\) \|)?$/.exec(line.trim())
      return row === null ? [] : [{ number: row[1] ?? '', file: row[2] ?? '', title: row[3] ?? '', replacedBy: row[4] }]
    })

describe('[docs] the ADR index', () => {
  it('lists every decision exactly once, and nothing else', () => {
    const listed = rows().map((row) => row.file)
    const files = decisions().map((decision) => decision.file)

    expect(new Set(listed).size).toBe(listed.length)
    expect(listed.slice().sort()).toEqual(files)
  })

  it('gives each decision its own title, letter for letter', () => {
    const indexed = new Map(rows().map((row) => [row.file, row.title]))
    for (const decision of decisions()) {
      expect(indexed.get(decision.file)).toBe(decision.title)
    }
  })

  it('files a decision as superseded exactly when it carries a banner, and names the replacer', () => {
    const indexed = new Map(rows().map((row) => [row.file, row.replacedBy]))
    const numbers = new Set(decisions().map((decision) => decision.number))

    for (const decision of decisions()) {
      const listed = indexed.get(decision.file)
      expect(listed).toBe(decision.replacedBy)
      if (decision.replacedBy !== undefined) expect(numbers.has(decision.replacedBy)).toBe(true)
    }
  })

  it('follows every replacement chain to a decision still in force', () => {
    const byNumber = new Map(decisions().map((decision) => [decision.number, decision]))

    for (const start of decisions()) {
      const seen: string[] = []
      let current = start
      while (current.replacedBy !== undefined) {
        // A chain that revisits a decision is a loop, and a loop never reaches anything binding.
        expect(seen).not.toContain(current.number)
        seen.push(current.number)
        const next = byNumber.get(current.replacedBy)
        expect(next).toBeDefined()
        if (next === undefined) break
        current = next
      }
    }
  })
})
