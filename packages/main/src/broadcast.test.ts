import { IPC, type WindowState } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { Broadcast } from './broadcast.ts'
import { windowSubscriber } from './ipc.ts'

describe('[main] the broadcast', () => {
  it('reaches every subscriber, on the channel it was sent on', () => {
    const bus = new Broadcast()
    const first: string[] = []
    const second: string[] = []
    bus.subscribe((push) => first.push(`${push.channel}:${String(push.payload)}`))
    bus.subscribe((push) => second.push(push.channel))

    bus.send('runtimeEvent', 'one')
    bus.send('windowStateChanged', { maximized: true })

    expect(first).toEqual(['runtimeEvent:one', 'windowStateChanged:[object Object]'])
    expect(second).toEqual(['runtimeEvent', 'windowStateChanged'])
  })

  it('stops reaching a subscriber that left', () => {
    const bus = new Broadcast()
    const seen: string[] = []
    const leave = bus.subscribe((push) => seen.push(push.channel))

    bus.send('runtimeEvent', 1)
    leave()
    bus.send('runtimeEvent', 2)

    expect(seen).toEqual(['runtimeEvent'])
  })

  it('keeps going when one client is gone', () => {
    // A browser whose socket died must not cost the window its events.
    const bus = new Broadcast()
    const seen: string[] = []
    bus.subscribe(() => {
      throw new Error('the socket is gone')
    })
    bus.subscribe((push) => seen.push(push.channel))

    expect(() => bus.send('runtimeEvent', 1)).not.toThrow()
    expect(seen).toEqual(['runtimeEvent'])
  })
})

describe('[main] the window as a subscriber', () => {
  const fakeWindow = () => {
    const sent: { channel: string; payload: unknown }[] = []
    return {
      sent,
      destroyed: false,
      isDestroyed() {
        return this.destroyed
      },
      webContents: {
        send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
      },
    }
  }

  it('forwards a push to the window under the contract channel name', () => {
    const window = fakeWindow()
    const subscriber = windowSubscriber(() => window as never)

    subscriber({ channel: 'runtimeEvent', payload: { type: 'turn_started' } })
    subscriber({ channel: 'permissionRulesChanged', payload: [] })

    expect(window.sent).toEqual([
      { channel: IPC.runtimeEvent, payload: { type: 'turn_started' } },
      { channel: IPC.permissionRulesChanged, payload: [] },
    ])
  })

  it('says nothing to a window that is gone', () => {
    const window = fakeWindow()
    window.destroyed = true
    const subscriber = windowSubscriber(() => window as never)

    subscriber({ channel: 'windowStateChanged', payload: { maximized: false } as WindowState })

    expect(window.sent).toEqual([])
  })
})
