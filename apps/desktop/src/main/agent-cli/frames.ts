/**
 * The framing of the agent's protocol: JSONL with LF as the only record delimiter.
 *
 * It is one function and one class for a reason. Node's `readline` is *not* protocol-compliant
 * here: it also splits on U+2028 and U+2029, which are legal inside a JSON string, so a message
 * containing one would arrive as three broken records. Splitting on `\n` and stripping a trailing
 * `\r` is the whole rule, and it lives in once place so both ends of the pipe obey it.
 */

export interface FrameStep {
  /** The records that were completed by this chunk, in the order they arrived. */
  records: unknown[]
  /** Lines that were not JSON: counted rather than fatal, so one broken line costs one line. */
  rejected: number
}

/**
 * Takes text as it arrives — in whatever pieces the pipe feels like — and hands back whole
 * records. A partial record stays inside until the newline that ends it turns up.
 */
export class FrameReader {
  #pending = ''

  push(chunk: string): FrameStep {
    this.#pending += chunk
    const records: unknown[] = []
    let rejected = 0

    for (;;) {
      const newline = this.#pending.indexOf('\n')
      if (newline === -1) break
      const line = this.#pending.slice(0, newline).replace(/\r$/, '')
      this.#pending = this.#pending.slice(newline + 1)
      if (line.trim() === '') continue
      try {
        records.push(JSON.parse(line))
      } catch {
        rejected += 1
      }
    }

    return { records, rejected }
  }

  /** Anything still waiting for its newline, for a caller that wants to report a cut-off stream. */
  pending(): string {
    return this.#pending
  }
}

/** One record, ready for the pipe: the newline is part of the frame, so it goes out with it. */
export function frame(record: unknown): string {
  return `${JSON.stringify(record)}\n`
}
