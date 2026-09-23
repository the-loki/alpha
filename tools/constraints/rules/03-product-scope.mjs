/**
 * The product-scope rules: what Alpha is and is not allowed to reach for.
 *
 * A rule reports violations and never edits: a pure function over a file's path and text.
 */
import { ignoredFor, isCheckerSource, isTest } from '../lib.mjs'

export const PRODUCT_SCOPE_RULES = [
  {
    id: '03-product-scope:no-hardcoded-hosts',
    constraint: '03-product-scope.md',
    description: 'the only hosts are configured providers',
    check({ path, text }) {
      const exempt =
        path.startsWith('docs/') ||
        path.startsWith('e2e/') ||
        isTest(path) ||
        // The server's own address is what that one module is about: it listens, and it has to
        // say where. A provider host is a violation everywhere, including there.
        path === 'apps/desktop/src/main/server/http.ts' ||
        isCheckerSource(path)
      if (exempt || !/\.(ts|tsx|mjs|js|json)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        // Deliberately not stripped: the host in `const url = "https://…"` is the very thing
        // this rule exists to catch.
        if (!/https?:\/\/[a-z0-9.-]+/i.test(line)) return
        if (ignoredFor(line, { id: '03-product-scope:no-hardcoded-hosts', constraint: '03-product-scope.md' })) return
        found.push({
          line: index + 1,
          message: 'hard-coded host; a host is something the user types or an address the server listens on',
          text: line.trim(),
        })
      })
      return found
    },
  },
]
