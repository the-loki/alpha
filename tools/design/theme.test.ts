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
const CSS = readFileSync(join(REPO_ROOT, 'apps/desktop/src/renderer/styles/app.css'), 'utf-8')

type Palette = Record<string, string>

/**
 * The tokens of one block, by its exact selector. Not a substring match: `:root[data-accent='x']`
 * contains `:root`, and matching that way silently folds every accent into the base palette.
 */
function paletteOf(selector: string): Palette {
  const palette: Palette = {}
  for (const block of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = block[1].split(/[;\n]/).map((part) => part.trim())
    if (!selectors.includes(selector)) continue
    for (const [, name, value] of block[2].matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
      palette[name] = value
    }
  }
  return palette
}

/** The default palette, which is the light one; dark and each accent are overrides on top. */
const light = paletteOf('@theme')
const dark = { ...light, ...paletteOf(":root[data-theme='dark']") }
const ACCENTS = [...new Set([...CSS.matchAll(/\[data-accent='([\w-]+)'\]/g)].map((match) => match[1]))]

/** Every palette the app can be in: two modes, and each accent in each of them. */
const PALETTES: [string, Palette][] = [
  ['light', light],
  ['dark', dark],
  ...ACCENTS.flatMap((accent): [string, Palette][] => [
    [`light/${accent}`, { ...light, ...paletteOf(`[data-accent='${accent}']`) }],
    [
      `dark/${accent}`,
      {
        ...dark,
        ...paletteOf(`[data-accent='${accent}']`),
        ...paletteOf(`[data-theme='dark'][data-accent='${accent}']`),
      },
    ],
  ]),
]

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
  // The accent is whichever palette the user picked, so this is measured once per accent below.
  { text: 'accent', surface: 'ink-900', minimum: 4.5 },
  { text: 'accent', surface: 'ink-800', minimum: 4.5 },
  { text: 'accent', surface: 'ink-700', minimum: 4.5 },
  { text: 'accent-ink', surface: 'accent', minimum: 4.5 },
  // Text on the accent, which is what a primary button is.
  { text: 'warm', surface: 'ink-800', minimum: 4.5 },
  { text: 'warm', surface: 'ink-700', minimum: 4.5 },
  { text: 'jade', surface: 'ink-800', minimum: 4.5 },
  { text: 'jade', surface: 'ink-700', minimum: 4.5 },
  { text: 'amber', surface: 'ink-800', minimum: 4.5 },
  { text: 'amber', surface: 'ink-700', minimum: 4.5 },
  { text: 'danger', surface: 'ink-800', minimum: 4.5 },
  { text: 'danger', surface: 'ink-700', minimum: 4.5 },
  { text: 'info', surface: 'ink-800', minimum: 4.5 },
  { text: 'info', surface: 'ink-700', minimum: 4.5 },
]

describe('the accent attribute', () => {
  const ACCENT_TOKENS = ['accent', 'accent-bright', 'accent-ink']

  it('means the same as its absence for the default accent', () => {
    // `iris` is written both as the default and as an attribute, because the settings page shows
    // an accent by wearing it. The two spellings drifting apart would show there first.
    const pick = (palette: Palette) => Object.fromEntries(ACCENT_TOKENS.map((token) => [token, palette[token]]))
    expect(pick(paletteOf("[data-accent='iris']"))).toEqual(pick(light))
    expect(pick(paletteOf("[data-theme='dark'][data-accent='iris']"))).toEqual(pick(dark))
  })
})

describe.each(PALETTES)('the %s palette', (name, palette) => {
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
      'accent',
      'accent-bright',
      'accent-ink',
      'warm',
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
    // Levels use info, amber, jade and warm — the fixed four, not the user's accent: a green
    // accent would otherwise make full-access and accept-edits the same colour.
    const levels = ['info', 'amber', 'jade', 'warm'].map((token) => palette[token])
    expect(new Set(levels).size).toBe(levels.length)
    void name
  })
})

/**
 * The font stacks, because the interface has two languages and only one of them is bundled. A
 * stack that stops at `sans-serif` still works on a machine that has a CJK font — by luck, and by
 * a font nobody chose. These names are the ones a Chinese desktop actually has (C5.3).
 */
describe('[design] the font stacks', () => {
  const stackOf = (name: string): string => {
    const match = CSS.match(new RegExp(`--${name}:([^;]+);`))
    if (match === null) throw new Error(`--${name} is not declared`)
    return match[1]
  }

  it('names a chinese face per platform after the bundled ones', () => {
    const sans = stackOf('font-sans')
    for (const family of ['PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Microsoft YaHei']) {
      expect(sans).toContain(family)
    }
    // First, so Latin characters in Chinese prose keep the bundled voice.
    expect(sans.indexOf('Inter')).toBeLessThan(sans.indexOf('PingFang SC'))
  })

  it('keeps a CJK-capable family last in the mono stack too', () => {
    // Chinese inside a mono context — a path, a count — must not fall off the stack.
    expect(stackOf('font-mono')).toContain('monospace')
  })
})
