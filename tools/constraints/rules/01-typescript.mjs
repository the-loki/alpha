/**
 * The TypeScript rules, one per file read: the absence value named, no default export, `any` accounted for, a suppressed error explained.
 *
 * A rule reports violations and never edits: a pure function over a file's path and text.
 */
import { isDeclaration, isSource, isTest, isTs, lineRule } from '../lib.mjs'

export const TYPESCRIPT_RULES = [
  lineRule({
    id: '01-typescript:no-null-union',
    constraint: '01-typescript.md',
    description: 'undefined is the absence value, not null',
    applies: (path) => isTs(path) && !isDeclaration(path) && !isTest(path),
    pattern: /\|\s*null\b/,
    message:
      'a null union; name it Null<T> where the foreign system speaks null, or convert it at the boundary that produced it (C1.2)',
  }),

  lineRule({
    id: '01-typescript:absence-is-named',
    constraint: '01-typescript.md',
    description: 'absence is Undef<T>, not a union spelled out',
    applies: (path) => isTs(path) && !isDeclaration(path) && !isTest(path),
    pattern: /\|\s*undefined\b/,
    message: 'a bare union with undefined; name it Undef<T>, or use ? on a property or an omittable parameter (C1.2)',
  }),

  lineRule({
    id: '01-typescript:no-default-export',
    constraint: '01-typescript.md',
    description: 'named exports only',
    applies: (path) => isSource(path) && isTs(path) && !isDeclaration(path),
    pattern: /^\s*export\s+default\b/,
    message: 'default export; use a named export so the symbol greps and renames cleanly',
  }),

  lineRule({
    id: '01-typescript:any-usage',
    constraint: '01-typescript.md',
    description: 'any only at a validated boundary',
    applies: (path) => isTs(path) && !isDeclaration(path) && !isTest(path),
    pattern: /(?::\s*any\b|\bas\s+any\b|<any>|\bany\[\]|Array<any>|Promise<any>)/,
    message: 'any leaked past a trust boundary',
  }),

  {
    id: '01-typescript:ts-expect-error-reason',
    constraint: '01-typescript.md',
    description: 'suppressions carry a reason',
    check({ path, text }) {
      if (!isTs(path) || isDeclaration(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        if (/@ts-ignore/.test(line)) {
          found.push({
            line: index + 1,
            message: '@ts-ignore is banned; use @ts-expect-error with a reason',
            text: line.trim(),
          })
          return
        }
        const suppression = line.match(/@ts-expect-error\s*(.*)$/)
        if (suppression && suppression[1].trim().length < 3) {
          found.push({ line: index + 1, message: '@ts-expect-error without a reason', text: line.trim() })
        }
      })
      return found
    },
  },
]
