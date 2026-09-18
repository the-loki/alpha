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
    const inClass = violationsFor(rule, file('packages/renderer/src/a.tsx', '<p className="text-[13px] gap-2">x</p>'))
    expect(inClass).toHaveLength(1)
    expect(inClass[0].message).toContain('13px')

    const inCss = violationsFor(rule, file('packages/renderer/src/styles/a.css', '  padding: 6px;'))
    expect(inCss).toHaveLength(1)
  })

  it('allows hairlines, rem, and prose about px', () => {
    const hairline = violationsFor(rule, file('packages/renderer/src/a.css', '  border: 1px solid var(--color-line);'))
    expect(hairline).toEqual([])

    const rem = violationsFor(rule, file('packages/renderer/src/a.tsx', '<p className="text-ui rounded-card">x</p>'))
    expect(rem).toEqual([])

    const comment = violationsFor(rule, file('packages/renderer/src/a.css', '   * rem, not px, so scaling works'))
    expect(comment).toEqual([])
  })

  it('tracks comments rather than guessing from the first character', () => {
    // A universal selector is not a comment, and a length in one is a length.
    const selector = violationsFor(rule, file('packages/renderer/src/styles/a.css', '* { gap: 6px }'))
    expect(selector).toHaveLength(1)

    // A JSDoc block is a comment, even where a line starts with a star.
    const jsdoc = file(
      'packages/renderer/src/a.ts',
      ['/**', ' * The caret is 2px wide.', ' */', 'const x = 1'].join('\n'),
    )
    expect(violationsFor(rule, jsdoc)).toEqual([])

    const lineComment = violationsFor(rule, file('packages/renderer/src/a.ts', '// 6px of air'))
    expect(lineComment).toEqual([])
  })

  it('reads the html the renderer ships too', () => {
    const found = violationsFor(rule, file('packages/renderer/index.html', '<meta name="x" content="12px" />'))
    expect(found).toHaveLength(1)
  })

  it('says nothing about files outside the renderer', () => {
    expect(violationsFor(rule, file('packages/main/src/a.ts', 'const pad = "6px"'))).toEqual([])
  })
})

describe('01-typescript:no-null-union', () => {
  const rule = '01-typescript:no-null-union'

  it('flags a property typed with a null union', () => {
    const found = violationsFor(rule, file('packages/core/src/a.ts', 'const x: string | null = 1'))
    expect(found).toHaveLength(1)
    expect(found[0].line).toBe(1)
  })

  it('flags a null union in a return type', () => {
    const found = violationsFor(rule, file('packages/core/src/a.ts', 'function f(): Thing | null {}'))
    expect(found).toHaveLength(1)
  })

  it('flags the double union', () => {
    const found = violationsFor(rule, file('packages/core/src/a.ts', 'let a: Foo | null | undefined'))
    expect(found).toHaveLength(1)
  })

  it('passes an undefined union, which is how absence is expressed', () => {
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

  it('does not police the config files at the repo root', () => {
    expect(violationsFor(rule, file('electron.vite.config.ts', 'export default {}'))).toEqual([])
  })
})

describe('01-typescript:any-usage', () => {
  const rule = '01-typescript:any-usage'

  it('flags an any annotation', () => {
    expect(violationsFor(rule, file('packages/core/src/a.ts', 'function f(x: any) {}'))).toHaveLength(1)
  })

  it('flags an any cast', () => {
    expect(violationsFor(rule, file('packages/main/src/a.ts', 'const a = payload as any'))).toHaveLength(1)
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
    expect(violationsFor(rule, file('packages/main/src/a.ts', 'import { app } from "electron"'))).toEqual([])
  })
})

describe('02-architecture:renderer-has-no-model-client', () => {
  const rule = '02-architecture:renderer-has-no-model-client'

  it('flags a renderer importing an agent package', () => {
    const text = 'import { Agent } from "@earendil-works/pi-agent-core"'
    expect(violationsFor(rule, file('packages/renderer/src/a.ts', text))).toHaveLength(1)
  })

  it('passes the same import in the main process', () => {
    const text = 'import { Agent } from "@earendil-works/pi-agent-core"'
    expect(violationsFor(rule, file('packages/main/src/a.ts', text))).toEqual([])
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
    expect(violationsFor(rule, file('packages/renderer/src/Big.tsx', fn('Big', 121)))).toHaveLength(1)
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
    expect(violationsFor(rule, file('packages/main/src/a.ts', 'const u = "https://example.com/v1"'))).toHaveLength(1)
  })

  it('passes a URL in the provider templates module', () => {
    const text = 'const u = "https://api.anthropic.com"'
    expect(violationsFor(rule, file('packages/core/src/providers/templates.ts', text))).toEqual([])
  })

  it('passes docs and test fixtures', () => {
    expect(violationsFor(rule, file('docs/research/x.md', 'see https://example.com'))).toEqual([])
    expect(violationsFor(rule, file('packages/main/src/a.test.ts', 'const u = "https://x.test"'))).toEqual([])
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
  const mainHandling = (body) => file('packages/main/src/ipc.ts', body)
  const preloadUsing = (body) => file('packages/preload/src/index.ts', body)
  const handlesPing = mainHandling('ipcMain.handle(IPC.ping, () => {})\nwebContents.send(IPC.pong, 1)')

  it('flags a channel the window asks for that nothing answers', () => {
    const found = crossViolations([
      contract,
      mainHandling('ipcMain.handle(IPC.ping, () => {})'),
      preloadUsing('ipcRenderer.invoke(IPC.pong)'),
    ])
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('alpha:pong')
  })

  it('flags an event the window waits for that nothing sends', () => {
    const found = crossViolations([contract, handlesPing, preloadUsing('ipcRenderer.on(IPC.ping, handler)')])
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('alpha:ping')
  })

  it('passes the bridge and the handlers that agree', () => {
    const found = crossViolations([
      contract,
      handlesPing,
      preloadUsing('ipcRenderer.invoke(IPC.ping)\nipcRenderer.on(IPC.pong, h)'),
    ])
    expect(found).toEqual([])
  })

  it('flags a channel string written out instead of taken from the contract', () => {
    const inMain = violationsFor(rule, file('packages/main/src/ipc.ts', "ipcMain.handle('alpha:ping', () => {})"))
    expect(inMain).toHaveLength(1)

    const inPreload = violationsFor(rule, file('packages/preload/src/index.ts', "ipcRenderer.invoke('alpha:ping')"))
    expect(inPreload).toHaveLength(1)
  })

  it('flags the renderer reaching for the transport itself', () => {
    const found = violationsFor(rule, file('packages/renderer/src/a.ts', "import { ipcRenderer } from 'electron'"))
    expect(found).toHaveLength(1)
  })

  it('lets a line opt out with a marker, like every other rule', () => {
    const marked = preloadUsing('ipcRenderer.invoke(IPC.pong) // constraints-ignore 02-architecture')
    expect(crossViolations([contract, mainHandling('ipcMain.handle(IPC.ping, () => {})'), marked])).toEqual([])
  })

  it('says nothing about files that do not touch the seam', () => {
    expect(violationsFor(rule, file('packages/renderer/src/a.tsx', 'const x = 1'))).toEqual([])
  })
})

describe('checkFile', () => {
  it('runs every rule that applies to the path', () => {
    const found = checkFile(file('packages/core/src/a.ts', 'const x: string | null = 1'))
    expect(found.map((v) => v.rule)).toContain('01-typescript:no-null-union')
  })

  it('skips generated files', () => {
    expect(checkFile(file('packages/renderer/src/routeTree.gen.ts', 'type T = string | null'))).toEqual([])
  })

  it('skips files outside the source tree', () => {
    expect(checkFile(file('README.md', 'type T = string | null'))).toEqual([])
  })

  it('carries the constraint file for each violation', () => {
    const [first] = checkFile(file('packages/core/src/a.ts', 'const x: string | null = 1'))
    expect(first.constraint).toBe('01-typescript.md')
  })
})
