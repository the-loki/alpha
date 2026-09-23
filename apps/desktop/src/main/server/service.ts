/**
 * Browser access, as a thing the workbench can be asked about: whether it is listening, where, and
 * why not when it is meant to be. The server itself is `http.ts`; this owns the decision to run it
 * and the state the settings page reads.
 */
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import type { NetworkPatch, NetworkState } from '@alpha/contract'
import type { NetworkAccess, Undef } from '@alpha/domain'
import type { Broadcast } from '../broadcast.ts'
import type { ChannelPorts } from '../channels.ts'
import type { StateStore } from '../state-store.ts'
import { BIND_ADDRESS, type RunningServer, startServer } from './http.ts'
import { mintToken } from './session.ts'

export interface NetworkServiceOptions {
  store: StateStore
  broadcast: Broadcast
  /** The renderer's build output; what a browser is served. */
  bundleDirectory: string
  /**
   * Read when the server starts rather than held at construction: the service is itself part of
   * the ports a request dispatches through, so the two cannot be built one after the other.
   */
  ports: () => ChannelPorts
}

/** Every address on this machine that someone else's browser could reach. */
export function networkUrls(port: number, interfaces: ReturnType<typeof networkInterfaces>): string[] {
  const urls = [`http://${BIND_ADDRESS.local}:${port}`]
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) urls.push(`http://${address.address}:${port}`)
    }
  }
  return urls
}

export class NetworkService {
  readonly #options: NetworkServiceOptions
  #server: Undef<RunningServer>
  #error = ''

  constructor(options: NetworkServiceOptions) {
    this.#options = options
  }

  /** What the settings page shows: what is stored, and what the server made of it. */
  state(): NetworkState {
    const access = this.#options.store.read().network
    // Bound to this machine, only this machine's address is a way in — listing the LAN addresses
    // anyway would invite someone to try one and wonder why it does not answer.
    const reachable = access.bind === 'network' ? networkInterfaces() : {}
    return {
      ...access,
      urls: this.#server === undefined ? [] : networkUrls(this.#server.port, reachable),
      error: this.#error,
    }
  }

  /** Starts, stops or restarts the server so that it matches what the user asked for. */
  async apply(): Promise<NetworkState> {
    await this.#stop()
    this.#error = ''
    const access = this.#options.store.read().network
    if (!access.enabled) return this.state()
    if (!existsSync(join(this.#options.bundleDirectory, 'index.html'))) {
      this.#error = 'The interface has not been built yet. Run `pnpm build` and switch it on again.'
      return this.state()
    }

    try {
      this.#server = await startServer({
        ports: this.#options.ports(),
        broadcast: this.#options.broadcast,
        bundleDirectory: this.#options.bundleDirectory,
        token: access.token,
        port: access.port,
        bind: access.bind,
      })
    } catch (failure) {
      // A port that is taken is a fact about this machine, and the switch is where it is read.
      this.#error = `${failure instanceof Error ? failure.message : String(failure)}`
    }
    return this.state()
  }

  async set(patch: NetworkPatch): Promise<NetworkState> {
    const state = this.#options.store.read()
    const next: NetworkAccess = { ...state.network, ...patch }
    if (next.enabled && next.token === '') next.token = mintToken()
    this.#options.store.write({ ...state, network: next })
    return this.apply()
  }

  /** A new token, which stops every browser that was holding the old one. */
  async regenerateToken(): Promise<NetworkState> {
    const state = this.#options.store.read()
    const next: NetworkAccess = { ...state.network, token: mintToken() }
    this.#options.store.write({ ...state, network: next })
    return this.apply()
  }

  async close(): Promise<void> {
    await this.#stop()
  }

  async #stop(): Promise<void> {
    const server = this.#server
    this.#server = undefined
    if (server !== undefined) await server.close()
  }
}
