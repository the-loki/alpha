import { type ChatBlockTool, riskLabel } from '@alpha/core'
import { useState } from 'react'
import { DiffView } from './DiffView.tsx'

const GLYPH: Record<ChatBlockTool['risk'], string> = { read: '◇', write: '◆', execute: '▶' }
const TONE: Record<ChatBlockTool['status'], string> = { running: 'text-amber', ok: 'text-jade', failed: 'text-danger' }
const STATUS_WORD: Record<ChatBlockTool['status'], string> = { running: 'running', ok: 'done', failed: 'failed' }

const duration = (block: ChatBlockTool): string => {
  if (block.endedAt === undefined) return ''
  const seconds = Math.max(0, (block.endedAt - block.startedAt) / 1000)
  return seconds < 1 ? `${Math.round(seconds * 1000)}ms` : `${seconds.toFixed(1)}s`
}

/**
 * One line per tool call: what ran, on what, for how long. Expanding shows the arguments the
 * model sent and the output the tool produced, because a ledger you cannot audit is decoration.
 */
export function ToolRow({ block }: { block: ChatBlockTool }) {
  const [open, setOpen] = useState(block.status === 'failed')

  return (
    <article className="rounded-card border border-line bg-ink-800/70">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
      >
        <span className={`font-mono text-[11px] ${TONE[block.status]}`} title={riskLabel(block.risk)}>
          {GLYPH[block.risk]}
        </span>
        <span className="shrink-0 font-mono text-[12px] text-parchment">{block.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-parchment-dim">{block.summary}</span>
        <span className={`shrink-0 font-mono text-[11px] ${TONE[block.status]}`}>{STATUS_WORD[block.status]}</span>
        <span className="w-14 shrink-0 text-right font-mono text-[11px] text-parchment-faint">{duration(block)}</span>
      </button>

      {open && (
        <div className="border-t border-line px-3 py-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-parchment-faint">Arguments</p>
          <pre className="mt-1 overflow-x-auto font-mono text-[12px] leading-[1.5] text-parchment-dim">{block.raw}</pre>
          {block.details?.diff !== undefined && <DiffView diff={block.details.diff} />}
          {block.output !== '' && (
            <>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-parchment-faint">
                Output{block.details?.exitCode === undefined ? '' : ` · exit ${block.details.exitCode}`}
              </p>
              <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-[1.55] text-parchment-dim">
                {block.output}
              </pre>
            </>
          )}
          {block.details?.fullOutputPath !== undefined && (
            <p className="mt-1 font-mono text-[11px] text-parchment-faint">
              Truncated. Full output: {block.details.fullOutputPath}
            </p>
          )}
        </div>
      )}
    </article>
  )
}
