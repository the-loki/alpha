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

/**
 * The contract's channel names, read out of the module that declares them. The object is a plain
 * literal by construction, so this reads it rather than importing it: the checker stays a script
 * over text, and a rule that cannot parse its own repo is a rule nobody can trust.
 */
const contractChannels = (text) => {
  const channels = new Map()
  const body = text.split(/export const IPC = \{/)[1]?.split('} as const')[0] ?? ''
  for (const line of body.split('\n')) {
    const entry = line.match(/^\s*([A-Za-z_$][\w$]*):\s*'([^']+)'/)
    if (entry) channels.set(entry[1], entry[2])
  }
  return channels
}

/** The channels main pushes rather than answers, as the table declares them. */
const pushedNamesOf = (text, contract) => {
  const body = text.split(/export const PUSHED_CHANNELS = \[/)[1]?.split(']')[0] ?? ''
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]).filter((name) => contract.has(name))
}

/** The keys of the `CHANNELS` table, mapped to the channel strings the contract gives them. */
const handledNamesOf = (text, contract) => {
  const body = text.split(/export const CHANNELS[^=]*= \{/)[1]?.split('\n}')[0] ?? ''
  const names = []
  for (const line of body.split('\n')) {
    const entry = line.match(/^\s{2}([A-Za-z_$][\w$]*):/)
    if (entry && contract.has(entry[1])) names.push(entry[1])
  }
  return names
}

const channelsUsedWith = (files, prefix, pattern) => {
  const used = []
  for (const { path, text } of files) {
    if (!prefix(path)) continue
    text.split('\n').forEach((line, index) => {
      const found = line.match(pattern)
      if (found) used.push({ path, line: index + 1, name: found[1], text: line.trim(), raw: line })
    })
  }
  return used
}

const isMainSource = (path) => path.startsWith('packages/main/src/')
const isPreloadSource = (path) => path.startsWith('packages/preload/src/')

/** The one file on each side that is allowed to know the transport exists. */
const isSeamFile = (path) => path === 'packages/main/src/ipc.ts' || path === 'packages/preload/src/index.ts'

/** Whether a line is only prose: the transport may be named in a comment and nowhere else. */
const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line)

export const RULES = [
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
    message:
      'a bare union with undefined; name it Undef<T> from core, or use ? on a property or an omittable parameter (C1.2)',
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
      if (!/\.(ts|tsx|css|html)$/.test(path)) return []
      const found = []
      // A comment may talk about px; a length in one is still a length, so the comment state is
      // tracked rather than guessed from the line's first character — `* { gap: 6px }` is a
      // selector, not a comment.
      let inComment = false
      text.split('\n').forEach((line, index) => {
        const trimmed = line.trim()
        const comment = inComment || trimmed.startsWith('//')
        if (inComment && trimmed.includes('*/')) inComment = false
        if (trimmed.startsWith('/*') && !trimmed.includes('*/')) inComment = true
        if (comment) return
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
    id: '05-design:control-voice',
    constraint: '05-design.md',
    description: 'a control is set in sans; mono is the voice of data',
    // The rule is about the button's own className, not about everything inside it: a mono span
    // inside a button is data the button carries (a path, a count), and that is the distinction
    // the design draws. The whole tag is read at once because a className is allowed to wrap.
    check({ path, text }) {
      if (!path.startsWith('packages/renderer/')) return []
      if (!/\.tsx$/.test(path)) return []
      const found = []
      for (const tag of text.matchAll(/<button\b[^>]*>/gs)) {
        if (!/font-mono/.test(tag[0])) continue
        found.push({
          line: text.slice(0, tag.index).split('\n').length,
          message: 'a button set in mono: actions are sans, and mono is reserved for data',
          text: tag[0].split('\n')[0].trim(),
        })
      }
      return found
    },
  },

  {
    id: '05-design:no-other-weights',
    constraint: '05-design.md',
    description: 'two weights exist: medium and semibold',
    // Read whole lines rather than stripped ones: a weight lives inside a className, and stripping
    // quoted text is exactly how it would hide. Hierarchy comes from size, colour and space, so the
    // rule names the forbidden weights rather than letting a new one arrive by accident.
    check({ path, text }) {
      if (!path.startsWith('packages/renderer/')) return []
      if (!/\.(ts|tsx|css)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
        const weight = line.match(/\bfont-(?:bold|extrabold|black|light|thin)\b/)
        if (weight === null) return
        found.push({
          line: index + 1,
          message: `${weight[0]} is a weight this interface does not have; hierarchy is size, colour and space, and the only two are medium and semibold (C5.3)`,
          text: trimmed,
        })
      })
      return found
    },
  },

  {
    id: '05-design:copy-has-a-key',
    constraint: '05-design.md',
    description: 'the interface says what the dictionary says, in the language it is in',
    /*
     * Copy is found three ways, because it hides three ways: an attribute (aria-label, placeholder,
     * title), a JSX text node on one line, and a paragraph wrapped over several. Prose inside a
     * comment is prose about the code and is skipped; a line with a brace, a quote or an operator
     * in it is code that happens to have words in it.
     */
    check({ path, text }) {
      if (!path.startsWith('packages/renderer/src/')) return []
      if (!/\.tsx$/.test(path) || isTest(path)) return []
      const found = []
      const lines = text.split('\n')
      const attribute = /\b(?:aria-label|placeholder|title)="([^"]*\s[^"]*)"/g
      const singleLine = />\s*([A-Za-z][^<>{}()=;,\n]*?)\s*</g
      const codeCharacters = /[<>{}()=;'"`\\|&*]/
      const proseCharacters = /[<>{}()=;'"`\\|&*]/
      let inComment = false

      lines.forEach((line, index) => {
        const trimmed = line.trim()
        const comment = inComment || trimmed.startsWith('//') || trimmed.startsWith('*')
        // A JSX comment opens with `{/*` and closes with `*/}`; both are comments, and prose
        // wrapped inside one is prose about the code.
        const opens = trimmed.startsWith('/*') || trimmed.startsWith('{/*')
        if (inComment && trimmed.includes('*/')) inComment = false
        if (opens && !trimmed.includes('*/')) inComment = true

        for (const match of line.matchAll(attribute)) {
          found.push({ line: index + 1, message: `"${match[1]}" is copy; take it from the dictionary`, text: trimmed })
        }
        for (const match of line.matchAll(singleLine)) {
          if (match[1].split(/\s+/).length >= 2) {
            found.push({
              line: index + 1,
              message: `"${match[1]}" is copy; take it from the dictionary`,
              text: trimmed,
            })
          }
        }
        if (comment) return
        if (codeCharacters.test(trimmed)) return
        const words = trimmed.split(/\s+/).filter((word) => /[A-Za-z]/.test(word))
        const long = words.filter((word) => word.replace(/[^A-Za-z]/g, '').length >= 3)
        if (words.length >= 4 && long.length >= 2 && !proseCharacters.test(trimmed.replace(/[—-]/g, ''))) {
          found.push({
            line: index + 1,
            message: 'a sentence in a component; take it from the dictionary',
            text: trimmed,
          })
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:contract-channels',
    constraint: '02-architecture.md',
    description: 'the contract, the handlers and the bridge agree',
    // The two sides of the seam are different files, so this rule reads all of them at once and
    // follows only what it can decide: a channel written out by hand, a renderer that reached for
    // the transport, a call nothing answers, and an event nothing sends.
    check({ path, text }) {
      const found = []
      if (isMainSource(path) || isPreloadSource(path)) {
        text.split('\n').forEach((line, index) => {
          const literal = line.match(/ipc(Main|Renderer)\.(?:handle|invoke|on|send)\(\s*'([^']+)'/)
          if (literal) {
            found.push({
              line: index + 1,
              message: 'a channel written out by hand; take it from the contract module',
              text: line.trim(),
            })
          }
          // A comment may name the transport; code may not. The name is the transport whether it
          // is called or imported, so this reads the name rather than the call — the only two
          // files allowed to hold it in code are the seam itself.
          if (!isComment(line) && /\b(ipcMain|ipcRenderer|contextBridge)\b/.test(line) && !isSeamFile(path)) {
            found.push({
              line: index + 1,
              message: 'the transport is touched outside the seam (main ipc.ts and the preload)',
              text: line.trim(),
            })
          }
        })
      }
      if (path.startsWith('packages/renderer/src/') && /\b(ipcRenderer|ipcMain|contextBridge)\b/.test(text)) {
        found.push({ line: 1, message: 'the renderer must reach the main process through the bridge', text: '' })
      }
      return found
    },
    checkAll(files) {
      const contract = files.find((candidate) => candidate.path === 'packages/core/src/contract.ts')
      if (contract === undefined) return []
      const channels = contractChannels(contract.text)
      // The handlers are a table now, so what is handled is read from its keys rather than from
      // the registrations: both transports dispatch that one table.
      const table = files.find((candidate) => candidate.path === 'packages/main/src/channels.ts')
      const handled = table === undefined ? [] : handledNamesOf(table.text, channels).map((name) => channels.get(name))
      // Pushes are declared rather than spelled out at the call site — the window's subscriber
      // forwards every push channel by name — so what is sent is the declaration, not a `.send(`.
      const sent = table === undefined ? [] : pushedNamesOf(table.text, channels).map((name) => channels.get(name))
      const invoked = channelsUsedWith(files, isPreloadSource, /ipcRenderer\.invoke\(\s*IPC\.([A-Za-z_$][\w$]*)/)
      const listened = channelsUsedWith(files, isPreloadSource, /ipcRenderer\.on\(\s*IPC\.([A-Za-z_$][\w$]*)/)

      const found = []
      const ignoreable = (one) =>
        ignoredFor(one.raw, { id: '02-architecture:contract-channels', constraint: '02-architecture.md' })
      for (const call of invoked) {
        if (handled.includes(channels.get(call.name)) || ignoreable(call)) continue
        found.push({
          path: call.path,
          line: call.line,
          message: `the window calls ${channels.get(call.name)}, and nothing in main handles it`,
          text: call.text,
        })
      }
      for (const waiting of listened) {
        if (sent.includes(channels.get(waiting.name)) || ignoreable(waiting)) continue
        found.push({
          path: waiting.path,
          line: waiting.line,
          message: `the window listens for ${channels.get(waiting.name)}, which main does not push`,
          text: waiting.text,
        })
      }
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
        // The server's own address is what that one module is about: it listens, and it has to
        // say where. A provider host is still a violation anywhere a model client is built.
        path === 'packages/main/src/server/http.ts' ||
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
