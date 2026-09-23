import { describe, expect, it } from 'vitest'
import { file, violationsFor } from '../testing.mjs'

/** The fixtures for the product-scope rules, each with the passing and the failing form. */

describe('03-product-scope:no-hardcoded-hosts', () => {
  const rule = '03-product-scope:no-hardcoded-hosts'

  it('flags a literal http URL in a random source file', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', 'const u = "https://example.com/v1"'))).toHaveLength(
      1,
    )
  })

  it('flags a provider host in the module that used to be allowed to hold one', () => {
    const text = 'const u = "https://api.anthropic.com"'
    expect(violationsFor(rule, file('packages/domain/src/providers.ts', text))).toHaveLength(1)
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
