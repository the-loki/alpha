/**
 * Reading a value whose shape the types do not know yet: JSON that came from a file, and the two
 * total reads — an object to look a field up in, and a list to walk. The protocol promises a shape
 * and a reply is still unknown until something reads a field off it, so every read goes through
 * here: a guard that changes changes for every reader at once.
 *
 * It sits below the modules that read replies (the transcript, the usage report, the runtime
 * events) because they all need it and it needs nothing: a leaf, so no read can close a loop.
 */
/** Parses JSON that came from a file, without pretending a broken file is an empty one. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * An object to look a field up in, from a value that is `unknown` because it came off the wire.
 *
 * Replies from the agent are read through this and `listOf`: the protocol promises a shape and a
 * reply is still unknown until something reads a field off it, so the read is total rather than a
 * cast — and in one place, so a guard that changes changes for every reader instead of for two of
 * the three.
 */
export const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

/** A list to walk, from the same kind of value. Anything that is not an array is the empty one. */
export const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
