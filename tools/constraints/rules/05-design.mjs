/**
 * The design rules: the scale, the two voices, the focus ring, the weights, the labels, and copy that has a key.
 *
 * A rule reports violations and never edits: a pure function over a file's path and text.
 */
import { ignoredFor, isTest } from '../lib.mjs'

export const DESIGN_RULES = [
  {
    id: '05-design:no-px-lengths',
    constraint: '05-design.md',
    description: 'no px: a length in the window is rem or a Tailwind utility',
    // C5.4: rem applies the window's scale; a device pixel does not. Zero exemptions — not a
    // shadow's blur, not a hairline, not a comment: prose is where a stray length hides, so the
    // stylesheet and the components are read the same way, line by line, with no line skipped.
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
      if (!/\.(ts|tsx|css|html)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        const lengths = line.match(/(?<![\d.])[\d.]+px\b/g) ?? []
        for (const length of lengths) {
          found.push({
            line: index + 1,
            message: `${length} is a length in px; use rem or a Tailwind utility — the window's scale applies to every length (C5.4)`,
            text: line.trim(),
          })
        }
      })
      return found
    },
  },

  {
    id: '05-design:two-voices',
    constraint: '05-design.md',
    description: 'the text is sans (font-text, Geist Sans) and the apparatus is mono; there is no third face',
    // C5.3: two voices, and only two. The text voice keeps its own name — font-text, backed by
    // Geist Sans — so a raw `font-sans` (the framework's system stack), a serif, a display face or
    // an arbitrary `font-[…]` are each drift away from that pair, banned outright in classes and in
    // the stylesheet alike.
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
      if (!/\.(ts|tsx|css)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
        const third = line.match(/\bfont-(?:sans|serif|display)\b|--font-(?:sans|serif|display)\s*:|\bfont-\[/)
        if (third === null) return
        found.push({
          line: index + 1,
          message: `${third[0]} is a third face; the text is font-text (Geist Sans) and the apparatus is font-mono (C5.3)`,
          text: trimmed,
        })
      })
      return found
    },
  },

  {
    id: '05-design:no-focus-outline-none',
    constraint: '05-design.md',
    description: 'the keyboard keeps its ring; a control never removes it',
    // C5.7: `:focus-visible` draws the ring for the whole app. A control that writes
    // `focus:outline-none` beats that rule on specificity and leaves the keyboard with nothing, so
    // the class is not one this app writes — the composer, every settings field and the palette's
    // search box had it, and a field may change its border on focus instead of, never without, the
    // ring.
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
      if (!/\.(ts|tsx|css)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
        if (!/focus:outline-none/.test(line)) return
        if (ignoredFor(line, { id: '05-design:no-focus-outline-none', constraint: '05-design.md' })) return
        found.push({
          line: index + 1,
          message: 'focus:outline-none removes the accent focus ring; the ring is never removed (C5.7)',
          text: trimmed,
        })
      })
      return found
    },
  },

  {
    id: '05-design:no-other-weights',
    constraint: '05-design.md',
    description: 'three weights exist: 400, 500 and 600',
    // Read whole lines rather than stripped ones: a weight lives inside a class list, and stripping
    // quoted text is exactly how it would hide. Hierarchy comes from size, colour and space, so the
    // rule names the forbidden weights — and the numeric declaration, where 450 or 700 would drift
    // in without ever touching a class.
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
      if (!/\.(ts|tsx|css)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
        const weight = line.match(/\bfont-(?:extralight|bold|extrabold|black|light|thin)\b/)
        if (weight !== null) {
          found.push({
            line: index + 1,
            message: `${weight[0]} is a weight this interface does not have; the weights are 400, 500 and 600, and hierarchy is size, colour and space (C5.3)`,
            text: trimmed,
          })
          return
        }
        const numeric = line.match(/font-weight:\s*(\d+)/)
        if (numeric !== null && !['400', '500', '600'].includes(numeric[1])) {
          found.push({
            line: index + 1,
            message: `font-weight: ${numeric[1]}; the weights are 400, 500 and 600 (C5.3)`,
            text: trimmed,
          })
        }
      })
      return found
    },
  },

  {
    id: '05-design:no-uppercase-labels',
    constraint: '05-design.md',
    description: 'labels are sentence case; the apparatus does not shout',
    // C5.8: Codex set its labels in uppercase wide-tracked mono "by typography rather than by
    // shouting"; Caliper retires the idiom with the print furniture. The two class names are the
    // whole shout — a stylesheet's `text-transform: uppercase` carries the same word — so the
    // word is what the checker bans, in classes and declarations alike.
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
      if (!/\.(ts|tsx|css)$/.test(path)) return []
      const found = []
      text.split('\n').forEach((line, index) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.includes('/*') || trimmed.includes('*/')) {
          return
        }
        const shout = line.match(/\b(?:uppercase|tracking-widest)\b/)
        if (shout === null) return
        found.push({
          line: index + 1,
          message: `${shout[0]} is the shout the apparatus retired; labels are sentence-case mono (C5.8)`,
          text: trimmed,
        })
      })
      return found
    },
  },

  {
    id: '05-design:copy-has-a-key',
    constraint: '05-design.md',
    description: 'the interface says what the dictionary says, in the language it is in',
    /*
     * Copy is found three ways, because it hides three ways: an attribute (aria-label, placeholder,
     * title), a JSX text node on one line, and a paragraph wrapped over several. Prose inside a
     * comment is prose about the code and is skipped; a line with a brace, a quote or an operator
     * in it is code that happens to have words in it.
     */
    check({ path, text }) {
      if (!path.startsWith('apps/desktop/src/renderer/')) return []
      if (!/\.tsx$/.test(path) || isTest(path)) return []
      const found = []
      const lines = text.split('\n')
      const attribute = /\b(?:aria-label|placeholder|title)="([^"]*\s[^"]*)"/g
      const singleLine = />\s*([A-Za-z][^<>{}()=;,\n]*?)\s*</g
      const codeCharacters = /[<>{}()=;'"`\\|&*]/
      const proseCharacters = /[<>{}()=;'"`\\|&*]/
      let inComment = false

      lines.forEach((line, index) => {
        const trimmed = line.trim()
        const comment = inComment || trimmed.startsWith('//') || trimmed.startsWith('*')
        // A JSX comment opens with `{/*` and closes with `*/}`; both are comments, and prose
        // wrapped inside one is prose about the code.
        const opens = trimmed.startsWith('/*') || trimmed.startsWith('{/*')
        if (inComment && trimmed.includes('*/')) inComment = false
        if (opens && !trimmed.includes('*/')) inComment = true

        for (const match of line.matchAll(attribute)) {
          found.push({ line: index + 1, message: `"${match[1]}" is copy; take it from the dictionary`, text: trimmed })
        }
        for (const match of line.matchAll(singleLine)) {
          if (match[1].split(/\s+/).length >= 2) {
            found.push({
              line: index + 1,
              message: `"${match[1]}" is copy; take it from the dictionary`,
              text: trimmed,
            })
          }
        }
        if (comment) return
        if (codeCharacters.test(trimmed)) return
        const words = trimmed.split(/\s+/).filter((word) => /[A-Za-z]/.test(word))
        const long = words.filter((word) => word.replace(/[^A-Za-z]/g, '').length >= 3)
        if (words.length >= 4 && long.length >= 2 && !proseCharacters.test(trimmed.replace(/[—-]/g, ''))) {
          found.push({
            line: index + 1,
            message: 'a sentence in a component; take it from the dictionary',
            text: trimmed,
          })
        }
      })
      return found
    },
  },
]
