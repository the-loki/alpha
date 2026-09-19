/**
 * Who may act. A browser on the network is a remote control for a shell, so the only thing between
 * it and the workbench is the token — minted once, shown in Settings, and traded for a cookie so
 * the browser never has to put it in a URL.
 *
 * The cookie carries the token itself rather than a derived session id: a second secret would need
 * its own lifetime, its own revocation, and its own reason to exist, and none of those buy anything
 * for a token whose only job is to be known by the person at the keyboard.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const COOKIE_NAME = 'alpha_session'

/** The parts of a request this needs, so a test does not have to build one. */
export interface AuthRequest {
  cookie?: string
  authorization?: string
}

export class SessionGate {
  #token: string

  constructor(token?: string) {
    this.#token = token ?? mintToken()
  }

  get token(): string {
    return this.#token
  }

  /** The cookie to set for a correct token, or undefined for anything else. */
  exchange(candidate: unknown): string | undefined {
    if (typeof candidate !== 'string' || !sameSecret(candidate, this.#token)) return undefined
    return `${COOKIE_NAME}=${this.#token}; HttpOnly; SameSite=Strict; Path=/`
  }

  allows(request: AuthRequest): boolean {
    const bearer = request.authorization?.startsWith('Bearer ') === true ? request.authorization.slice(7) : ''
    if (sameSecret(bearer, this.#token)) return true
    return sameSecret(cookieFrom(request.cookie ?? ''), this.#token)
  }
}

function cookieFrom(header: string): string {
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE_NAME) return rest.join('=')
  }
  return ''
}

/**
 * Compared in constant time, and over digests so the comparison is between equal lengths whatever
 * was offered: `timingSafeEqual` throws on a length mismatch, which is the timing signal this is
 * here to avoid.
 */
function sameSecret(candidate: string, expected: string): boolean {
  if (candidate === '') return false
  const left = createDigest(candidate)
  const right = createDigest(expected)
  return timingSafeEqual(left, right)
}

function createDigest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

export function mintToken(): string {
  return randomBytes(32).toString('base64url')
}
