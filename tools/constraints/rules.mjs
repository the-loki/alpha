/**
 * The rules behind `pnpm check:constraints`, as pure functions over a file's path and text.
 *
 * A rule reports violations; it never edits. Fixtures live in `rules.test.mjs` and both the
 * passing and failing form of every rule is pinned there, so a rule that stops matching is
 * caught by the test suite rather than by a silent green check over the whole repo.
 *
 * Test files are exempt from the two style rules (`nullable-union`, `any-usage`) because a
 * fixture has to be able to show the banned form.
 */

const GENERATED = [/(^|\/)node_modules\//, /(^|\/)out\//, /(^|\/)dist\//, /(^|\/)coverage\//, /\.gen\.ts$/]

const isSource = (path) => /^packages\/[^/]+\/src\//.test(path) || /^tools\//.test(path)
const isTs = (path) => /\.tsx?$/.test(path)
const isDeclaration = (path) => /\.d\.ts$/.test(path)
const isTest = (path) => /\.(test|spec)\.[cm]?tsx?$/.test(path)
const isCheckerSource = (path) => path.startsWith('tools/constraints/')

const stripStrings = (line) =>
  line
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``')

const countCodeLines = (lines) =>
  lines.filter((line) => {
    const trimmed = line.trim()
    return trimmed !== '' && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
  }).length

const ignoreMarker = (line) => {
  const match = line.match(/constraints-ignore\s+([0-9a-z-]+)/)
  return match ? match[1] : ''
}

const ignoredFor = (line, rule) => {
  const marker = ignoreMarker(line)
  if (marker === '') return false
  return marker === rule.id || marker === rule.constraint.replace(/\.md$/, '')
}

const NODE_BUILTINS = new Set([
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'crypto',
  'dgram',
  'dns',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'querystring',
  'readline',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
])

const importSpecifiers = (line) => {
  const stripped = line.trim()
  const from = stripped.match(/^import\s[^'"]*['"]([^'"]+)['"]/)
  if (from) return [from[1]]
  const bare = stripped.match(/^import\s+['"]([^'"]+)['"]/)
  if (bare) return [bare[1]]
  const required = stripped.match(/require\(\s*['"]([^'"]+)['"]\s*\)/)
  if (required) return [required[1]]
  const dynamic = stripped.match(/^import\(\s*['"]([^'"]+)['"]\s*\)/)
  if (dynamic) return [dynamic[1]]
  return []
}

const isNodeBuiltin = (specifier) =>
  specifier.startsWith('node:') || NODE_BUILTINS.has(specifier) || NODE_BUILTINS.has(specifier.split('/')[0])

/** Finds `function name() {` and `const name = () => {` starts, and their balanced closing brace. */
const functionBlocks = (lines) => {
  const blocks = []
  const startPatterns = [
    /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*[A-Za-z_$]/,
    /^\s*(?:export\s+)?(?:const|let)\s+[A-Za-z_$][\w$]*\s*(?::[^=]*)?=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=>\s*\{/,
  ]
  for (let index = 0; index < lines.length; index += 1) {
    if (!startPatterns.some((pattern) => pattern.test(lines[index]))) continue
    let depth = 0
    let opened = false
    let end = index
    for (let cursor = index; cursor < lines.length; cursor += 1) {
      const text = stripStrings(lines[cursor]).replace(/\/\/.*$/, '')
      for (const char of text) {
        if (char === '{') {
          depth += 1
          opened = true
        } else if (char === '}') {
          depth -= 1
        }
      }
      if (opened && depth <= 0) {
        end = cursor
        break
      }
    }
    // The limit in 02-architecture.md is on the body, so the signature line and the closing
    // brace are not counted.
    if (opened) blocks.push({ start: index + 1, length: Math.max(end - index - 1, 0) })
  }
  return blocks
}

const lineRule = ({ id, constraint, description, applies, pattern, message }) => ({
  id,
  constraint,
  description,
  check({ path, text }) {
    if (!applies(path)) return []
    const found = []
    text.split('\n').forEach((line, index) => {
      if (!pattern.test(stripStrings(line))) return
      if (ignoredFor(line, { id, constraint })) return
      found.push({ line: index + 1, message, text: line.trim() })
    })
    return found
  },
})

export const RULES = [
  lineRule({
    id: '01-typescript:no-null-union',
    constraint: '01-typescript.md',
    description: 'undefined is the absence value, not null',
    applies: (path) => isTs(path) && !isDeclaration(path) && !isTest(path),
    pattern: /\|\s*null\b/,
    message: 'a null union; express absence as undefined, or convert null at the boundary that produced it',
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

  {
    id: '02-architecture:core-stays-pure',
    constraint: '02-architecture.md',
    description: 'core imports neither Electron nor Node',
    check({ path, text }) {
      if (!path.startsWith('packages/core/src/')) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        for (const specifier of importSpecifiers(line)) {
          if (specifier === 'electron' || isNodeBuiltin(specifier)) {
            found.push({
              line: index + 1,
              message: `core must not import ${specifier}; move the I/O to an adapter in main`,
              text: line.trim(),
            })
          }
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:renderer-has-no-model-client',
    constraint: '02-architecture.md',
    description: 'the renderer holds no model client',
    check({ path, text }) {
      if (!path.startsWith('packages/renderer/src/')) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        for (const specifier of importSpecifiers(line)) {
          if (specifier.startsWith('@earendil-works/')) {
            found.push({
              line: index + 1,
              message: 'the renderer must reach the agent through the IPC contract, not directly',
              text: line.trim(),
            })
          }
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:max-file-lines',
    constraint: '02-architecture.md',
    description: 'a file fits in a head',
    check({ path, text }) {
      if (!isSource(path) || isTest(path) || isCheckerSource(path) || isDeclaration(path)) return []
      if (!/\.(ts|tsx|mjs|js)$/.test(path)) return []
      const count = countCodeLines(text.split('\n'))
      if (count <= 300) return []
      return [{ line: 1, message: `file has ${count} code lines; the limit is 300 — split it`, text: '' }]
    },
  },

  {
    id: '02-architecture:max-function-lines',
    constraint: '02-architecture.md',
    description: 'a function fits on a screen',
    check({ path, text }) {
      if (!isSource(path) || isTest(path) || isDeclaration(path) || !isTs(path)) return []
      const limit = path.startsWith('packages/renderer/') && path.endsWith('.tsx') ? 120 : 60
      return functionBlocks(text.split('\n'))
        .filter((block) => block.length > limit)
        .map((block) => ({
          line: block.start,
          message: `function runs ${block.length} lines; the limit is ${limit}`,
          text: '',
        }))
    },
  },

  {
    id: '05-design:no-px-lengths',
    constraint: '05-design.md',
    description: 'lengths are rem, so the window scale applies',
    check({ path, text }) {
      if (!path.startsWith('packages/renderer/')) return []
      if (!/\.(ts|tsx|css)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        const trimmed = line.trim()
        // A comment may talk about px; only lengths count.
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
        // 1px hairlines are the one length that has to stay a device pixel to stay crisp.
        const lengths = line.match(/(?<![\d.])[\d.]+px\b/g) ?? []
        for (const length of lengths) {
          if (length === '1px') continue
          found.push({
            line: index + 1,
            message: `${length} is a length in px; use the named tokens or Tailwind's scale (rem)`,
            text: trimmed,
          })
        }
      })
      return found
    },
  },

  {
    id: '03-product-scope:no-hardcoded-hosts',
    constraint: '03-product-scope.md',
    description: 'the only hosts are configured providers',
    check({ path, text }) {
      const exempt =
        path.startsWith('docs/') ||
        path.startsWith('e2e/') ||
        isTest(path) ||
        path.includes('/providers/templates') ||
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
          message: 'hard-coded host; provider hosts belong in the provider templates module',
          text: line.trim(),
        })
      })
      return found
    },
  },
]

export const ruleById = (id) => {
  const rule = RULES.find((candidate) => candidate.id === id)
  if (!rule) throw new Error(`unknown rule: ${id}`)
  return rule
}

export const checkFile = (file) => {
  if (GENERATED.some((pattern) => pattern.test(file.path))) return []
  if (!isSource(file.path)) return []
  return RULES.flatMap((rule) =>
    rule
      .check(file)
      .map((violation) => ({ ...violation, rule: rule.id, constraint: rule.constraint, path: file.path })),
  )
}
