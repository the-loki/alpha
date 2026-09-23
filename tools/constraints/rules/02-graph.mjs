/**
 * The architecture rules that read the tree rather than a file: the contract channels, agreed between
 * the contract, the handlers and the bridge, and the import graph, which may not contain a cycle —
 * C2.1's "nothing points sideways" said at file granularity, where the dependency table cannot see.
 *
 * A rule reports violations and never edits: a pure function over a file's path and text.
 */
import {
  channelsUsedWith,
  contractChannels,
  handledNamesOf,
  ignoredFor,
  importSpecifiers,
  isComment,
  isMainSource,
  isPreloadSource,
  isSeamFile,
  isSource,
  isTs,
  pushedNamesOf,
} from '../lib.mjs'

/**
 * The specifier a statement depends on, if it has one: an `import`, a `require`, or an `export …
 * from` — a re-export is a dependency as surely as an import is, and the shared reader stops at
 * imports. A statement may wrap over several lines, so the lines are joined until the quote closes;
 * `start` is the line the statement began on, which is where a violation points.
 */
const statementSpecifier = (line) => {
  const trimmed = line.trim()
  const reexport = trimmed.match(/^export\s[\s\S]*?from\s*['"]([^'"]+)['"]/)
  if (reexport !== null) return reexport[1]
  const specifiers = importSpecifiers(line)
  return specifiers.length === 0 ? undefined : specifiers[0]
}

/** Whether a line opens a statement whose specifier has not arrived yet. */
const opensStatement = (line) => /^\s*(import|export)\b/.test(line) && !/from\s*['"]/.test(line)

/**
 * Where an import points, as a path in the scanned set: a relative specifier resolves against the
 * file that wrote it (the repo spells the extension), and `@alpha/x` is whatever that package's own
 * manifest says its entry is — `src/index.ts` for most, `src/i18n.ts` for the dictionary, and the
 * manifest is the only thing that knows. Anything else — pi, node, a third party — leaves the
 * graph, so the rule stays about this repo.
 */
const importTarget = (from, specifier, entries) => {
  if (specifier.startsWith('.')) {
    const parts = from.split('/').slice(0, -1)
    for (const step of specifier.split('/')) {
      if (step === '.' || step === '') continue
      if (step === '..') parts.pop()
      else parts.push(step)
    }
    return parts.join('/')
  }
  if (specifier.startsWith('@alpha/')) {
    const name = specifier.slice('@alpha/'.length)
    return entries.get(name) ?? `packages/${name}/src/index.ts`
  }
  return ''
}

/** Each package's entry, read from its manifest's `exports["."]`: the one place that decides it. */
const packageEntries = (files) => {
  const entries = new Map()
  for (const file of files) {
    const manifest = file.path.match(/^packages\/([^/]+)\/package\.json$/)
    if (manifest === null) continue
    try {
      const entry = JSON.parse(file.text).exports?.['.']
      if (typeof entry === 'string') entries.set(manifest[1], `packages/${manifest[1]}/${entry.replace(/^\.\//, '')}`)
    } catch {
      // A manifest that will not parse is somebody else's rule's business.
    }
  }
  return entries
}

/** The graph of this repo's own imports, as `file -> the files it imports`. */
const importGraph = (files) => {
  const sources = files.filter((file) => isSource(file.path) && isTs(file.path))
  const known = new Set(sources.map((file) => file.path))
  const entries = packageEntries(files)
  const edges = new Map()
  for (const file of sources) {
    const targets = []
    let pending = ''
    let pendingLine = 0
    file.text.split('\n').forEach((line, index) => {
      if (isComment(line)) return
      const statement = pending === '' ? line : `${pending} ${line.trim()}`
      if (pending === '' && opensStatement(line)) {
        pending = line.trim()
        pendingLine = index + 1
        return
      }
      if (pending !== '') {
        pending = statement
        if (!/from\s*['"]/.test(statement)) return
      }
      const specifier = statementSpecifier(statement)
      const start = pendingLine === 0 ? index + 1 : pendingLine
      pending = ''
      pendingLine = 0
      if (specifier === undefined) return
      const target = importTarget(file.path, specifier, entries)
      if (target !== '' && known.has(target)) targets.push({ target, line: start, text: statement.trim() })
    })
    edges.set(file.path, targets)
  }
  return { known, edges }
}

export const GRAPH_RULES = [
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
    id: '02-architecture:no-import-cycles',
    constraint: '02-architecture.md',
    description: 'the import graph is a DAG, at file granularity as well as between packages',
    checkAll(files) {
      const { edges } = importGraph(files)
      const found = []
      // Three colours: WHITE is unvisited (absent from the map), GREY is on the current path, BLACK
      // is finished. A GREY target is a back edge, and the cycle is the path from it to here.
      const state = new Map()
      const path = []
      const reported = new Set()
      const walk = (file) => {
        state.set(file, 'grey')
        path.push(file)
        for (const edge of edges.get(file) ?? []) {
          const target = state.get(edge.target)
          if (target === 'grey') {
            const cycle = path.slice(path.indexOf(edge.target))
            const key = [...cycle].sort().join('|')
            if (!reported.has(key)) {
              reported.add(key)
              found.push({
                path: file,
                line: edge.line,
                message: `a cycle: ${[...cycle, edge.target].map((one) => one.split('/').pop()).join(' → ')}`,
                text: edge.text,
              })
            }
            continue
          }
          if (target !== 'black') walk(edge.target)
        }
        path.pop()
        state.set(file, 'black')
      }
      for (const file of edges.keys()) if (state.get(file) === undefined) walk(file)
      return found
    },
  },
]
