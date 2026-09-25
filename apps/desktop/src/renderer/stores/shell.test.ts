import type { AlphaBridge, LaunchState } from '@alpha/contract'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../lib/bridge.ts', () => ({ bridge: vi.fn(), clientHost: () => 'desktop' }))
vi.mock('../lib/network-bridge.ts', () => ({
  Unauthorized: class extends Error {},
  unlock: vi.fn(),
  watchRefusals: vi.fn(),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

it('follows system theme changes only while system is selected', async () => {
  const setAttribute = vi.fn()
  vi.stubGlobal('document', { documentElement: { setAttribute } })
  let onChange: (() => void) | undefined
  const query = {
    matches: false,
    addEventListener: vi.fn((_event: string, listener: () => void) => {
      onChange = listener
    }),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  )

  const { bridge } = await import('../lib/bridge.ts')
  vi.mocked(bridge).mockReturnValue({
    setAppearance: vi.fn(async (patch) => ({ theme: patch.theme }) as LaunchState),
  } as unknown as AlphaBridge)
  const { shellActions } = await import('./shell.ts')

  await shellActions.setAppearance({ theme: 'system' })
  expect(setAttribute).toHaveBeenLastCalledWith('data-theme', 'light')
  query.matches = true
  onChange?.()
  expect(setAttribute).toHaveBeenLastCalledWith('data-theme', 'dark')

  await shellActions.setAppearance({ theme: 'light' })
  onChange?.()
  expect(setAttribute).toHaveBeenLastCalledWith('data-theme', 'light')
})
