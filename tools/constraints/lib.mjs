/**
 * The shared half of the checker: how a path is classified, how a line is read for imports,
 * strings, comments and function bodies, the marker that lets one line opt out, the reads the
 * contract rules do over three files at once, and the three tables the rules consult — the pure
 * packages, the packages that may name the agent library, and which library may import which.
 *
 * Rules live in `rules/`, one module per constraint document; this file knows nothing about any
 * single rule, which is what lets a rule be read without the machinery around it.
 */
export const GENERATED = [/(^|\/)node_modules\//, /(^|\/)out\//, /(^|\/)dist\//, /(^|\/)coverage\//, /\.gen\.ts$/]

// The app is one package under apps/ (three process directories); the libraries are under packages/.
export const isSource = (path) => /^(apps|packages)\/[^/]+\/src\//.test(path) || /^tools\//.test(path)
export const isTs = (path) => /\.tsx?$/.test(path)
export const isDeclaration = (path) => /\.d\.ts$/.test(path)
export const isTest = (path) => /\.(test|spec)\.[cm]?tsx?$/.test(path)
export const isCheckerSource = (path) => path.startsWith('tools/constraints/')
/** Hand-written, and exempt on purpose: the dictionary grows as one table per language, and splitting it would cost more than the budget it borrows. */
export const isGenerated = (path) => path.startsWith('packages/i18n/src/')

/**
 * The libraries that do no I/O at all: the dictionary the interface is written in, the rules the
 * workbench decides with, the plugin base a capability's policy half is written against, and the
 * contract between the processes. Every other library may read the disk and the clock — it just
 * may not hold a window, which `no-electron-in-libraries` is about.
 */
export const PURE_PACKAGES = [
  'packages/i18n/src/',
  'packages/domain/src/',
  'packages/plugin/src/',
  'packages/contract/src/',
]

/**
 * The packages the agent library links into, and therefore name pi: `@alpha/agent`, which turns
 * plugins into a running agent and drives a run to its end; `@alpha/internal-plugins`, which holds
 * Alpha's own plugins — the faces are where pi's own shapes are the capability (a tool is an
 * `AgentTool`, a hook is asked about pi's run), so each carries its own adapter and the app holds
 * nothing but the registration (C2.8) — and the fold that turns a session's entries into the
 * messages an agent starts from. Closed on purpose: a package that is not on this list may not
 * import the agent library, and no package may import Electron. A package joins it by being written
 * down here, next to its row in the table below.
 */
export const AGENT_LINKING_PACKAGES = ['packages/agent/src/', 'packages/internal-plugins/src/', 'packages/history/src/']

/**
 * Which library may import which. The dictionary sits under everything, the rules know the
 * dictionary, the contract and the plugin base know those two, and each library around the
 * workbench's own files — the sessions, the conversation list, the schedule, the connections, the
 * gate — knows the rules, plus the contract where a shape crosses the wire. A package this table
 * has never heard of may import no library at all: a new one asks for its dependencies by being
 * written down here.
 */
export const LIBRARY_DEPENDENCIES = {
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
  'packages/agent/src/': ['@alpha/domain', '@alpha/plugin'],
  'packages/history/src/': ['@alpha/domain', '@alpha/sessions'],
  'packages/internal-plugins/src/': [
    '@alpha/domain',
    '@alpha/gate',
    '@alpha/history',
    '@alpha/plugin',
    '@alpha/sessions',
  ],
}

export const stripStrings = (line) =>
  line
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``')

export const countCodeLines = (lines) =>
  lines.filter((line) => {
    const trimmed = line.trim()
    return trimmed !== '' && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
  }).length

export const ignoreMarker = (line) => {
  const match = line.match(/constraints-ignore\s+([0-9a-z-]+)/)
  return match ? match[1] : ''
}

export const ignoredFor = (line, rule) => {
  const marker = ignoreMarker(line)
  if (marker === '') return false
  return marker === rule.id || marker === rule.constraint.replace(/\.md$/, '')
}

export const NODE_BUILTINS = new Set([
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

export const importSpecifiers = (line) => {
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

export const isNodeBuiltin = (specifier) =>
  specifier.startsWith('node:') || NODE_BUILTINS.has(specifier) || NODE_BUILTINS.has(specifier.split('/')[0])

/** Finds `function name() {` and `const name = () => {` starts, and their balanced closing brace. */
export const functionBlocks = (lines) => {
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

export const lineRule = ({ id, constraint, description, applies, pattern, message }) => ({
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
export const contractChannels = (text) => {
  const channels = new Map()
  const body = text.split(/export const IPC = \{/)[1]?.split('} as const')[0] ?? ''
  for (const line of body.split('\n')) {
    const entry = line.match(/^\s*([A-Za-z_$][\w$]*):\s*'([^']+)'/)
    if (entry) channels.set(entry[1], entry[2])
  }
  return channels
}

/** The channels main pushes rather than answers, as the table declares them. */
export const pushedNamesOf = (text, contract) => {
  const body = text.split(/export const PUSHED_CHANNELS = \[/)[1]?.split(']')[0] ?? ''
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]).filter((name) => contract.has(name))
}

/** The keys of the `CHANNELS` table, mapped to the channel strings the contract gives them. */
export const handledNamesOf = (text, contract) => {
  const body = text.split(/export const CHANNELS[^=]*= \{/)[1]?.split('\n}')[0] ?? ''
  const names = []
  for (const line of body.split('\n')) {
    const entry = line.match(/^\s{2}([A-Za-z_$][\w$]*):/)
    if (entry && contract.has(entry[1])) names.push(entry[1])
  }
  return names
}

export const channelsUsedWith = (files, prefix, pattern) => {
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
export const appProcessOf = (path) => {
  const match = /^apps\/desktop\/src\/(main|preload|renderer)(\/|$)/.exec(path)
  return match === null ? '' : match[1]
}

/** Where a relative import lands, written as a path in this tree, so a rule can read the target. */
export const relativeTarget = (from, specifier) => {
  if (!specifier.startsWith('.')) return ''
  const parts = from.split('/').slice(0, -1)
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return parts.join('/')
}

export const isMainSource = (path) => path.startsWith('apps/desktop/src/main/')
export const isPreloadSource = (path) => path.startsWith('apps/desktop/src/preload/')

/**
 * The one place a capability is registered (C2.8): the assembly lists the plugins a conversation
 * is built from, and everything else asks the base for what is already there.
 */
export const isPluginAssembly = (path) => path === 'apps/desktop/src/main/runtime/assemble-runtime.ts'

/** A plugin factory is named `create<Something>Plugin`, which is what makes its call sites findable. */
export const PLUGIN_FACTORY_CALL = /\bcreate[A-Za-z0-9]*Plugin\s*\(/
export const PLUGIN_FACTORY_DECLARATION = /\bfunction\s+create[A-Za-z0-9]*Plugin\s*\(/

/** The library a file belongs to, as a path prefix, or '' for anything that is not a library file. */
export const libraryOf = (path) => {
  const match = /^(packages\/[^/]+\/src\/)/.exec(path)
  return match === null ? '' : match[1]
}

export const isLibrarySource = (path) => libraryOf(path) !== ''

/** The one file on each side that is allowed to know the transport exists. */
export const isSeamFile = (path) =>
  path === 'apps/desktop/src/main/ipc.ts' || path === 'apps/desktop/src/preload/index.ts'

/** Whether a line is only prose: the transport may be named in a comment and nowhere else. */
export const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line)
