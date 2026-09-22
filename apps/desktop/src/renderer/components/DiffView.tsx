import { For } from 'solid-js'

/**
 * A diff as the tool reported it. Parsing is line-level on purpose: the point is to make added
 * and removed lines distinguishable, not to reimplement a diff algorithm over text that already
 * came out of one. The wash under each line is the verdict's own ink (C5.2).
 */
const LINE_CLASS = (line: string): string => {
  if (line.startsWith('@@')) return 'text-info'
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-faint'
  // What the file now says, and what it no longer does: a wash of the verdict under the words,
  // in the mark's own radius so one line never squares off against its neighbour (C5.4).
  if (line.startsWith('+')) return 'rounded-sm bg-success/10 text-success'
  if (line.startsWith('-')) return 'rounded-sm bg-danger/10 text-danger'
  return 'text-muted'
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
      <p class="mb-1 font-mono text-label text-faint">
        <span class="text-success">+{added()}</span> <span class="text-danger">−{removed()}</span>
      </p>
      <pre class="overflow-x-auto rounded-md border border-line bg-surface-1 py-2 font-mono text-code">
        <For each={keyedLines(lines())}>
          {(entry) => (
            <span class={`block px-3 ${LINE_CLASS(entry.line)}`}>{entry.line === '' ? ' ' : entry.line}</span>
          )}
        </For>
      </pre>
    </div>
  )
}
