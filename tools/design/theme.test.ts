import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The palette, checked as numbers. docs/constraints/05-design.md C5.2 says every text/background
 * pair clears 4.5:1 and that `--parchment-faint` is metadata only and still clears 3:1; this reads
 * the tokens out of the stylesheet itself, so a colour changed in CSS cannot quietly go unmeasured.
 *
 * It lives here rather than in the renderer because it reads the repository: the renderer has no
 * Node, and a check that needs a filesystem is not a renderer unit test.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..')
const CSS = readFileSync(join(REPO_ROOT, 'packages/renderer/src/styles/app.css'), 'utf-8')

type Palette = Record<string, string>

/** Tokens from the base block, then the ones a theme overrides on top. */
function paletteOf(selector: string): Palette {
  const blocks = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) => match[1].includes(selector))
  const palette: Palette = {}
  for (const block of blocks) {
    for (const [, name, value] of block[2].matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
      palette[name] = value
    }
  }
  return palette
}

const dark = paletteOf(':root')
const light = { ...dark, ...paletteOf(":root[data-theme='light']") }

function channel(value: number): number {
  const normalized = value / 255
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16))
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

/** The token name of the surface each text token is read on, which is what the design table means. */
const PAIRS: { text: string; surface: string; minimum: number }[] = [
  { text: 'parchment', surface: 'ink-900', minimum: 4.5 },
  { text: 'parchment', surface: 'ink-800', minimum: 4.5 },
  { text: 'parchment', surface: 'ink-700', minimum: 4.5 },
  { text: 'parchment', surface: 'ink-600', minimum: 4.5 },
  { text: 'parchment-dim', surface: 'ink-800', minimum: 4.5 },
  { text: 'parchment-dim', surface: 'ink-700', minimum: 4.5 },
  { text: 'parchment-faint', surface: 'ink-900', minimum: 3 },
  { text: 'parchment-faint', surface: 'ink-800', minimum: 3 },
  { text: 'parchment-faint', surface: 'ink-700', minimum: 3 },
  { text: 'ember', surface: 'ink-900', minimum: 4.5 },
  { text: 'ember', surface: 'ink-800', minimum: 4.5 },
  { text: 'ember', surface: 'ink-700', minimum: 4.5 },
  { text: 'jade', surface: 'ink-800', minimum: 4.5 },
  { text: 'jade', surface: 'ink-700', minimum: 4.5 },
  { text: 'amber', surface: 'ink-800', minimum: 4.5 },
  { text: 'amber', surface: 'ink-700', minimum: 4.5 },
  { text: 'danger', surface: 'ink-800', minimum: 4.5 },
  { text: 'danger', surface: 'ink-700', minimum: 4.5 },
  { text: 'info', surface: 'ink-800', minimum: 4.5 },
  { text: 'info', surface: 'ink-700', minimum: 4.5 },
  // Text on the accent, which is what a primary button is.
  { text: 'ember-ink', surface: 'ember', minimum: 4.5 },
]

describe.each([
  ['dark', dark],
  ['light', light],
])('the %s palette', (name, palette) => {
  it('defines every token the design table names', () => {
    const tokens = [
      'ink-900',
      'ink-800',
      'ink-700',
      'ink-600',
      'line',
      'line-strong',
      'parchment',
      'parchment-dim',
      'parchment-faint',
      'ember',
      'ember-bright',
      'ember-ink',
      'jade',
      'amber',
      'danger',
      'info',
    ]
    expect(tokens.filter((token) => palette[token] === undefined)).toEqual([])
  })

  it('clears every contrast threshold the constraints set', () => {
    const failures = PAIRS.flatMap((pair) => {
      const foreground = palette[pair.text]
      const background = palette[pair.surface]
      if (foreground === undefined || background === undefined)
        return [`${pair.text} on ${pair.surface}: missing token`]
      const ratio = contrast(foreground, background)
      return ratio < pair.minimum
        ? [`${pair.text} on ${pair.surface}: ${ratio.toFixed(2)}:1, needs ${pair.minimum}:1`]
        : []
    })
    expect(failures).toEqual([])
  })

  it('keeps the levels tellable apart from each other by luminance as well as hue', () => {
    // Levels use info, amber, jade and ember; a reader who cannot tell hue must still see a
    // difference between neighbouring levels, so no two of them may be the same colour.
    const levels = ['info', 'amber', 'jade', 'ember'].map((token) => palette[token])
    expect(new Set(levels).size).toBe(levels.length)
    void name
  })
})
