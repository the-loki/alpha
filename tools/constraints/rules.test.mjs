import { describe, expect, it } from 'vitest'
import { checkFile, RULES, ruleById } from './rules.mjs'

/**
 * The fixture shape every rule consumes: a repo-relative path and the file's text.
 * Rules are pure over this, so each case below is a string in and a verdict out.
 */
const file = (path, text) => ({ path, text })

const violationsFor = (ruleId, f) => ruleById(ruleId).check(f)

describe('the rule set', () => {
  it('gives every rule a unique id', () => {
    const ids = RULES.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('names each rule with the constraint file it enforces', () => {
    for (const rule of RULES) {
      expect(rule.id).toMatch(/^0\d-[a-z-]+:/)
      expect(rule.constraint).toMatch(/^0\d-[a-z-]+\.md$/)
    }
  })
})

describe('05-design:no-px-lengths', () => {
  const rule = '05-design:no-px-lengths'

  it('flags a px length in a class, and in a stylesheet', () => {
    const inClass = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.tsx', '<p className="text-[13px] gap-2">x</p>'),
    )
    expect(inClass).toHaveLength(1)
    expect(inClass[0].message).toContain('13px')

    const inCss = violationsFor(rule, file('apps/desktop/src/renderer/styles/a.css', '  padding: 6px;'))
    expect(inCss).toHaveLength(1)
  })

  it('allows hairlines, rem, and prose about px', () => {
    const hairline = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.css', '  border: 1px solid var(--color-line);'),
    )
    expect(hairline).toEqual([])

    const rem = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.tsx', '<p className="text-ui rounded-card">x</p>'),
    )
    expect(rem).toEqual([])

    const comment = violationsFor(rule, file('apps/desktop/src/renderer/a.css', '   * rem, not px, so scaling works'))
    expect(comment).toEqual([])
  })

  it('tracks comments rather than guessing from the first character', () => {
    // A universal selector is not a comment, and a length in one is a length.
    const selector = violationsFor(rule, file('apps/desktop/src/renderer/styles/a.css', '* { gap: 6px }'))
    expect(selector).toHaveLength(1)

    // A JSDoc block is a comment, even where a line starts with a star.
    const jsdoc = file(
      'apps/desktop/src/renderer/a.ts',
      ['/**', ' * The caret is 2px wide.', ' */', 'const x = 1'].join('\n'),
    )
    expect(violationsFor(rule, jsdoc)).toEqual([])

    const lineComment = violationsFor(rule, file('apps/desktop/src/renderer/a.ts', '// 6px of air'))
    expect(lineComment).toEqual([])
  })

  it('reads the html the renderer ships too', () => {
    const found = violationsFor(rule, file('apps/desktop/src/renderer/index.html', '<meta name="x" content="12px" />'))
    expect(found).toHaveLength(1)
  })

  it('says nothing about files outside the renderer', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', 'const pad = "6px"'))).toEqual([])
  })
})

describe('05-design:control-voice', () => {
  const rule = '05-design:control-voice'

  it('flags a button that sets itself in mono, however the className is wrapped', () => {
    const oneLine = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.tsx', '<button className="font-mono text-micro">copy</button>'),
    )
    expect(oneLine).toHaveLength(1)

    const wrapped = violationsFor(
      rule,
      file(
        'apps/desktop/src/renderer/a.tsx',
        ['<button', '  type="button"', '  className="font-mono text-micro"', '>'].join('\n'),
      ),
    )
    expect(wrapped).toHaveLength(1)
    expect(wrapped[0].line).toBe(1)
  })

  it('allows a button whose data is mono, and mono that is not a button', () => {
    const data = violationsFor(
      rule,
      file(
        'apps/desktop/src/renderer/a.tsx',
        '<button className="text-xs text-parchment"><span className="font-mono">Ctrl+N</span></button>',
      ),
    )
    expect(data).toEqual([])

    const notAButton = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.tsx', '<span className="font-mono text-micro">/dev/alpha</span>'),
    )
    expect(notAButton).toEqual([])
  })

  it('says nothing about the main process', () => {
    expect(
      violationsFor(rule, file('apps/desktop/src/main/a.tsx', '<button className="font-mono">x</button>')),
    ).toEqual([])
  })
})

describe('05-design:no-other-weights', () => {
  const rule = '05-design:no-other-weights'

  it('flags every weight this interface does not have', () => {
    for (const weight of ['font-bold', 'font-extrabold', 'font-black', 'font-light', 'font-thin']) {
      const found = violationsFor(rule, file('apps/desktop/src/renderer/a.tsx', `<h1 className="${weight}">x</h1>`))
      expect(found, weight).toHaveLength(1)
    }
  })

  it('allows the two weights there are, and the same words in the main process', () => {
    const allowed = violationsFor(
      rule,
      file(
        'apps/desktop/src/renderer/a.tsx',
        '<h1 className="font-semibold"><span className="font-medium">x</span></h1>',
      ),
    )
    expect(allowed).toEqual([])

    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', "const a = 'font-bold'"))).toEqual([])
  })
})

describe('05-design:copy-has-a-key', () => {
  const rule = '05-design:copy-has-a-key'

  it('flags copy in an attribute, in a text node, and in a wrapped paragraph', () => {
    const attribute = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.tsx', '<input aria-label="Access token" />'),
    )
    expect(attribute).toHaveLength(1)

    const text = violationsFor(rule, file('apps/desktop/src/renderer/a.tsx', '<p>Allow once</p>'))
    expect(text).toHaveLength(1)

    const paragraph = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.tsx', '<p>\n  Alpha ships no keys. A provider you add is the only one.\n</p>'),
    )
    expect(paragraph).toHaveLength(1)
  })

  it('allows a key, a single word, and prose in a comment', () => {
    const key = violationsFor(rule, file('apps/desktop/src/renderer/a.tsx', "<p>{t('sidebar.search')}</p>"))
    expect(key).toEqual([])

    const oneWord = violationsFor(rule, file('apps/desktop/src/renderer/a.tsx', '<span>Alpha</span>'))
    expect(oneWord).toEqual([])

    const insideAComment = violationsFor(
      rule,
      file(
        'apps/desktop/src/renderer/a.tsx',
        ["{/* The age is the row's metadata, and the row is the", "    conversation's name and nothing else. */}"].join(
          '\n',
        ),
      ),
    )
    expect(insideAComment).toEqual([])
  })

  it('reads the renderer only', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.tsx', '<p aria-label="Access token" />'))).toEqual([])
  })
})

describe('01-typescript:no-null-union', () => {
  const rule = '01-typescript:no-null-union'

  it('flags a property typed with a null union', () => {
    const found = violationsFor(rule, file('packages/core/src/a.ts', 'const x: string | null = 1'))
    expect(found).toHaveLength(1)
    expect(found[0].line).toBe(1)
  })

  it('flags a null union in a return type, and names the alias that replaces it', () => {
    const found = violationsFor(rule, file('packages/core/src/a.ts', 'function f(): Thing | null {}'))
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('Null<T>')
  })

  it('flags the double union', () => {
    const found = violationsFor(rule, file('packages/core/src/a.ts', 'let a: Foo | null | undefined'))
    expect(found).toHaveLength(1)
  })

  it('leaves an undefined union to the absence rule, which is the one that owns its spelling', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'function f(): Thing | undefined {}'))).toEqual([])
  })

  it('passes an optional property', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'interface A { foo?: string }'))).toEqual([])
  })

  it('passes a union of real types', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'type T = "a" | "b"'))).toEqual([])
  })

  it('passes a null union in a declaration file, where the vendor owns the type', () => {
    expect(violationsFor(rule, file('packages/core/src/vendor.d.ts', 'type T = string | null'))).toEqual([])
  })

  it('passes a line carrying the escape hatch', () => {
    const text = 'const x: Foo | null = y // constraints-ignore 01-typescript: vendor signature'
    expect(violationsFor(rule, file('packages/core/src/a.ts', text))).toEqual([])
  })

  it('still flags the neighbouring line when one line is exempted', () => {
    const text = [
      'const x: Foo | null = y // constraints-ignore 01-typescript: vendor',
      'const z: Bar | null = w',
    ].join('\n')
    const found = violationsFor(rule, file('packages/core/src/a.ts', text))
    expect(found).toHaveLength(1)
    expect(found[0].line).toBe(2)
  })
})

describe('01-typescript:absence-is-named', () => {
  const rule = '01-typescript:absence-is-named'

  it('flags a union spelled out in a return type', () => {
    const found = violationsFor(rule, file('packages/core/src/a.ts', 'function f(): Thing | undefined {}'))
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('Undef<T>')
  })

  it('flags a union inside a generic argument', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', 'let p: Promise<Thing | undefined>'))).toHaveLength(1)
  })

  it('flags a parameter the caller has to pass either way', () => {
    expect(
      violationsFor(rule, file('packages/core/src/a.ts', 'function f(a: string | undefined, b: string) {}')),
    ).toHaveLength(1)
  })

  it('passes the named form, which is what the rule is for', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'function f(): Undef<Thing> {}'))).toEqual([])
  })

  it('passes an optional property and an omittable parameter, which keep their question mark', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'interface A { foo?: string }'))).toEqual([])
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'function f(a?: string) {}'))).toEqual([])
  })

  it('passes a fixture that has to show the banned form', () => {
    expect(violationsFor(rule, file('packages/core/src/a.test.ts', 'const x: string | undefined = y'))).toEqual([])
  })

  it('flags the double union too, which the null rule also answers for', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'let a: Foo | null | undefined'))).toHaveLength(1)
  })

  it('passes a line carrying the escape hatch', () => {
    const text = 'const x: Foo | undefined = y // constraints-ignore 01-typescript: vendor signature'
    expect(violationsFor(rule, file('packages/core/src/a.ts', text))).toEqual([])
  })
})

describe('01-typescript:no-default-export', () => {
  const rule = '01-typescript:no-default-export'

  it('flags a default-exported function', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'export default function f() {}'))).toHaveLength(1)
  })

  it('flags a default-exported expression', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'export default {}'))).toHaveLength(1)
  })

  it('passes a named export', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'export function f() {}'))).toEqual([])
  })

  it('does not police the build configs the tooling reads', () => {
    expect(violationsFor(rule, file('apps/desktop/electron.vite.config.ts', 'export default {}'))).toEqual([])
  })
})

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

  it('allows the library and the files of the process it is written in', () => {
    const cases = [
      ['apps/desktop/src/renderer/a.ts', "import { text } from '@alpha/core'"],
      ['apps/desktop/src/renderer/a.ts', "import { shell } from './stores/shell.ts'"],
      ['apps/desktop/src/main/a.ts', "import { gate } from './runtime/gate.ts'"],
      ['packages/core/src/a.ts', 'export const a = 1'],
    ]
    for (const [path, text] of cases) expect(violationsFor(rule, file(path, text))).toEqual([])
  })
})

describe('01-typescript:any-usage', () => {
  const rule = '01-typescript:any-usage'

  it('flags an any annotation', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'function f(x: any) {}'))).toHaveLength(1)
  })

  it('flags an any cast', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', 'const a = payload as any'))).toHaveLength(1)
  })

  it('passes the word any inside a string', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'const s = "any time"'))).toEqual([])
  })

  it('passes Unknown', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'function f(x: unknown) {}'))).toEqual([])
  })
})

describe('01-typescript:ts-expect-error-reason', () => {
  const rule = '01-typescript:ts-expect-error-reason'

  it('flags a bare ts-expect-error', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', '// @ts-expect-error'))).toHaveLength(1)
  })

  it('flags ts-ignore outright', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', '// @ts-ignore'))).toHaveLength(1)
  })

  it('passes ts-expect-error with a reason', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', '// @ts-expect-error vendor type is wrong'))).toEqual([])
  })
})

describe('02-architecture:core-stays-pure', () => {
  const rule = '02-architecture:core-stays-pure'

  it('flags an electron import in core', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'import { app } from "electron"'))).toHaveLength(1)
  })

  it('flags a node builtin import in core', () => {
    expect(
      violationsFor(rule, file('packages/core/src/a.ts', 'import { readFile } from "node:fs/promises"')),
    ).toHaveLength(1)
  })

  it('flags a bare fs import in core', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'import fs from "fs"'))).toHaveLength(1)
  })

  it('passes core importing another core module', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'import { x } from "./b.ts"'))).toEqual([])
  })

  it('does not object to electron imports outside core', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', 'import { app } from "electron"'))).toEqual([])
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
    expect(violationsFor(rule, file('packages/core/src/big.ts', text))).toHaveLength(1)
  })

  it('passes a file at the limit', () => {
    const text = Array.from({ length: 300 }, (_, i) => `const v${i} = ${i}`).join('\n')
    expect(violationsFor(rule, file('packages/core/src/big.ts', text))).toEqual([])
  })

  it('does not count blank lines or comments against the limit', () => {
    const body = Array.from({ length: 280 }, (_, i) => `const v${i} = ${i}`)
    const pad = Array.from({ length: 60 }, () => '')
    expect(violationsFor(rule, file('packages/core/src/big.ts', [...body, ...pad].join('\n')))).toEqual([])
  })

  it('allows test files more room', () => {
    const text = Array.from({ length: 400 }, (_, i) => `const v${i} = ${i}`).join('\n')
    expect(violationsFor(rule, file('packages/core/src/a.test.ts', text))).toEqual([])
  })
})

describe('02-architecture:max-function-lines', () => {
  const rule = '02-architecture:max-function-lines'

  const fn = (name, bodyLines) =>
    [`function ${name}() {`, ...Array.from({ length: bodyLines }, (_, i) => `  const a${i} = ${i}`), '}'].join('\n')

  it('flags a function body over 60 lines', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', fn('big', 61)))).toHaveLength(1)
  })

  it('passes a function body of exactly 60 lines', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', fn('ok', 60)))).toEqual([])
  })

  it('flags an oversized component in the renderer at a lower limit', () => {
    expect(violationsFor(rule, file('apps/desktop/src/renderer/Big.tsx', fn('Big', 121)))).toHaveLength(1)
  })

  it('reports the line the function starts on', () => {
    const text = ['// a comment', fn('big', 61)].join('\n')
    expect(violationsFor(rule, file('packages/core/src/a.ts', text))[0].line).toBe(2)
  })

  it('measures a nested block as part of its function, not as a second function', () => {
    const text = ['function outer() {', '  if (true) {', '    return 1', '  }', '}'].join('\n')
    expect(violationsFor(rule, file('packages/core/src/a.ts', text))).toEqual([])
  })
})

describe('03-product-scope:no-hardcoded-hosts', () => {
  const rule = '03-product-scope:no-hardcoded-hosts'

  it('flags a literal http URL in a random source file', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', 'const u = "https://example.com/v1"'))).toHaveLength(
      1,
    )
  })

  it('flags a provider host in the module that used to be allowed to hold one', () => {
    const text = 'const u = "https://api.anthropic.com"'
    expect(violationsFor(rule, file('packages/core/src/providers.ts', text))).toHaveLength(1)
  })

  it('passes the module that owns the workbench its own address', () => {
    const listen = file('apps/desktop/src/main/server/http.ts', 'const urls = ["http://127.0.0.1:" + port]')
    expect(violationsFor(rule, listen)).toEqual([])
  })

  it('flags a host in another module of the server, which does not own the address', () => {
    const nearby = file('apps/desktop/src/main/server/service.ts', 'const urls = ["http://127.0.0.1:4123"]')
    expect(violationsFor(rule, nearby)).toHaveLength(1)
  })

  it('passes docs and test fixtures', () => {
    expect(violationsFor(rule, file('docs/research/x.md', 'see https://example.com'))).toEqual([])
    expect(violationsFor(rule, file('apps/desktop/src/main/a.test.ts', 'const u = "https://x.test"'))).toEqual([])
  })
})

/**
 * The one rule that reads more than one file: the contract, the handlers, and the bridge have to
 * agree, and a mistake in that agreement is the most expensive one this repo can make.
 */
describe('02-architecture:contract-channels', () => {
  const rule = '02-architecture:contract-channels'
  const crossViolations = (files) => ruleById(rule).checkAll(files)

  const contract = file(
    'packages/core/src/contract.ts',
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

describe('checkFile', () => {
  it('runs every rule that applies to the path', () => {
    const found = checkFile(file('packages/core/src/a.ts', 'const x: string | null = 1'))
    expect(found.map((v) => v.rule)).toContain('01-typescript:no-null-union')
  })

  it('skips generated files', () => {
    expect(checkFile(file('apps/desktop/src/renderer/routeTree.gen.ts', 'type T = string | null'))).toEqual([])
  })

  it('skips files outside the source tree', () => {
    expect(checkFile(file('README.md', 'type T = string | null'))).toEqual([])
  })

  it('carries the constraint file for each violation', () => {
    const [first] = checkFile(file('packages/core/src/a.ts', 'const x: string | null = 1'))
    expect(first.constraint).toBe('01-typescript.md')
  })
})
