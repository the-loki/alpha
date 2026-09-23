import { describe, expect, it } from 'vitest'
import { textOfContent, userBlocksOf } from './text.ts'

describe('[domain] user content as blocks', () => {
  it('keeps a picture next to the words it came with', () => {
    expect(
      userBlocksOf([
        { type: 'text', text: 'what is wrong here' },
        { type: 'image', data: 'AA==', mimeType: 'image/png' },
      ]),
    ).toEqual([
      { kind: 'text', text: 'what is wrong here' },
      { kind: 'attachment', mimeType: 'image/png', data: 'AA==' },
    ])
  })

  it('is a picture and nothing else when nothing was typed', () => {
    expect(userBlocksOf([{ type: 'image', data: 'AA==', mimeType: 'image/png' }])).toEqual([
      { kind: 'attachment', mimeType: 'image/png', data: 'AA==' },
    ])
  })

  it('leaves a plain message as one block of text', () => {
    expect(userBlocksOf('hello')).toEqual([{ kind: 'text', text: 'hello' }])
    expect(userBlocksOf('')).toEqual([])
  })

  it('still joins several text parts into the one message', () => {
    expect(
      textOfContent([
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
      ]),
    ).toBe('a\nb')
  })
})
