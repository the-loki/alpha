import { describe, expect, it } from 'vitest'
import { file, violationsFor } from '../testing.mjs'

/** The fixtures for the TypeScript rules, each with the passing and the failing form. */

describe('01-typescript:no-null-union', () => {
  const rule = '01-typescript:no-null-union'

  it('flags a property typed with a null union', () => {
    const found = violationsFor(rule, file('packages/domain/src/a.ts', 'const x: string | null = 1'))
    expect(found).toHaveLength(1)
    expect(found[0].line).toBe(1)
  })

  it('flags a null union in a return type, and names the alias that replaces it', () => {
    const found = violationsFor(rule, file('packages/domain/src/a.ts', 'function f(): Thing | null {}'))
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('Null<T>')
  })

  it('flags the double union', () => {
    const found = violationsFor(rule, file('packages/domain/src/a.ts', 'let a: Foo | null | undefined'))
    expect(found).toHaveLength(1)
  })

  it('leaves an undefined union to the absence rule, which is the one that owns its spelling', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'function f(): Thing | undefined {}'))).toEqual([])
  })

  it('passes an optional property', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'interface A { foo?: string }'))).toEqual([])
  })

  it('passes a union of real types', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'type T = "a" | "b"'))).toEqual([])
  })

  it('passes a null union in a declaration file, where the vendor owns the type', () => {
    expect(violationsFor(rule, file('packages/domain/src/vendor.d.ts', 'type T = string | null'))).toEqual([])
  })

  it('passes a line carrying the escape hatch', () => {
    const text = 'const x: Foo | null = y // constraints-ignore 01-typescript: vendor signature'
    expect(violationsFor(rule, file('packages/domain/src/a.ts', text))).toEqual([])
  })

  it('still flags the neighbouring line when one line is exempted', () => {
    const text = [
      'const x: Foo | null = y // constraints-ignore 01-typescript: vendor',
      'const z: Bar | null = w',
    ].join('\n')
    const found = violationsFor(rule, file('packages/domain/src/a.ts', text))
    expect(found).toHaveLength(1)
    expect(found[0].line).toBe(2)
  })
})

describe('01-typescript:absence-is-named', () => {
  const rule = '01-typescript:absence-is-named'

  it('flags a union spelled out in a return type', () => {
    const found = violationsFor(rule, file('packages/domain/src/a.ts', 'function f(): Thing | undefined {}'))
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('Undef<T>')
  })

  it('flags a union inside a generic argument', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', 'let p: Promise<Thing | undefined>'))).toHaveLength(1)
  })

  it('flags a parameter the caller has to pass either way', () => {
    expect(
      violationsFor(rule, file('packages/domain/src/a.ts', 'function f(a: string | undefined, b: string) {}')),
    ).toHaveLength(1)
  })

  it('passes the named form, which is what the rule is for', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'function f(): Undef<Thing> {}'))).toEqual([])
  })

  it('passes an optional property and an omittable parameter, which keep their question mark', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'interface A { foo?: string }'))).toEqual([])
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'function f(a?: string) {}'))).toEqual([])
  })

  it('passes a fixture that has to show the banned form', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.test.ts', 'const x: string | undefined = y'))).toEqual([])
  })

  it('flags the double union too, which the null rule also answers for', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'let a: Foo | null | undefined'))).toHaveLength(1)
  })

  it('passes a line carrying the escape hatch', () => {
    const text = 'const x: Foo | undefined = y // constraints-ignore 01-typescript: vendor signature'
    expect(violationsFor(rule, file('packages/domain/src/a.ts', text))).toEqual([])
  })
})

describe('01-typescript:no-default-export', () => {
  const rule = '01-typescript:no-default-export'

  it('flags a default-exported function', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'export default function f() {}'))).toHaveLength(1)
  })

  it('flags a default-exported expression', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'export default {}'))).toHaveLength(1)
  })

  it('passes a named export', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'export function f() {}'))).toEqual([])
  })

  it('does not police the build configs the tooling reads', () => {
    expect(violationsFor(rule, file('apps/desktop/electron.vite.config.ts', 'export default {}'))).toEqual([])
  })
})

describe('01-typescript:any-usage', () => {
  const rule = '01-typescript:any-usage'

  it('flags an any annotation', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'function f(x: any) {}'))).toHaveLength(1)
  })

  it('flags an any cast', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', 'const a = payload as any'))).toHaveLength(1)
  })

  it('passes the word any inside a string', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'const s = "any time"'))).toEqual([])
  })

  it('passes Unknown', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', 'function f(x: unknown) {}'))).toEqual([])
  })
})

describe('01-typescript:ts-expect-error-reason', () => {
  const rule = '01-typescript:ts-expect-error-reason'

  it('flags a bare ts-expect-error', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', '// @ts-expect-error'))).toHaveLength(1)
  })

  it('flags ts-ignore outright', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', '// @ts-ignore'))).toHaveLength(1)
  })

  it('passes ts-expect-error with a reason', () => {
    expect(violationsFor(rule, file('packages/domain/src/a.ts', '// @ts-expect-error vendor type is wrong'))).toEqual(
      [],
    )
  })
})

describe('01-typescript:hash-is-for-secrets', () => {
  const rule = '01-typescript:hash-is-for-secrets'

  it('flags a hash field in an ordinary class, and says what to write instead', () => {
    const found = violationsFor(rule, file('packages/state/src/a.ts', '  readonly #path: string'))
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('private')
  })

  it('flags a hash method', () => {
    expect(violationsFor(rule, file('packages/state/src/a.ts', '  #read(): PersistedState {}'))).toHaveLength(1)
  })

  it('flags an async hash method, which is a member like any other', () => {
    expect(
      violationsFor(rule, file('packages/tasks/src/a.ts', '  async #run(task: ScheduledTask): Promise<void> {}')),
    ).toHaveLength(1)
  })

  it('passes the credential vault, whose object must not be handed out at all', () => {
    const text = '  readonly #path: string\n  #entries: VaultEntry[]'
    expect(violationsFor(rule, file('packages/providers/src/credential-vault.ts', text))).toEqual([])
  })

  it('passes the session gate, which holds the token itself', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/server/session.ts', '  #token: string'))).toEqual([])
  })

  it('passes the modifiers, which are the spelling this rule wants', () => {
    expect(violationsFor(rule, file('packages/state/src/a.ts', '  private readonly path: string'))).toEqual([])
    expect(violationsFor(rule, file('packages/state/src/a.ts', '  private load(): PersistedState {}'))).toEqual([])
  })

  it('passes a hash inside a string, which is not a member', () => {
    expect(violationsFor(rule, file('packages/state/src/a.ts', "const colour = '#fff'"))).toEqual([])
  })

  it('passes a fixture that has to show the banned form', () => {
    expect(violationsFor(rule, file('packages/state/src/a.test.ts', '  readonly #path: string'))).toEqual([])
  })

  it('passes a line carrying the escape hatch', () => {
    const text = '  #count = 0 // constraints-ignore 01-typescript: the debugger reads it by name'
    expect(violationsFor(rule, file('packages/state/src/a.ts', text))).toEqual([])
  })
})
