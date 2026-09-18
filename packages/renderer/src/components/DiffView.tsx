/**
 * A diff as the tool reported it. Parsing is line-level on purpose: the point is to make added
 * and removed lines distinguishable, not to reimplement a diff algorithm over text that already
 * came out of one.
 */
const LINE_CLASS = (line: string): string => {
  if (line.startsWith('@@')) return 'text-info'
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-parchment-faint'
  if (line.startsWith('+')) return 'text-jade'
  if (line.startsWith('-')) return 'text-danger'
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

export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n')
  const added = lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length
  const removed = lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length

  return (
    <div className="mt-1.5">
      <p className="mb-1 font-mono text-[11px] text-parchment-faint">
        <span className="text-jade">+{added}</span> <span className="text-danger">−{removed}</span>
      </p>
      <pre className="overflow-x-auto rounded-control border border-line bg-ink-800 p-2 font-mono text-[12px] leading-[1.5]">
        {keyedLines(lines).map(({ key, line }) => (
          <span key={key} className={`block ${LINE_CLASS(line)}`}>
            {line === '' ? ' ' : line}
          </span>
        ))}
      </pre>
    </div>
  )
}
