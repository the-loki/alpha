import { describe, expect, it } from 'vitest'
import { attachmentFromDataUrl, attachmentsOf, byteLengthOf, imagesOf, isImageMime } from './attachments.ts'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('[domain] attachments', () => {
  it('reads a file input’s data URL as an attachment', () => {
    expect(attachmentFromDataUrl('shot.png', PNG)).toEqual({
      name: 'shot.png',
      mimeType: 'image/png',
      data: 'iVBORw0KGgo=',
    })
  })

  it('refuses anything that is not a picture, rather than attaching it unnamed', () => {
    expect(attachmentFromDataUrl('notes.txt', 'data:text/plain;base64,aGk=')).toBeUndefined()
    expect(attachmentFromDataUrl('notes.txt', 'not a data url')).toBeUndefined()
    expect(attachmentFromDataUrl('empty.png', 'data:image/png;base64,')).toBeUndefined()
  })

  it('knows which mime types providers take', () => {
    expect(isImageMime('image/webp')).toBe(true)
    expect(isImageMime('image/svg+xml')).toBe(false)
  })

  it('counts the bytes the base64 stands for, not the characters that carry them', () => {
    // Three bytes are four characters, and every group of three ends without padding.
    expect(byteLengthOf({ mimeType: 'image/png', data: 'AAAA' })).toBe(3)
    expect(byteLengthOf({ mimeType: 'image/png', data: 'AA==' })).toBe(1)
    expect(byteLengthOf({ mimeType: 'image/png', data: 'AAA=' })).toBe(2)
    expect(byteLengthOf({ mimeType: 'image/png', data: 'iVBORw0KGgo=' })).toBe(8)
  })

  it('reads the pictures back out of a message’s content, in the order they were attached', () => {
    const content = [
      { type: 'text', text: 'look at this' },
      { type: 'image', data: 'AA==', mimeType: 'image/png' },
      { type: 'image', data: 'BB==' },
      'not a part',
    ]
    expect(attachmentsOf(content)).toEqual([{ mimeType: 'image/png', data: 'AA==' }])
  })

  it('finds no pictures in a message that is plain text', () => {
    expect(attachmentsOf('just words')).toEqual([])
  })

  it('hands the lane no list at all when there is nothing attached', () => {
    expect(imagesOf(undefined)).toBeUndefined()
    expect(imagesOf([])).toBeUndefined()
  })

  it('hands the lane the pictures as content parts', () => {
    expect(imagesOf([{ mimeType: 'image/png', data: 'AA==' }])).toEqual([
      { type: 'image', mimeType: 'image/png', data: 'AA==' },
    ])
  })
})
