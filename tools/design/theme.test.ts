import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The Caliper palette, checked as numbers. docs/constraints/05-design.md C5.2 says every text
 * pair clears 4.5:1 (faint is metadata and clears 3:1), that the four permission levels are four
 * distinct hues, and that the stacks are Geist Sans + Geist Mono with no third face; this reads
 * the tokens out of the stylesheet itself, so a colour changed in CSS cannot quietly go
 * unmeasured.
 *
 * It lives here rather than in the renderer because it reads the repository: the renderer has no
 * Node, and a check that needs a filesystem is not a renderer unit test.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..')
const CSS = readFileSync(join(REPO_ROOT, 'apps/desktop/src/renderer/styles/app.css'), 'utf-8')

type Palette = Record<string, string>

/**
 * The tokens of one block, by its exact selector. Not a substring match: `:root[data-theme='x']`
 * contains `:root`, and matching that way silently folds every override into the base palette.
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

/** Light is what `@theme` holds — both themes are first-class and the dark one is the override. */
const light = paletteOf('@theme')
const dark = { ...light, ...paletteOf(":root[data-theme='dark']") }
const PALETTES: [string, Palette][] = [
  ['light', light],
  ['dark', dark],
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
  // Primary and secondary text stand on every surface the app has.
  { text: 'foreground', surface: 'surface-0', minimum: 4.5 },
  { text: 'foreground', surface: 'surface-1', minimum: 4.5 },
  { text: 'foreground', surface: 'surface-2', minimum: 4.5 },
  { text: 'foreground', surface: 'surface-3', minimum: 4.5 },
  { text: 'muted', surface: 'surface-0', minimum: 4.5 },
  { text: 'muted', surface: 'surface-1', minimum: 4.5 },
  { text: 'muted', surface: 'surface-2', minimum: 4.5 },
  { text: 'muted', surface: 'surface-3', minimum: 4.5 },
  // Labels stand on the page, the panel and a card — never alone on a floating layer.
  { text: 'tertiary', surface: 'surface-0', minimum: 4.5 },
  { text: 'tertiary', surface: 'surface-1', minimum: 4.5 },
  { text: 'tertiary', surface: 'surface-2', minimum: 4.5 },
  { text: 'faint', surface: 'surface-0', minimum: 3 },
  { text: 'faint', surface: 'surface-1', minimum: 3 },
  { text: 'faint', surface: 'surface-2', minimum: 3 },
  { text: 'faint', surface: 'surface-3', minimum: 3 },
  // The accent and the semantics as text on the page (C5.2).
  { text: 'accent', surface: 'surface-0', minimum: 4.5 },
  { text: 'danger', surface: 'surface-0', minimum: 4.5 },
  { text: 'success', surface: 'surface-0', minimum: 4.5 },
  { text: 'warning', surface: 'surface-0', minimum: 4.5 },
  { text: 'info', surface: 'surface-0', minimum: 4.5 },
  // Text on a solid fill: the primary button, a danger button — at rest and under the pointer.
  { text: 'accent-ink', surface: 'accent-strong', minimum: 4.5 },
  { text: 'accent-ink', surface: 'accent-deep', minimum: 4.5 },
  { text: 'danger-ink', surface: 'danger', minimum: 4.5 },
  // The pointer's answer on accent text: a link, brightened or deepened, still readable (C5.6).
  { text: 'accent-hover', surface: 'surface-0', minimum: 4.5 },
]

describe.each(PALETTES)('the %s palette', (name, palette) => {
  it('defines every token the design table names', () => {
    const tokens = [
      'surface-0',
      'surface-1',
      'surface-2',
      'surface-3',
      'foreground',
      'muted',
      'tertiary',
      'faint',
      'accent',
      'accent-strong',
      'accent-ink',
      'accent-hover',
      'accent-deep',
      'danger',
      'danger-ink',
      'success',
      'warning',
      'info',
    ]
    expect(tokens.filter((token) => palette[token] === undefined)).toEqual([])
    void name
  })

  it('declares the three border overlays alongside the hexes', () => {
    // Borders are transparent overlays, not flat greys (C5.2), so they are read as declarations.
    for (const token of ['--color-line-subtle:', '--color-line:', '--color-line-strong:']) {
      expect(CSS, token).toContain(token)
    }
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

  it('keeps the four levels tellable apart from each other and from the accent', () => {
    // Four permission levels, four semantic hues, and the accent is not one of them (C5.2).
    const hues = ['info', 'warning', 'success', 'danger', 'accent'].map((token) => palette[token])
    expect(hues.every((hex) => hex !== undefined)).toBe(true)
    expect(new Set(hues).size).toBe(hues.length)
    void name
  })
})

/** One declaration of the stylesheet, read by name. Throws rather than passing on absence. */
function declaration(name: string): string {
  const match = CSS.match(new RegExp(`${name}:\\s*([^;]+);`))
  if (match === null) throw new Error(`${name} is not declared`)
  return match[1].trim()
}

describe('[design] the font stacks', () => {
  it('gives the text voice Geist Sans with a chosen CJK sans behind it', () => {
    const text = declaration('--font-text')
    expect(text).toContain('Geist Sans')
    for (const family of ['PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC']) {
      expect(text).toContain(family)
    }
    // A Latin sans first, so Latin characters in Chinese prose keep the text voice.
    expect(text.indexOf('Geist Sans')).toBeLessThan(text.indexOf('PingFang SC'))
    // And no serif anywhere in the stack: the serif voice left with Codex (C5.3).
    expect(text).not.toMatch(/Iowan|Charter|Georgia|Liberation Serif|Noto Serif|Source Han Serif|Songti|SimSun/)
  })

  it('keeps Geist Mono and a CJK-capable family in the apparatus stack', () => {
    const mono = declaration('--font-mono')
    expect(mono).toContain('Geist Mono')
    expect(mono).toContain('Noto Sans Mono CJK SC')
    expect(mono).toContain('monospace')
    expect(mono.indexOf('Geist Mono')).toBeLessThan(mono.indexOf('Noto Sans Mono CJK SC'))
  })

  it('declares no third face', () => {
    // Two voices, and only two: the text and the apparatus (C5.3).
    expect(CSS).not.toMatch(/--font-(?:sans|display|serif):/)
  })
})

describe('[design] the type scale, shape and motion tokens', () => {
  it('pins every size of the scale in rem, at the leading the design gives it', () => {
    const scale: [string, string, string][] = [
      ['--text-label', '0.75rem', '1.4'],
      ['--text-code', '0.8125rem', '1.6'],
      ['--text-name', '0.875rem', '1.45'],
      ['--text-body', '0.9375rem', '1.55'],
      ['--text-title', '1.25rem', '1.3'],
      ['--text-display', '1.75rem', '1.25'],
    ]
    for (const [token, size, leading] of scale) {
      expect(declaration(token), token).toBe(size)
      expect(declaration(`${token}--line-height`), `${token} leading`).toBe(leading)
    }
    expect(declaration('--container-measure')).toBe('70ch')
  })

  it('uses exactly three weights, and never a fourth in a declaration', () => {
    const declared = [...CSS.matchAll(/font-weight:\s*(\d+)/g)].map((match) => match[1])
    expect(declared.filter((weight) => !['400', '500', '600'].includes(weight))).toEqual([])
  })

  it('pins the four radii of the scale and the four shadow levels', () => {
    // 0.25, 0.375, 0.5 and 0.75rem — the whole radius scale, and no fifth (C5.4).
    expect(declaration('--radius-sm')).toBe('0.25rem')
    expect(declaration('--radius-md')).toBe('0.375rem')
    expect(declaration('--radius-lg')).toBe('0.5rem')
    expect(declaration('--radius-xl')).toBe('0.75rem')
    for (const level of ['--shadow-tiny', '--shadow-low', '--shadow-medium', '--shadow-high']) {
      expect(CSS, level).toContain(`${level}:`)
    }
  })

  it('pins the three durations, the curve, and the accent focus ring', () => {
    expect(declaration('--duration-fast')).toBe('100ms')
    expect(declaration('--duration-normal')).toBe('160ms')
    expect(declaration('--duration-slow')).toBe('250ms')
    expect(declaration('--ease-out-quad')).toMatch(/cubic-bezier/)
    expect(CSS).toContain('outline: 0.125rem solid var(--color-accent)')
    expect(CSS).toContain('outline-offset: 0.125rem')
  })
})
