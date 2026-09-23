import { describe, expect, it } from 'vitest'
import { file, violationsFor } from '../testing.mjs'

/** The fixtures for the design rules, each with the passing and the failing form. */

describe('05-design:no-px-lengths', () => {
  const rule = '05-design:no-px-lengths'

  it('flags a px length in a class, and in a stylesheet', () => {
    const inClass = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.tsx', '<p className="text-[13px] gap-2">x</p>'),
    )
    expect(inClass).toHaveLength(1)
    expect(inClass[0].message).toContain('13px')

    const inCss = violationsFor(rule, file('apps/desktop/src/renderer/styles/a.css', '  padding: 6px;'))
    expect(inCss).toHaveLength(1)
  })

  it('flags px with no exceptions — a hairline, a shadow, a comment — and allows only rem', () => {
    const hairline = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.css', '  border: 1px solid var(--color-line);'),
    )
    expect(hairline).toHaveLength(1)

    const shadow = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.css', '  box-shadow: 0 7px 32px rgb(0 0 0 / 0.35);'),
    )
    expect(shadow).toHaveLength(2)

    const comment = violationsFor(rule, file('apps/desktop/src/renderer/a.ts', '// the caret is 2px wide'))
    expect(comment).toHaveLength(1)

    const jsdoc = file(
      'apps/desktop/src/renderer/a.ts',
      ['/**', ' * The caret is 2px wide.', ' */', 'const x = 1'].join('\n'),
    )
    expect(violationsFor(rule, jsdoc)).toHaveLength(1)

    const rem = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.tsx', '<p className="text-ui rounded-card">x</p>'),
    )
    expect(rem).toEqual([])

    const remShadow = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.css', '  box-shadow: 0 0.4375rem 1.5rem rgb(0 0 0 / 0.35);'),
    )
    expect(remShadow).toEqual([])

    const prose = violationsFor(rule, file('apps/desktop/src/renderer/a.css', '   * rem, not px, so scaling works'))
    expect(prose).toEqual([])
  })

  it('reads a selector as a length wherever the digits are', () => {
    const selector = violationsFor(rule, file('apps/desktop/src/renderer/styles/a.css', '* { gap: 6px }'))
    expect(selector).toHaveLength(1)

    const lineComment = violationsFor(rule, file('apps/desktop/src/renderer/a.ts', '// 6px of air'))
    expect(lineComment).toHaveLength(1)
  })

  it('reads the html the renderer ships too', () => {
    const found = violationsFor(rule, file('apps/desktop/src/renderer/index.html', '<meta name="x" content="12px" />'))
    expect(found).toHaveLength(1)
  })

  it('says nothing about files outside the renderer', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', 'const pad = "6px"'))).toEqual([])
  })
})

describe('05-design:two-voices', () => {
  const rule = '05-design:two-voices'

  it('flags a third face in a class list or in the stylesheet', () => {
    for (const face of ['font-sans', 'font-serif', 'font-display', 'font-[Fraunces]']) {
      const found = violationsFor(rule, file('apps/desktop/src/renderer/a.tsx', `<p className="${face}">x</p>`))
      expect(found, face).toHaveLength(1)
      expect(found[0].message).toContain('third face')
    }

    const inCss = violationsFor(rule, file('apps/desktop/src/renderer/a.css', '--font-serif: Georgia;'))
    expect(inCss).toHaveLength(1)
  })

  it('allows the two voices there are, and the same words in the main process', () => {
    const twoVoices = violationsFor(
      rule,
      file(
        'apps/desktop/src/renderer/a.tsx',
        '<h1 className="font-text"><span className="font-mono">Ctrl+N</span></h1>',
      ),
    )
    expect(twoVoices).toEqual([])

    expect(violationsFor(rule, file('apps/desktop/src/main/a.tsx', '<p className="font-sans">x</p>'))).toEqual([])
  })
})

describe('05-design:no-focus-outline-none', () => {
  const rule = '05-design:no-focus-outline-none'

  it('flags a control that removes the ring, and the same words in a stylesheet', () => {
    const found = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.tsx', '<textarea className="field focus:outline-none" />'),
    )
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('never removed')

    const css = violationsFor(rule, file('apps/desktop/src/renderer/a.css', 'button:focus { outline: none }'))
    expect(css).toEqual([])
    expect(violationsFor(rule, file('apps/desktop/src/renderer/a.css', '.x { }'))).toEqual([])
  })

  it('allows a field that changes its border on focus, and the main process', () => {
    expect(
      violationsFor(rule, file('apps/desktop/src/renderer/a.tsx', '<input className="focus:border-line-strong" />')),
    ).toEqual([])
    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', "const a = 'focus:outline-none'"))).toEqual([])
  })

  it('honours the constraints-ignore marker on the line, the way every rule does', () => {
    const marked = violationsFor(
      rule,
      file(
        'apps/desktop/src/renderer/a.tsx',
        'const F = `focus:outline-none` // constraints-ignore 05-design — the caret is the answer',
      ),
    )
    expect(marked).toEqual([])
  })
})

describe('05-design:no-other-weights', () => {
  const rule = '05-design:no-other-weights'

  it('flags every weight this interface does not have, class or declaration', () => {
    for (const weight of ['font-bold', 'font-extrabold', 'font-black', 'font-light', 'font-thin', 'font-extralight']) {
      const found = violationsFor(rule, file('apps/desktop/src/renderer/a.tsx', `<h1 className="${weight}">x</h1>`))
      expect(found, weight).toHaveLength(1)
    }

    const numeric = violationsFor(rule, file('apps/desktop/src/renderer/a.css', '.title { font-weight: 450; }'))
    expect(numeric).toHaveLength(1)
    expect(numeric[0].message).toContain('400, 500 and 600')
  })

  it('allows the three weights there are, and the same words in the main process', () => {
    const allowed = violationsFor(
      rule,
      file(
        'apps/desktop/src/renderer/a.tsx',
        '<h1 className="font-semibold"><span className="font-medium text-label">x</span></h1>',
      ),
    )
    expect(allowed).toEqual([])

    const declared = violationsFor(rule, file('apps/desktop/src/renderer/a.css', '.body { font-weight: 400; }'))
    expect(declared).toEqual([])

    expect(violationsFor(rule, file('apps/desktop/src/main/a.ts', "const a = 'font-bold'"))).toEqual([])
  })
})

describe('05-design:no-uppercase-labels', () => {
  const rule = '05-design:no-uppercase-labels'

  it('flags the shout in a class list and in a stylesheet', () => {
    const inClass = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.tsx', '<p className="font-mono uppercase tracking-widest">x</p>'),
    )
    expect(inClass).toHaveLength(1)
    expect(inClass[0].message).toContain('sentence-case')

    const inCss = violationsFor(rule, file('apps/desktop/src/renderer/a.css', '.label { text-transform: uppercase; }'))
    expect(inCss).toHaveLength(1)
  })

  it('allows a sentence-case label, prose about it, and the main process', () => {
    const label = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.tsx', '<p className="font-mono text-label">x</p>'),
    )
    expect(label).toEqual([])

    const comment = violationsFor(rule, file('apps/desktop/src/renderer/a.css', '  /* labels are not uppercase */'))
    expect(comment).toEqual([])

    expect(violationsFor(rule, file('apps/desktop/src/main/a.tsx', '<p className="uppercase">x</p>'))).toEqual([])
  })
})

describe('05-design:copy-has-a-key', () => {
  const rule = '05-design:copy-has-a-key'

  it('flags copy in an attribute, in a text node, and in a wrapped paragraph', () => {
    const attribute = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.tsx', '<input aria-label="Access token" />'),
    )
    expect(attribute).toHaveLength(1)

    const text = violationsFor(rule, file('apps/desktop/src/renderer/a.tsx', '<p>Allow once</p>'))
    expect(text).toHaveLength(1)

    const paragraph = violationsFor(
      rule,
      file('apps/desktop/src/renderer/a.tsx', '<p>\n  Alpha ships no keys. A provider you add is the only one.\n</p>'),
    )
    expect(paragraph).toHaveLength(1)
  })

  it('allows a key, a single word, and prose in a comment', () => {
    const key = violationsFor(rule, file('apps/desktop/src/renderer/a.tsx', "<p>{t('sidebar.search')}</p>"))
    expect(key).toEqual([])

    const oneWord = violationsFor(rule, file('apps/desktop/src/renderer/a.tsx', '<span>Alpha</span>'))
    expect(oneWord).toEqual([])

    const insideAComment = violationsFor(
      rule,
      file(
        'apps/desktop/src/renderer/a.tsx',
        ["{/* The age is the row's metadata, and the row is the", "    conversation's name and nothing else. */}"].join(
          '\n',
        ),
      ),
    )
    expect(insideAComment).toEqual([])
  })

  it('reads the renderer only', () => {
    expect(violationsFor(rule, file('apps/desktop/src/main/a.tsx', '<p aria-label="Access token" />'))).toEqual([])
  })
})
