import { describe, expect, it } from 'vitest'
import { checkFile, RULES } from './rules.mjs'
import { file } from './testing.mjs'

/**
 * The rule set as a whole: the invariants every rule shares, and the one entry point the checker
 * uses. The rules themselves are pinned beside their modules, each with the passing and the failing
 * form of every case.
 */

describe('the rule set', () => {
  it('gives every rule a unique id', () => {
    const ids = RULES.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('names each rule with the constraint file it enforces', () => {
    for (const rule of RULES) {
      expect(rule.id).toMatch(/^0\d-[a-z-]+:/)
      expect(rule.constraint).toMatch(/^0\d-[a-z-]+\.md$/)
    }
  })
})

describe('checkFile', () => {
  it('runs every rule that applies to the path', () => {
    const found = checkFile(file('packages/domain/src/a.ts', 'const x: string | null = 1'))
    expect(found.map((v) => v.rule)).toContain('01-typescript:no-null-union')
  })

  it('skips generated files', () => {
    expect(checkFile(file('apps/desktop/src/renderer/routeTree.gen.ts', 'type T = string | null'))).toEqual([])
  })

  it('skips files outside the source tree', () => {
    expect(checkFile(file('README.md', 'type T = string | null'))).toEqual([])
  })

  it('carries the constraint file for each violation', () => {
    const [first] = checkFile(file('packages/domain/src/a.ts', 'const x: string | null = 1'))
    expect(first.constraint).toBe('01-typescript.md')
  })
})
