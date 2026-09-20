/**
 * What the Agent panel in Settings is backed by: whether there is a pi to run, where it is, and
 * one way to get one. Alpha ships no agent, so this is the whole of the relationship until a
 * conversation is opened: find, or explain, or install.
 *
 * Everything here answers with a snapshot — the value the panel draws — and every state is a
 * value inside it. There is no path through this file that throws at a caller.
 */

import { type AgentSnapshot, type AgentStatus, PI_INSTALL_COMMAND } from '@alpha/core'
import type { StateStore } from '../state-store.ts'
import type { InstallResult } from './install.ts'

export interface AgentCliDeps {
  /** The search, with the path the settings hold (empty meaning: look around). */
  locate(explicit: string): Promise<AgentStatus>
  /** Runs the documented install command, streaming what it prints. */
  runInstall(command: string, onOutput: (chunk: string) => void): Promise<InstallResult>
  /** Tells every client what the panel should now draw. */
  publish(snapshot: AgentSnapshot): void
}

export class AgentCliService {
  readonly #store: StateStore
  readonly #deps: AgentCliDeps
  #installing = false
  #output = ''

  constructor(options: { store: StateStore; deps: AgentCliDeps }) {
    this.#store = options.store
    this.#deps = options.deps
  }

  /** Where the agent is now: looked for afresh, so the panel's "look again" is just a read. */
  async snapshot(): Promise<AgentSnapshot> {
    const path = this.#store.read().agent.path
    return {
      status: await this.#deps.locate(path),
      path,
      command: PI_INSTALL_COMMAND,
      installing: this.#installing,
      output: this.#output,
    }
  }

  /** What the person said, which is used instead of the search rather than before it. */
  async setPath(path: string): Promise<AgentSnapshot> {
    this.#store.write({ ...this.#store.read(), agent: { path } })
    return this.#announce()
  }

  /**
   * Runs the install for the person. An install already running is not started twice: the answer
   * is the snapshot that says one is running, which is what the panel wants either way.
   */
  async install(): Promise<AgentSnapshot> {
    if (this.#installing) return this.snapshot()
    this.#installing = true
    this.#output = ''
    this.#deps.publish(await this.snapshot())

    const result = await this.#deps.runInstall(PI_INSTALL_COMMAND, (chunk) => {
      this.#output += chunk
      // Pushed as it prints, so the panel can be watched rather than waited for.
      void this.snapshot().then((snapshot) => this.#deps.publish(snapshot))
    })

    this.#installing = false
    this.#output = result.output
    return this.#announce()
  }

  async #announce(): Promise<AgentSnapshot> {
    const snapshot = await this.snapshot()
    this.#deps.publish(snapshot)
    return snapshot
  }
}
