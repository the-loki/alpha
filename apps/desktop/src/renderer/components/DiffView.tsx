import { For } from 'solid-js'

/**
 * A diff as the tool reported it. Parsing is line-level on purpose: the point is to make added
 * and removed lines distinguishable, not to reimplement a diff algorithm over text that already
 * came out of one.
 */
const LINE_CLASS = (line: string): string => {
  if (line.startsWith('@@')) return 'text-info'
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-parchment-faint'
  // What the file now says, and what it no longer does: a wash of the verdict under the words.
  if (line.startsWith('+')) return 'bg-jade/10 text-jade'
  if (line.startsWith('-')) return 'bg-danger/10 text-danger'
  return 'text-parchment-dim'
}

/** Keys a diff's lines by content and occurrence: the same line text repeats in real diffs. */
const keyedLines = (lines: string[]): { key: string; line: string }[] => {
  const seen = new Map<string, number>()
  return lines.map((line) => {
    const count = seen.get(line) ?? 0
    seen.set(line, count + 1)
    return { key: `${count}:${line}`, line }
  })
}

export function DiffView(props: { diff: string }) {
  const lines = () => props.diff.split('\n')
  const added = () => lines().filter((line) => line.startsWith('+') && !line.startsWith('+++')).length
  const removed = () => lines().filter((line) => line.startsWith('-') && !line.startsWith('---')).length

  return (
    <div class="mt-1.5">
      <p class="mb-1 font-mono text-micro text-parchment-faint">
        <span class="text-jade">+{added()}</span> <span class="text-danger">−{removed()}</span>
      </p>
      <pre class="overflow-x-auto rounded-control border border-line bg-ink-900 py-2 font-mono text-code">
        <For each={keyedLines(lines())}>
          {(entry) => (
            <span class={`block px-3 ${LINE_CLASS(entry.line)}`}>{entry.line === '' ? ' ' : entry.line}</span>
          )}
        </For>
      </pre>
    </div>
  )
}
