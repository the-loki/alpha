/**
 * The fixture shape every rule consumes, and the one call the fixtures make: a repo-relative path
 * and a file's text in, a verdict out. Rules are pure over this, so each case is a string in and a
 * list of violations back.
 */
import { ruleById } from './rules.mjs'

export const file = (path, text) => ({ path, text })

export const violationsFor = (ruleId, f) => ruleById(ruleId).check(f)
