import { describe, expect, it } from 'vitest'
import { listOf, recordOf } from './unknown.ts'

/** The two total reads, and what they do with a value that is not the shape they promise. */

describe('[domain] reading an unknown reply', () => {
  it('reads an object as an object to look a field up in', () => {
    expect(recordOf({ id: 'abc' }).id).toBe('abc')
    expect(recordOf({ nested: { deep: 1 } })).toEqual({ nested: { deep: 1 } })
  })

  it('reads everything else as nothing, rather than throwing on a field', () => {
    // What a reply can be when the other side is not the shape it promised: this is the boundary
    // between pi's protocol and what a message actually holds.
    expect(recordOf(undefined)).toEqual({})
    expect(recordOf(null)).toEqual({})
    expect(recordOf('{"id":"abc"}')).toEqual({})
    expect(recordOf(42)).toEqual({})
    expect(recordOf(['a'])).toEqual({})
  })

  it('reads an array as a list, and everything else as the empty one', () => {
    expect(listOf([1, 2])).toEqual([1, 2])
    expect(listOf([])).toEqual([])
    expect(listOf(undefined)).toEqual([])
    expect(listOf({ 0: 'a', length: 1 })).toEqual([])
    expect(listOf('ab')).toEqual([])
  })
})
