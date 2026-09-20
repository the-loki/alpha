/**
 * The one place main pushes from. A push is main telling a client something it did not ask for:
 * a runtime event, the window's state, a change to the remembered rules.
 *
 * The window is one subscriber among however many are connected, which is what a second client
 * needed — the senders used to reach for `BrowserWindow.getAllWindows()[0]`, so there was exactly
 * one possible audience. A subscriber that throws is dropped from that one push rather than
 * costing the others their event: a browser whose socket died must not take the window's news
 * down with it.
 */
import type { PUSHED_CHANNELS } from './channels.ts'

export type PushChannel = (typeof PUSHED_CHANNELS)[number]

export interface Push {
  channel: PushChannel
  payload: unknown
}

export type Subscriber = (push: Push) => void

export class Broadcast {
  readonly #subscribers = new Set<Subscriber>()

  /** Subscribes until the returned function is called, which is what closing a client does. */
  subscribe(subscriber: Subscriber): () => void {
    this.#subscribers.add(subscriber)
    return () => {
      this.#subscribers.delete(subscriber)
    }
  }

  send(channel: PushChannel, payload: unknown): void {
    for (const subscriber of [...this.#subscribers]) {
      try {
        subscriber({ channel, payload })
      } catch {
        // Nothing to do and nowhere to say it: this client is gone, the others are not.
      }
    }
  }
}
