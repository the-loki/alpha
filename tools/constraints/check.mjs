#!/usr/bin/env node
/**
 * Enforces the machine-checkable rules in docs/constraints/.
 *
 * Usage: pnpm check:constraints [--quiet]
 *
 * Exits 1 when any violation lacks a `constraints-ignore <rule>` marker on the offending line.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkFile, RULES } from './rules.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'release',
  'coverage',
  'test-results',
  'playwright-report',
])
const SCANNED_EXTENSIONS = /\.(ts|tsx|mjs|js|json)$/

const walk = (directory, files) => {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) {
      walk(full, files)
    } else if (SCANNED_EXTENSIONS.test(entry)) {
      files.push(full)
    }
  }
  return files
}

const main = () => {
  const quiet = process.argv.includes('--quiet')
  const scanned = walk(ROOT, []).map((path) => ({
    path: relative(ROOT, path).split('\\').join('/'),
    text: readFileSync(path, 'utf-8'),
  }))
  const violations = []

  for (const file of scanned) violations.push(...checkFile(file))

  // A few rules are about how files agree with each other — the contract, its handlers and the
  // bridge — so they run once over the whole tree rather than per file.
  for (const rule of RULES) {
    if (rule.checkAll === undefined) continue
    violations.push(
      ...rule.checkAll(scanned).map((violation) => ({
        ...violation,
        rule: rule.id,
        constraint: rule.constraint,
        path: violation.path ?? rule.id,
      })),
    )
  }

  if (violations.length === 0) {
    if (!quiet) console.log(`constraints: ${RULES.length} rules, ${scanned.length} files, no violations`)
    return
  }

  for (const violation of violations) {
    const location = violation.text === '' ? '' : `\n      ${violation.text}`
    console.error(`${violation.path}:${violation.line}  [${violation.rule}]  ${violation.message}${location}`)
  }
  console.error(
    `\nconstraints: ${violations.length} violation(s). Fix them, or mark the line with "constraints-ignore ${violations[0].constraint.replace(/\.md$/, '')}".`,
  )
  process.exitCode = 1
}

main()
