import { describe, expect, it } from 'vitest'
import { changePreview } from './preview.ts'

describe('[domain] changePreview', () => {
  it('shows a write as the lines it would add', () => {
    const preview = changePreview('write', { path: 'notes.txt', content: 'one\ntwo' })
    expect(preview).toBe(['--- notes.txt', '+++ notes.txt', '+one', '+two'].join('\n'))
  })

  it('shows an edit as the lines it would replace', () => {
    const preview = changePreview('edit', {
      path: 'src/index.ts',
      edits: [{ oldText: 'const a = 1', newText: 'const a = 2' }],
    })
    expect(preview).toBe(['--- src/index.ts', '+++ src/index.ts', '-const a = 1', '+const a = 2'].join('\n'))
  })

  it('shows every edit of a multi-edit call, in order', () => {
    const preview = changePreview('edit', {
      path: 'a.ts',
      edits: [
        { oldText: 'one', newText: 'two' },
        { oldText: 'three', newText: 'four' },
      ],
    })
    expect(preview?.split('\n').slice(2)).toEqual(['-one', '+two', '-three', '+four'])
  })

  it('marks a multi-line replacement line by line', () => {
    const preview = changePreview('edit', { path: 'a.ts', edits: [{ oldText: 'a\nb', newText: 'c\nd' }] })
    expect(preview?.split('\n').slice(2)).toEqual(['-a', '-b', '+c', '+d'])
  })

  it('has nothing to show for a call that does not change a file', () => {
    expect(changePreview('bash', { command: 'ls' })).toBeUndefined()
    expect(changePreview('read', { path: 'a.txt' })).toBeUndefined()
  })

  it('has nothing to show when the arguments are not the shape the tool expects', () => {
    expect(changePreview('write', { path: 'a.txt' })).toBeUndefined()
    expect(changePreview('edit', { path: 'a.ts', edits: 'nope' })).toBeUndefined()
    expect(changePreview('write', {})).toBeUndefined()
  })

  it('keeps a long write from filling the card, and says how much it kept back', () => {
    const content = Array.from({ length: 60 }, (_, index) => `line ${index}`).join('\n')
    const preview = changePreview('write', { path: 'big.txt', content })
    const lines = preview?.split('\n') ?? []
    expect(lines).toHaveLength(2 + 40 + 1)
    expect(lines.at(-1)).toBe('… 20 more lines')
  })
})
