/**
 * The one architecture rule that reads the tree rather than a file: contract channels, agreed between the contract, the handlers, and the bridge.
 *
 * A rule reports violations and never edits: a pure function over a file's path and text.
 */
import {
  channelsUsedWith,
  contractChannels,
  handledNamesOf,
  ignoredFor,
  isComment,
  isMainSource,
  isPreloadSource,
  isSeamFile,
  pushedNamesOf,
} from '../lib.mjs'

export const CONTRACT_RULES = [
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
]
