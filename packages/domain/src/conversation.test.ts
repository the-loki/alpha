import { describe, expect, it } from 'vitest'
import { TITLE_LIMIT, titleFromMessage, titleFromPath } from './conversation.ts'

describe('[domain] titleFromMessage', () => {
  it('uses the message itself when it is short', () => {
    expect(titleFromMessage('Fix the failing test')).toBe('Fix the failing test')
  })

  it('uses the first line only', () => {
    expect(titleFromMessage('Fix the parser\n\nand then the writer')).toBe('Fix the parser')
  })

  it('skips leading empty lines', () => {
    expect(titleFromMessage('\n\n   \nRename the field')).toBe('Rename the field')
  })

  it('collapses runs of whitespace', () => {
    expect(titleFromMessage('Rename   the    field')).toBe('Rename the field')
  })

  it('truncates a long message and marks it', () => {
    const title = titleFromMessage('a'.repeat(200))
    expect(title).toHaveLength(TITLE_LIMIT + 1)
    expect(title.endsWith('…')).toBe(true)
  })

  it('falls back when there is nothing to title from', () => {
    expect(titleFromMessage('   \n  ')).toBe('New conversation')
  })
})

describe('[domain] titleFromPath', () => {
  it('names a conversation after its folder when there is no message yet', () => {
    expect(titleFromPath('/home/dev/alpha', 'New conversation')).toBe('alpha')
  })

  it('prefers the fallback when the path names nothing', () => {
    expect(titleFromPath('/', 'New conversation')).toBe('New conversation')
  })
})
