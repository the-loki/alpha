import { describe, expect, it } from 'vitest'
import { file, violationsFor } from '../testing.mjs'

/** The fixtures for the architecture rules that read one file, each with the passing and the failing form. */

describe('02-architecture:processes-stay-apart', () => {
  const rule = '02-architecture:processes-stay-apart'

  it('flags a process reaching into another one', () => {
    const cases = [
      ['apps/desktop/src/renderer/a.ts', "import { gate } from '../main/runtime/gate.ts'"],
      ['apps/desktop/src/preload/a.ts', "import { start } from '../renderer/main.tsx'"],
      ['apps/desktop/src/main/a.ts', "import { shell } from '../renderer/stores/shell.ts'"],
    ]
    for (const [path, text] of cases) expect(violationsFor(rule, file(path, text))).toHaveLength(1)
  })

  it('allows the libraries and the files of the process they are written in', () => {
    const cases = [
      ['apps/desktop/src/renderer/a.ts', "import { text } from '@alpha/i18n'"],
      ['apps/desktop/src/renderer/a.ts', "import { shell } from './stores/shell.ts'"],
      ['apps/desktop/src/main/a.ts', "import { gate } from './runtime/gate.ts'"],
      ['packages/domain/src/a.ts', 'export const a = 1'],
    ]
    for (const [path, text] of cases) expect(violationsFor(rule, file(path, text))).toEqual([])
  })
})

describe('02-architecture:pure-packages-have-no-io', () => {
  const rule = '02-architecture:pure-packages-have-no-io'

  it('flags an electron import in the dictionary, the rules and the contract alike', () => {
    for (const path of ['packages/i18n/src/a.ts', 'packages/domain/src/a.ts', 'packages/contract/src/a.ts']) {
      expect(violationsFor(rule, file(path, 'import { app } from "electron"')), path).toHaveLength(1)
    }
  })

  it('flags a node builtin import in the pure packages', () => {
    expect(
      violationsFor(rule, file('packages/domain/src/a.ts', 'import { readFile } from "node:fs/promises"')),
    ).toHaveLength(1)
  })

  it('flags a bare fs import in the pure packages', () => {
    expect(violationsFor(rule, file('packages/i18n/src/a.ts', 'import fs from "fs"'))).toHaveLength(1)
  })

  it('passes a pure module importing another module of its own package', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'import { x } from "./b.ts"'))).toEqual([])
  })

  it('leaves the node-side libraries alone: a library may read the disk, it just may not hold a window', () => {
    const disk = 'import { readFile } from "node:fs/promises"'
    expect(violationsFor(rule, file('packages/sessions/src/a.ts', disk))).toEqual([])
  })

  it('does not object to electron imports outside the pure packages', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', 'import { app } from "electron"'))).toEqual([])
  })
})

describe('02-architecture:no-electron-in-libraries', () => {
  const rule = '02-architecture:no-electron-in-libraries'

  it('flags a window in any library, whatever else the library is allowed to do', () => {
    const imported = 'import { app } from "electron"'
    expect(violationsFor(rule, file('packages/sessions/src/a.ts', imported))).toHaveLength(1)

    const required = "const { app } = require('electron')"
    expect(violationsFor(rule, file('packages/state/src/a.ts', required))).toHaveLength(1)
  })

  it('lets a library read the disk and the clock', () => {
    expect(violationsFor(rule, file('packages/tasks/src/a.ts', 'import { readFileSync } from "node:fs"'))).toEqual([])
  })

  it('says nothing about the app, where Electron is the point', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/window.ts', 'import { app } from "electron"'))).toEqual([])
  })
})

describe('02-architecture:libraries-point-one-way', () => {
  const rule = '02-architecture:libraries-point-one-way'

  it('lets a library use what sits under it, and its own files', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', "import { text } from '@alpha/i18n'"))).toEqual([])
    expect(
      violationsFor(rule, file('packages/contract/src/a.ts', "import type { Undef } from '@alpha/domain'")),
    ).toEqual([])
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'import { x } from "./b.ts"'))).toEqual([])
  })

  it('flags a library reaching sideways, up, or for the app itself', () => {
    const up = "import type { Undef } from '@alpha/domain'"
    expect(violationsFor(rule, file('packages/i18n/src/a.ts', up))).toHaveLength(1)

    const sideways = "import { IPC } from '@alpha/contract'"
    expect(violationsFor(rule, file('packages/domain/src/a.ts', sideways))).toHaveLength(1)

    const theApp = "import { text } from '@alpha/desktop'"
    expect(violationsFor(rule, file('packages/domain/src/a.ts', theApp))).toHaveLength(1)
  })

  it('flags a library reaching into another package, or into the app, by path', () => {
    const sibling = "import { EN } from '../../i18n/src/en.ts'"
    expect(violationsFor(rule, file('packages/domain/src/a.ts', sibling))).toHaveLength(1)

    const app = "import { CHANNELS } from '../../../apps/desktop/src/main/channels.ts'"
    expect(violationsFor(rule, file('packages/domain/src/a.ts', app))).toHaveLength(1)
  })

  it('gives a package the table has never heard of no library to import', () => {
    const text = "import type { Undef } from '@alpha/domain'"
    expect(violationsFor(rule, file('packages/brand-new/src/a.ts', text))).toHaveLength(1)
  })

  it('says nothing about the app, which may depend on all of them', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', "import { text } from '@alpha/i18n'"))).toEqual([])
  })
})

describe('02-architecture:renderer-has-no-model-client', () => {
  const rule = '02-architecture:renderer-has-no-model-client'

  it('flags a renderer importing an agent package', () => {
    const text = 'import { Agent } from "@earendil-works/pi-agent-core"'
    expect(violationsFor(rule, file('apps/desktop/src/renderer/a.ts', text))).toHaveLength(1)
  })

  it('passes the same import in the main process', () => {
    const text = 'import { Agent } from "@earendil-works/pi-agent-core"'
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', text))).toEqual([])
  })
})

describe('02-architecture:no-agent-dependency', () => {
  const rule = '02-architecture:no-agent-dependency'
  const text = 'import { Agent } from "@earendil-works/pi-agent-core"'

  it('flags the agent library in the renderer', () => {
    expect(violationsFor(rule, file('apps/desktop/src/renderer/a.ts', text))).toHaveLength(1)
  })

  it('flags it in the libraries', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', text))).toHaveLength(1)
  })

  it('passes it in the runtime, where the agent lives', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/runtime/a.ts', text))).toEqual([])
  })

  it('passes it in a package that attaches to the agent, and only there', () => {
    // A capability's package carries its own adapter (C2.8): the tool face is pi's shape, so the
    // package that offers tools names pi. The set is closed — a library that is not on it may not.
    expect(violationsFor(rule, file('packages/internal-plugins/src/a.ts', text))).toEqual([])
    expect(violationsFor(rule, file('packages/state/src/a.ts', text))).toHaveLength(1)
  })

  it('passes a comment that only names the library', () => {
    expect(
      violationsFor(rule, file('apps/desktop/src/renderer/a.ts', '// pi-agent-core is main-process only')),
    ).toEqual([])
  })
})

describe('02-architecture:renderer-is-solid', () => {
  const rule = '02-architecture:renderer-is-solid'

  it('flags each framework the window left behind', () => {
    for (const text of [
      'import { useState } from "react"',
      'import { createRoot } from "react-dom/client"',
      'import { create } from "zustand"',
      'import { createRouter } from "@tanstack/react-router"',
      'import Markdown from "react-markdown"',
    ]) {
      expect(violationsFor(rule, file('apps/desktop/src/renderer/a.tsx', text))).toHaveLength(1)
    }
  })

  it('passes the same imports in the main process, where none of them belong either', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', 'import { useState } from "react"'))).toEqual([])
  })

  it('passes Solid, and a comment that names what was left behind', () => {
    expect(
      violationsFor(rule, file('apps/desktop/src/renderer/a.tsx', 'import { createSignal } from "solid-js"')),
    ).toEqual([])
    expect(violationsFor(rule, file('apps/desktop/src/renderer/a.ts', '// React used to draw this window'))).toEqual([])
  })
})

describe('02-architecture:max-file-lines', () => {
  const rule = '02-architecture:max-file-lines'

  it('flags a file over the limit', () => {
    const text = Array.from({ length: 301 }, (_, i) => `const v${i} = ${i}`).join('\n')
    expect(violationsFor(rule, file('packages/domain/src/big.ts', text))).toHaveLength(1)
  })

  it('passes a file at the limit', () => {
    const text = Array.from({ length: 300 }, (_, i) => `const v${i} = ${i}`).join('\n')
    expect(violationsFor(rule, file('packages/domain/src/big.ts', text))).toEqual([])
  })

  it('does not count blank lines or comments against the limit', () => {
    const body = Array.from({ length: 280 }, (_, i) => `const v${i} = ${i}`)
    const pad = Array.from({ length: 60 }, () => '')
    expect(violationsFor(rule, file('packages/domain/src/big.ts', [...body, ...pad].join('\n')))).toEqual([])
  })

  it('allows test files more room', () => {
    const text = Array.from({ length: 400 }, (_, i) => `const v${i} = ${i}`).join('\n')
    expect(violationsFor(rule, file('packages/domain/src/a.test.ts', text))).toEqual([])
  })
})

describe('02-architecture:max-function-lines', () => {
  const rule = '02-architecture:max-function-lines'

  const fn = (name, bodyLines) =>
    [`function ${name}() {`, ...Array.from({ length: bodyLines }, (_, i) => `  const a${i} = ${i}`), '}'].join('\n')

  it('flags a function body over 60 lines', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', fn('big', 61)))).toHaveLength(1)
  })

  it('passes a function body of exactly 60 lines', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', fn('ok', 60)))).toEqual([])
  })

  it('flags an oversized component in the renderer at a lower limit', () => {
    expect(violationsFor(rule, file('apps/desktop/src/renderer/Big.tsx', fn('Big', 121)))).toHaveLength(1)
  })

  it('reports the line the function starts on', () => {
    const text = ['// a comment', fn('big', 61)].join('\n')
    expect(violationsFor(rule, file('packages/domain/src/a.ts', text))[0].line).toBe(2)
  })

  it('measures a nested block as part of its function, not as a second function', () => {
    const text = ['function outer() {', '  if (true) {', '    return 1', '  }', '}'].join('\n')
    expect(violationsFor(rule, file('packages/domain/src/a.ts', text))).toEqual([])
  })
})

describe('02-architecture:capabilities-are-plugins', () => {
  const rule = '02-architecture:capabilities-are-plugins'

  it('passes the assembly, which is where capabilities are registered', () => {
    const text = 'const plugins: AlphaPlugin[] = [createCodingToolsPlugin({ workspacePath })]'
    expect(violationsFor(rule, file('apps/desktop/src/main/runtime/assemble-runtime.ts', text))).toEqual([])
  })

  it('passes the factory where it is written, and a factory in its own test', () => {
    const declaration = 'export function createCodingToolsPlugin(ports: CodingToolsPorts): AlphaPlugin {'
    expect(violationsFor(rule, file('apps/desktop/src/main/runtime/coding-tools.ts', declaration))).toEqual([])

    const inTest = 'const plugin = createRetryPlugin({ delays: [0] })'
    expect(violationsFor(rule, file('apps/desktop/src/main/runtime/conversation-runtime.test.ts', inTest))).toEqual([])
  })

  it('flags a capability wired where it is used', () => {
    const wired = 'this.#plugins.push(createCompactionPlugin({ store: this.#store }))'
    expect(violationsFor(rule, file('apps/desktop/src/main/runtime/conversation-runtime.ts', wired))).toHaveLength(1)
  })

  it('flags it in a class or a method, and not only at the top level', () => {
    const method = '  readonly #gate = createGatePlugin({ permissions })'
    expect(violationsFor(rule, file('apps/desktop/src/main/runtime/manager.ts', method))).toHaveLength(1)
  })

  it('flags a namespaced call, which is what registration from somewhere else looks like', () => {
    const namespaced = 'registry.createCompactionPlugin({ store })'
    expect(violationsFor(rule, file('apps/desktop/src/main/runtime/manager.ts', namespaced))).toHaveLength(1)
  })

  it('passes a factory named inside a string, which is not a call to it', () => {
    const prose = "const note = 'a capability is registered with createGatePlugin(...)'"
    expect(violationsFor(rule, file('apps/desktop/src/main/runtime/notes.ts', prose))).toEqual([])
  })

  it('lets a line opt out with a marker, like every other rule', () => {
    const marked = 'const plugin = createGatePlugin({ permissions }) // constraints-ignore 02-architecture'
    expect(violationsFor(rule, file('apps/desktop/src/main/runtime/manager.ts', marked))).toEqual([])
  })

  it('says nothing outside main, where a plugin cannot be reached at all', () => {
    const text = 'const plugin = createGatePlugin({ permissions })'
    expect(violationsFor(rule, file('apps/desktop/src/renderer/a.ts', text))).toEqual([])
    expect(violationsFor(rule, file('packages/gate/src/a.ts', text))).toEqual([])
  })
})

describe('02-architecture:renderer-has-no-credentials', () => {
  const rule = '02-architecture:renderer-has-no-credentials'
  const renderer = 'apps/desktop/src/renderer/stores/providers.ts'

  it('flags the window reading a credential field off a payload', () => {
    expect(violationsFor(rule, file(renderer, 'const key = provider.apiKey'))).toHaveLength(1)
    expect(violationsFor(rule, file(renderer, "const key = snapshot['apiKey']"))).toHaveLength(1)
    expect(violationsFor(rule, file(renderer, 'const one = payload.secret'))).toHaveLength(1)
    expect(violationsFor(rule, file(renderer, 'const set = stored.credentials'))).toHaveLength(1)
  })

  it('passes what C2.4 allows the window: that one exists, and the one being sent', () => {
    expect(violationsFor(rule, file(renderer, 'props.provider.hasCredential ? a : b'))).toEqual([])
    expect(violationsFor(rule, file(renderer, 'const [secret, setSecret] = createSignal("")'))).toEqual([])
    expect(violationsFor(rule, file(renderer, "fetch('/x', { credentials: 'same-origin' })"))).toEqual([])
    expect(violationsFor(rule, file(renderer, 'bridge.setCredential(id, secret)'))).toEqual([])
  })

  it('says nothing about the main process, where the key really is read', () => {
    const main = 'apps/desktop/src/main/runtime/model-runtime.ts'
    expect(violationsFor(rule, file(main, 'const key = vault.credential(providerId)'))).toEqual([])
  })

  it('lets a line opt out with a marker, like every other rule', () => {
    const marked = 'const key = provider.apiKey // constraints-ignore 02-architecture'
    expect(violationsFor(rule, file(renderer, marked))).toEqual([])
  })
})
