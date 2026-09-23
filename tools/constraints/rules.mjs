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

// The app is one package under apps/ (three process directories); the libraries are under packages/.
const isSource = (path) => /^(apps|packages)\/[^/]+\/src\//.test(path) || /^tools\//.test(path)
const isTs = (path) => /\.tsx?$/.test(path)
const isDeclaration = (path) => /\.d\.ts$/.test(path)
const isTest = (path) => /\.(test|spec)\.[cm]?tsx?$/.test(path)
const isCheckerSource = (path) => path.startsWith('tools/constraints/')
/** Hand-written, and exempt on purpose: the dictionary grows as one table per language, and splitting it would cost more than the budget it borrows. */
const isGenerated = (path) => path.startsWith('packages/i18n/src/')

/**
 * The libraries that do no I/O at all: the dictionary the interface is written in, the rules the
 * workbench decides with, the plugin base a capability's policy half is written against, and the
 * contract between the processes. Every other library may read the disk and the clock — it just
 * may not hold a window, which `no-electron-in-libraries` is about.
 */
const PURE_PACKAGES = ['packages/i18n/src/', 'packages/domain/src/', 'packages/plugin/src/', 'packages/contract/src/']

/**
 * The packages the agent library links into, and therefore name pi: `@alpha/internal-plugins`,
 * which holds Alpha's own plugins — the faces are where pi's own shapes are the capability (a tool
 * is an `AgentTool`, a hook is asked about pi's run), so each carries its own adapter and the app
 * holds nothing but the registration (C2.8) — and the fold that turns a session's entries into the
 * messages an agent starts from. Closed on purpose: a package that is not on this list may not
 * import the agent library, and no package may import Electron. A package joins it by being written
 * down here, next to its row in the table below.
 */
const AGENT_LINKING_PACKAGES = ['packages/internal-plugins/src/', 'packages/history/src/']

/**
 * Which library may import which. The dictionary sits under everything, the rules know the
 * dictionary, the contract and the plugin base know those two, and each library around the
 * workbench's own files — the sessions, the conversation list, the schedule, the connections, the
 * gate — knows the rules, plus the contract where a shape crosses the wire. A package this table
 * has never heard of may import no library at all: a new one asks for its dependencies by being
 * written down here.
 */
const LIBRARY_DEPENDENCIES = {
  'packages/i18n/src/': [],
  'packages/domain/src/': ['@alpha/i18n'],
  'packages/contract/src/': ['@alpha/domain', '@alpha/i18n'],
  'packages/plugin/src/': ['@alpha/domain'],
  'packages/state/src/': ['@alpha/domain'],
  'packages/sessions/src/': ['@alpha/domain'],
  'packages/conversations/src/': ['@alpha/domain'],
  'packages/tasks/src/': ['@alpha/domain'],
  'packages/providers/src/': ['@alpha/contract', '@alpha/domain'],
  'packages/gate/src/': ['@alpha/domain', '@alpha/plugin', '@alpha/state'],
  'packages/history/src/': ['@alpha/domain', '@alpha/sessions'],
  'packages/internal-plugins/src/': [
    '@alpha/domain',
    '@alpha/gate',
    '@alpha/history',
    '@alpha/plugin',
    '@alpha/sessions',
  ],
}

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

/** Which process of the app a path belongs to, or '' for anything that is not the app's source. */
const appProcessOf = (path) => {
  const match = /^apps\/desktop\/src\/(main|preload|renderer)(\/|$)/.exec(path)
  return match === null ? '' : match[1]
}

/** Where a relative import lands, written as a path in this tree, so a rule can read the target. */
const relativeTarget = (from, specifier) => {
  if (!specifier.startsWith('.')) return ''
  const parts = from.split('/').slice(0, -1)
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return parts.join('/')
}

const isMainSource = (path) => path.startsWith('apps/desktop/src/main/')
const isPreloadSource = (path) => path.startsWith('apps/desktop/src/preload/')

/**
 * The one place a capability is registered (C2.8): the assembly lists the plugins a conversation
 * is built from, and everything else asks the base for what is already there.
 */
const isPluginAssembly = (path) => path === 'apps/desktop/src/main/runtime/assemble-runtime.ts'

/** A plugin factory is named `create<Something>Plugin`, which is what makes its call sites findable. */
const PLUGIN_FACTORY_CALL = /\bcreate[A-Za-z0-9]*Plugin\s*\(/
const PLUGIN_FACTORY_DECLARATION = /\bfunction\s+create[A-Za-z0-9]*Plugin\s*\(/

/** The library a file belongs to, as a path prefix, or '' for anything that is not a library file. */
const libraryOf = (path) => {
  const match = /^(packages\/[^/]+\/src\/)/.exec(path)
  return match === null ? '' : match[1]
}

const isLibrarySource = (path) => libraryOf(path) !== ''

/** The one file on each side that is allowed to know the transport exists. */
const isSeamFile = (path) => path === 'apps/desktop/src/main/ipc.ts' || path === 'apps/desktop/src/preload/index.ts'

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

  {
    id: '02-architecture:pure-packages-have-no-io',
    constraint: '02-architecture.md',
    description: 'the dictionary, the rules and the contract import neither Electron nor Node',
    check({ path, text }) {
      if (!PURE_PACKAGES.some((prefix) => path.startsWith(prefix))) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        for (const specifier of importSpecifiers(line)) {
          if (specifier === 'electron' || isNodeBuiltin(specifier)) {
            found.push({
              line: index + 1,
              message: `a pure package must not import ${specifier}; move the I/O to an adapter in main`,
              text: line.trim(),
            })
          }
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:no-electron-in-libraries',
    constraint: '02-architecture.md',
    description: 'no library holds a window',
    check({ path, text }) {
      if (!isLibrarySource(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        for (const specifier of importSpecifiers(line)) {
          if (specifier === 'electron') {
            found.push({
              line: index + 1,
              message: 'Electron belongs to the app: a library that holds a window cannot be tested alone',
              text: line.trim(),
            })
          }
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:libraries-point-one-way',
    constraint: '02-architecture.md',
    description: 'a library imports only what sits under it',
    check({ path, text }) {
      const mine = libraryOf(path)
      if (mine === '') return []
      const allowed = LIBRARY_DEPENDENCIES[mine] ?? []
      const found = []
      text.split('\n').forEach((line, index) => {
        if (isComment(line)) return
        for (const specifier of importSpecifiers(line)) {
          if (specifier.startsWith('@alpha/')) {
            if (allowed.includes(specifier)) continue
            found.push({
              line: index + 1,
              message: `${specifier} is not below this library: C2.1 says which way the arrows point`,
              text: line.trim(),
            })
            continue
          }
          const target = relativeTarget(path, specifier)
          if (target !== '' && !target.startsWith(mine)) {
            found.push({
              line: index + 1,
              message: 'a library reaches another through its package, and the app not at all',
              text: line.trim(),
            })
          }
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:capabilities-are-plugins',
    constraint: '02-architecture.md',
    description: 'a capability is registered in the assembly, not wired where it is used',
    check({ path, text }) {
      if (!isMainSource(path) || isTest(path) || isPluginAssembly(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        if (isComment(line)) return
        // Strings are stripped first: a factory named inside one is not a call to it.
        if (!PLUGIN_FACTORY_CALL.test(stripStrings(line)) || PLUGIN_FACTORY_DECLARATION.test(line)) return
        if (ignoredFor(line, { id: '02-architecture:capabilities-are-plugins', constraint: '02-architecture.md' })) {
          return
        }
        found.push({
          line: index + 1,
          message: 'a capability is registered in the assembly (assemble-runtime.ts), and nowhere else',
          text: line.trim(),
        })
      })
      return found
    },
  },

  {
    id: '02-architecture:renderer-has-no-model-client',
    constraint: '02-architecture.md',
    description: 'the renderer holds no model client',
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
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
    id: '02-architecture:processes-stay-apart',
    constraint: '02-architecture.md',
    description: 'a process reaches another over the contract, never through its files',
    check({ path, text }) {
      const mine = appProcessOf(path)
      if (mine === '') return []
      const found = []
      text.split('\n').forEach((line, index) => {
        if (isComment(line)) return
        for (const specifier of importSpecifiers(line)) {
          const theirs = appProcessOf(relativeTarget(path, specifier))
          if (theirs === '' || theirs === mine) continue
          found.push({
            line: index + 1,
            message: `${mine} may not import ${theirs}: the processes talk over the contract`,
            text: line.trim(),
          })
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:renderer-is-solid',
    constraint: '02-architecture.md',
    description: 'the window is drawn by Solid, and React does not come back',
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/') || !/\.(ts|tsx)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        if (isComment(line)) return
        for (const specifier of importSpecifiers(line)) {
          const react = specifier === 'react' || specifier === 'react-dom' || specifier === 'zustand'
          if (react || specifier.startsWith('@tanstack/') || /^react-(dom|markdown)/.test(specifier)) {
            found.push({
              line: index + 1,
              message: 'the window is Solid: a React package here means the migration grew back',
              text: line.trim(),
            })
          }
        }
      })
      return found
    },
  },

  {
    id: '02-architecture:no-agent-dependency',
    constraint: '02-architecture.md',
    description: 'the agent library links into main and the packages that attach to it, nowhere else',
    check({ path, text }) {
      if (!isSource(path) || !path.includes('/src/')) return []
      // The runtime is where the agent lives (ADR-0025); everywhere else the contract is the door,
      // except in the package that carries a capability whose face is pi's own shape (C2.8).
      if (path.startsWith('apps/desktop/src/main/')) return []
      if (AGENT_LINKING_PACKAGES.some((mine) => path.startsWith(mine))) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        if (isComment(line) || line.includes('npm install')) return
        for (const specifier of importSpecifiers(line)) {
          if (specifier.startsWith('@earendil-works/') || /^pi-(agent-core|ai)$/.test(specifier)) {
            found.push({
              line: index + 1,
              message: 'the agent library links into main and its capability packages: C2.0 names them',
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
      if (!isSource(path) || isTest(path) || isCheckerSource(path) || isDeclaration(path) || isGenerated(path)) {
        return []
      }
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
      const limit = path.startsWith('apps/desktop/src/renderer/') && path.endsWith('.tsx') ? 120 : 60
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
    description: 'no px: a length in the window is rem or a Tailwind utility',
    // C5.4: rem applies the window's scale; a device pixel does not. Zero exemptions — not a
    // shadow's blur, not a hairline, not a comment: prose is where a stray length hides, so the
    // stylesheet and the components are read the same way, line by line, with no line skipped.
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
      if (!/\.(ts|tsx|css|html)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        const lengths = line.match(/(?<![\d.])[\d.]+px\b/g) ?? []
        for (const length of lengths) {
          found.push({
            line: index + 1,
            message: `${length} is a length in px; use rem or a Tailwind utility — the window's scale applies to every length (C5.4)`,
            text: line.trim(),
          })
        }
      })
      return found
    },
  },

  {
    id: '05-design:two-voices',
    constraint: '05-design.md',
    description: 'the text is sans (font-text, Inter) and the apparatus is mono; there is no third face',
    // C5.3: two voices, and only two. The text voice keeps its own name — font-text, backed by
    // Inter — so a raw `font-sans` (the framework's system stack), a serif, a display face or an
    // arbitrary `font-[…]` are each drift away from that pair, banned outright in classes and in
    // the stylesheet alike.
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
      if (!/\.(ts|tsx|css)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
        const third = line.match(/\bfont-(?:sans|serif|display)\b|--font-(?:sans|serif|display)\s*:|\bfont-\[/)
        if (third === null) return
        found.push({
          line: index + 1,
          message: `${third[0]} is a third face; the text is font-text (Inter) and the apparatus is font-mono (C5.3)`,
          text: trimmed,
        })
      })
      return found
    },
  },

  {
    id: '05-design:no-focus-outline-none',
    constraint: '05-design.md',
    description: 'the keyboard keeps its ring; a control never removes it',
    // C5.7: `:focus-visible` draws the ring for the whole app. A control that writes
    // `focus:outline-none` beats that rule on specificity and leaves the keyboard with nothing, so
    // the class is not one this app writes — the composer, every settings field and the palette's
    // search box had it, and a field may change its border on focus instead of, never without, the
    // ring.
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
      if (!/\.(ts|tsx|css)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
        if (!/focus:outline-none/.test(line)) return
        if (ignoredFor(line, { id: '05-design:no-focus-outline-none', constraint: '05-design.md' })) return
        found.push({
          line: index + 1,
          message: 'focus:outline-none removes the accent focus ring; the ring is never removed (C5.7)',
          text: trimmed,
        })
      })
      return found
    },
  },

  {
    id: '05-design:no-other-weights',
    constraint: '05-design.md',
    description: 'three weights exist: 400, 500 and 600',
    // Read whole lines rather than stripped ones: a weight lives inside a class list, and stripping
    // quoted text is exactly how it would hide. Hierarchy comes from size, colour and space, so the
    // rule names the forbidden weights — and the numeric declaration, where 450 or 700 would drift
    // in without ever touching a class.
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
      if (!/\.(ts|tsx|css)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
        const weight = line.match(/\bfont-(?:extralight|bold|extrabold|black|light|thin)\b/)
        if (weight !== null) {
          found.push({
            line: index + 1,
            message: `${weight[0]} is a weight this interface does not have; the weights are 400, 500 and 600, and hierarchy is size, colour and space (C5.3)`,
            text: trimmed,
          })
          return
        }
        const numeric = line.match(/font-weight:\s*(\d+)/)
        if (numeric !== null && !['400', '500', '600'].includes(numeric[1])) {
          found.push({
            line: index + 1,
            message: `font-weight: ${numeric[1]}; the weights are 400, 500 and 600 (C5.3)`,
            text: trimmed,
          })
        }
      })
      return found
    },
  },

  {
    id: '05-design:no-uppercase-labels',
    constraint: '05-design.md',
    description: 'labels are sentence case; the apparatus does not shout',
    // C5.8: Codex set its labels in uppercase wide-tracked mono "by typography rather than by
    // shouting"; Caliper retires the idiom with the print furniture. The two class names are the
    // whole shout — a stylesheet's `text-transform: uppercase` carries the same word — so the
    // word is what the checker bans, in classes and declarations alike.
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
      if (!/\.(ts|tsx|css)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.includes('/*') || trimmed.includes('*/')) {
          return
        }
        const shout = line.match(/\b(?:uppercase|tracking-widest)\b/)
        if (shout === null) return
        found.push({
          line: index + 1,
          message: `${shout[0]} is the shout the apparatus retired; labels are sentence-case mono (C5.8)`,
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
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
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
      if (path.startsWith('apps/desktop/src/renderer/') && /\b(ipcRenderer|ipcMain|contextBridge)\b/.test(text)) {
        found.push({ line: 1, message: 'the renderer must reach the main process through the bridge', text: '' })
      }
      return found
    },
    checkAll(files) {
      const contract = files.find((candidate) => candidate.path === 'packages/contract/src/contract.ts')
      if (contract === undefined) return []
      const channels = contractChannels(contract.text)
      // The handlers are a table now, so what is handled is read from its keys rather than from
      // the registrations: both transports dispatch that one table.
      const table = files.find((candidate) => candidate.path === 'apps/desktop/src/main/channels.ts')
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
