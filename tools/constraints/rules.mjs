/**
 * The rules behind `pnpm check:constraints`, gathered from `rules/` — one module per constraint
 * document, and within architecture one module for the rule that reads the whole tree instead of a
 * single file. This file is only the assembly: the rules themselves are pure functions over a
 * file's path and text, and the machinery they share is `lib.mjs`.
 *
 * A rule reports violations; it never edits. Fixtures live beside each module, and both the passing
 * and the failing form of every rule is pinned there, so a rule that stops matching is caught by
 * the test suite rather than by a silent green check over the whole repo.
 */

import { GENERATED, isSource } from './lib.mjs'
import { TYPESCRIPT_RULES } from './rules/01-typescript.mjs'
import { ARCHITECTURE_RULES } from './rules/02-architecture.mjs'
import { GRAPH_RULES } from './rules/02-graph.mjs'
import { PRODUCT_SCOPE_RULES } from './rules/03-product-scope.mjs'
import { DESIGN_RULES } from './rules/05-design.mjs'

export const RULES = [
  ...TYPESCRIPT_RULES,
  ...ARCHITECTURE_RULES,
  ...GRAPH_RULES,
  ...PRODUCT_SCOPE_RULES,
  ...DESIGN_RULES,
]

export const ruleById = (id) => {
  const rule = RULES.find((candidate) => candidate.id === id)
  if (!rule) throw new Error(`unknown rule: ${id}`)
  return rule
}

/**
 * The per-file half: every rule that answers one file at a time. A rule that only makes sense over
 * the whole tree (`checkAll` and nothing else, like the import graph) is not asked here — `check.mjs`
 * runs those once over everything.
 */
export const checkFile = (file) => {
  if (GENERATED.some((pattern) => pattern.test(file.path))) return []
  if (!isSource(file.path)) return []
  return RULES.flatMap((rule) =>
    (rule.check === undefined ? [] : rule.check(file)).map((violation) => ({
      ...violation,
      rule: rule.id,
      constraint: rule.constraint,
      path: file.path,
    })),
  )
}
