import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The router plugin and the router runtime have to be the same generation of the library. The
 * plugin generates the hot-update handler that runs in the page, and that handler calls private
 * methods on the router the page is holding — `router._replaceRouteChunk` among them. Nothing in
 * the type system, and nothing in a production build, connects the two: the handler only runs under
 * `import.meta.hot`, so a mismatch is invisible until somebody edits a route file with the dev
 * window open.
 *
 * On 2026-09-20 it did: router 1.169.2 with plugin 1.168.40 threw
 * `router._replaceRouteChunk is not a function` on every route-file edit, which left the settings
 * screen stuck behind an error card until the window was reloaded. The two manifests agree on the
 * version that decides it — `@tanstack/router-core` — and the plugin states the range it wants in
 * its peer list, so both are read here rather than trusted.
 *
 * It lives in tools/ because it reads the repository, the same reason the palette check does.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..')

const pkg = (path: string) => JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf-8'))

/** What the browser actually loads: the installed copy, not the manifest's wish. */
const runtime = pkg('packages/renderer/node_modules/@tanstack/react-router/package.json')
const plugin = pkg('node_modules/@tanstack/router-plugin/package.json')

/**
 * `^1.170.38` against `1.169.2` — the shape these manifests use, and no more. A range this does not
 * understand is an error rather than a pass, so a range gaining `||` or `~` gets noticed.
 */
function satisfiesCaret(version: string, range: string): boolean {
  const wanted = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range)
  if (wanted === null) throw new Error(`a range this check does not understand: ${range}`)
  const [major, minor, patch] = wanted.slice(1).map(Number)
  const [haveMajor, haveMinor, havePatch] = version.split('.').map(Number)
  if (haveMajor !== major) return false
  if (haveMinor !== minor) return haveMinor > minor
  return havePatch >= patch
}

describe('the router runtime and the router plugin', () => {
  it('is a version the plugin says it can drive', () => {
    const wanted = plugin.peerDependencies['@tanstack/react-router']
    expect(satisfiesCaret(runtime.version, wanted)).toBe(true)
  })

  it('runs on the same router-core generation the plugin builds against', () => {
    expect(runtime.dependencies['@tanstack/router-core']).toBe(plugin.dependencies['@tanstack/router-core'])
  })

  // The reader of the two versions above is small enough to be wrong without saying so, and the
  // pair that broke on 2026-09-20 is the one case it has to get right.
  it('reads a caret range the way the versions that broke it need', () => {
    expect(satisfiesCaret('1.169.2', '^1.170.38')).toBe(false)
    expect(satisfiesCaret('1.170.38', '^1.170.38')).toBe(true)
    expect(satisfiesCaret('1.171.0', '^1.170.38')).toBe(true)
    expect(satisfiesCaret('2.0.0', '^1.170.38')).toBe(false)
  })
})
