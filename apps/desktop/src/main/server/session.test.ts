import { describe, expect, it } from 'vitest'
import { COOKIE_NAME, SessionGate } from './session.ts'

const gateWith = () => new SessionGate('a-token-that-is-long-enough-to-be-one')

describe('[main] the session gate', () => {
  it('mints a token long enough to be one when it is not given one', () => {
    const minted = new SessionGate()
    expect(minted.token.length).toBeGreaterThanOrEqual(32)
    expect(new SessionGate().token).not.toBe(minted.token)
  })

  it('trades the token for a cookie, and refuses anything else', () => {
    const gate = gateWith()
    const cookie = gate.exchange('a-token-that-is-long-enough-to-be-one')
    expect(cookie).toContain(`${COOKIE_NAME}=`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/')

    expect(gate.exchange('nearly the right token')).toBeUndefined()
    expect(gate.exchange('')).toBeUndefined()
    expect(gate.exchange(undefined)).toBeUndefined()
    expect(gate.exchange({ token: 'x' })).toBeUndefined()
  })

  it('accepts the cookie it issued, and the token as a bearer header', () => {
    const gate = gateWith()
    const cookie = gate.exchange(gate.token) ?? ''
    const issued = cookie.slice(`${COOKIE_NAME}=`.length, cookie.indexOf(';'))

    expect(gate.allows({ cookie: `${COOKIE_NAME}=${issued}` })).toBe(true)
    expect(gate.allows({ authorization: `Bearer ${gate.token}` })).toBe(true)
    expect(gate.allows({ cookie: issued })).toBe(false)
    expect(gate.allows({ authorization: `Bearer ${gate.token}x` })).toBe(false)
    expect(gate.allows({})).toBe(false)
  })

  it('accepts its own token and refuses another, which is what replacing one comes to', () => {
    const gate = gateWith()
    const other = new SessionGate()

    expect(other.token).not.toBe(gate.token)
    expect(gate.allows({ authorization: `Bearer ${gate.token}` })).toBe(true)
    expect(other.allows({ authorization: `Bearer ${gate.token}` })).toBe(false)
  })
})
