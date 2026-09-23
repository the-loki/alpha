import { describe, expect, it } from 'vitest'
import { ruleById } from '../rules.mjs'
import { file, violationsFor } from '../testing.mjs'

/** The fixtures for the one rule that reads the tree: contract channels, each with the passing and the failing form. */

describe('02-architecture:contract-channels', () => {
  const rule = '02-architecture:contract-channels'
  const crossViolations = (files) => ruleById(rule).checkAll(files)

  const contract = file(
    'packages/contract/src/contract.ts',
    ['export const IPC = {', "  ping: 'alpha:ping',", "  pong: 'alpha:pong',", '} as const'].join('\n'),
  )
  /** The table main declares: the handlers it answers with, and the channels it pushes. */
  const mainWith = (names, pushed = []) =>
    file(
      'apps/desktop/src/main/channels.ts',
      [
        `export const PUSHED_CHANNELS = [${pushed.map((name) => `'${name}'`).join(', ')}] as const`,
        'export const CHANNELS = {',
        ...names.map((name) => `  ${name}: handler,`),
        '}',
      ].join('\n'),
    )
  const preloadUsing = (body) => file('apps/desktop/src/preload/index.ts', body)

  it('flags a channel the window asks for that nothing answers', () => {
    const found = crossViolations([contract, mainWith(['ping']), preloadUsing('ipcRenderer.invoke(IPC.pong)')])
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('alpha:pong')
  })

  it('flags an event the window waits for that main does not push', () => {
    const waiting = preloadUsing('ipcRenderer.on(IPC.pong, handler)')

    expect(crossViolations([contract, mainWith(['ping']), waiting])).toHaveLength(1)
    expect(crossViolations([contract, mainWith(['ping'], ['pong']), waiting])).toEqual([])
  })

  it('passes the bridge and the table that agree', () => {
    const bridge = preloadUsing('ipcRenderer.invoke(IPC.ping)\nipcRenderer.on(IPC.pong, h)')
    expect(crossViolations([contract, mainWith(['ping'], ['pong']), bridge])).toEqual([])
  })

  it('flags a channel string written out instead of taken from the contract', () => {
    const inMain = violationsFor(rule, file('apps/desktop/src/main/ipc.ts', "ipcMain.handle('alpha:ping', () => {})"))
    expect(inMain).toHaveLength(1)

    const inPreload = violationsFor(rule, file('apps/desktop/src/preload/index.ts', "ipcRenderer.invoke('alpha:ping')"))
    expect(inPreload).toHaveLength(1)
  })

  it('flags the renderer reaching for the transport itself', () => {
    const found = violationsFor(rule, file('apps/desktop/src/renderer/a.ts', "import { ipcRenderer } from 'electron'"))
    expect(found).toHaveLength(1)
  })

  it('flags an import of the transport outside the seam, which a call alone would miss', () => {
    const imported = violationsFor(
      rule,
      file('apps/desktop/src/main/runtime/a.ts', "import { ipcMain } from 'electron'"),
    )
    expect(imported).toHaveLength(1)
  })

  it('lets a comment name the transport, because prose is not a dependency', () => {
    const prose = violationsFor(
      rule,
      file('apps/desktop/src/main/channels.ts', ' * `ipcMain`, and the HTTP server dispatches the same table'),
    )
    expect(prose).toEqual([])
  })

  it('lets a line opt out with a marker, like every other rule', () => {
    const marked = preloadUsing('ipcRenderer.invoke(IPC.pong) // constraints-ignore 02-architecture')
    expect(crossViolations([contract, mainWith(['ping']), marked])).toEqual([])
  })

  it('says nothing about files that do not touch the seam', () => {
    expect(violationsFor(rule, file('apps/desktop/src/renderer/a.tsx', 'const x = 1'))).toEqual([])
  })
})
