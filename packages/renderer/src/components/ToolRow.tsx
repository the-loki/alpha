import { type ApprovalRecord, type ChatBlockTool, formatDuration, levelLabel, riskLabel } from '@alpha/core'
import { useState } from 'react'
import { DiffView } from './DiffView.tsx'
import { CopyButton } from './MessageView.tsx'

const GLYPH: Record<ChatBlockTool['risk'], string> = { read: '◇', write: '◆', execute: '▶' }

/**
 * How the call got past the gate, in two words or fewer. An automatic approval shows nothing on the
 * line — the header chip already says which level is in force — but every kind is named in the
 * expanded panel, because "why did this run?" is a question the ledger has to answer later.
 */
const MARK: Record<ApprovalRecord['kind'], string> = {
  auto: '',
  rule: 'rule',
  once: 'allowed once',
  always: 'always allowed',
  denied: 'denied',
  blocked: 'blocked',
}

const MARK_TONE: Record<ApprovalRecord['kind'], string> = {
  auto: '',
  rule: 'text-jade border-jade/30',
  once: 'text-jade border-jade/30',
  always: 'text-jade border-jade/30',
  denied: 'text-danger border-danger/40',
  blocked: 'text-danger border-danger/40',
}

/** The full sentence, for the panel: the level at the time, then what decided it. */
function approvalNote(approval: ApprovalRecord): string {
  const level = levelLabel(approval.level)
  if (approval.kind === 'auto') return `Allowed automatically by the ${level} level.`
  if (approval.kind === 'rule') return `Allowed by a remembered rule, at the ${level} level.`
  if (approval.kind === 'once') return `Allowed once by you, at the ${level} level.`
  if (approval.kind === 'always') return `Allowed by a new rule, at the ${level} level.`
  if (approval.kind === 'denied') return `Denied by you, at the ${level} level.`
  return `Blocked by the ${level} level.`
}
const TONE: Record<ChatBlockTool['status'], string> = { running: 'text-amber', ok: 'text-jade', failed: 'text-danger' }
const STATUS_WORD: Record<ChatBlockTool['status'], string> = { running: 'running', ok: 'done', failed: 'failed' }

/**
 * One line per tool call: what ran, on what, for how long. Expanding shows the arguments the
 * model sent and the output the tool produced, because a ledger you cannot audit is decoration.
 */
export function ToolRow({ block }: { block: ChatBlockTool }) {
  const [open, setOpen] = useState(block.status === 'failed')

  return (
    <article className="rounded-card border border-line bg-ink-800/70" data-role="tool" data-tool={block.name}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
      >
        <span className={`font-mono text-micro ${TONE[block.status]}`} title={riskLabel(block.risk)}>
          {GLYPH[block.risk]}
        </span>
        <span className="shrink-0 font-mono text-code text-parchment">{block.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-code text-parchment-dim">{block.summary}</span>
        {block.approval !== undefined && MARK[block.approval.kind] !== '' && (
          <span
            className={`shrink-0 rounded-control border px-1.5 text-micro font-mono tracking-wide ${MARK_TONE[block.approval.kind]}`}
          >
            {MARK[block.approval.kind]}
          </span>
        )}
        <span className={`shrink-0 font-mono text-micro ${TONE[block.status]}`}>{STATUS_WORD[block.status]}</span>
        <span className="w-14 shrink-0 text-right font-mono text-micro text-parchment-faint">
          {formatDuration(block.startedAt, block.endedAt)}
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-3 py-2">
          {block.approval !== undefined && (
            <p className="mb-1 font-mono text-micro text-parchment-faint">
              {approvalNote(block.approval)}
              {block.approval.reason === undefined ? '' : ` Reason: ${block.approval.reason}`}
            </p>
          )}
          <p className="font-mono text-micro uppercase tracking-wider text-parchment-faint">Arguments</p>
          <pre className="mt-1 overflow-x-auto font-mono text-code text-parchment-dim">{block.raw}</pre>
          {block.details?.diff !== undefined && <DiffView diff={block.details.diff} />}
          {block.output !== '' && (
            <>
              {/* The button sits on the heading it belongs to: two rows on screen can each have
                  an output, and "copy" alone would not say which one it takes. */}
              <div className="mt-2 flex items-center justify-between">
                <p className="font-mono text-micro uppercase tracking-wider text-parchment-faint">
                  Output{block.details?.exitCode === undefined ? '' : ` · exit ${block.details.exitCode}`}
                </p>
                <CopyButton what={`the output of ${block.name}`} text={block.output} label="copy output" />
              </div>
              <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-code text-parchment-dim">
                {block.output}
              </pre>
            </>
          )}
          {block.details?.fullOutputPath !== undefined && (
            <p className="mt-1 font-mono text-micro text-parchment-faint">
              Truncated. Full output: {block.details.fullOutputPath}
            </p>
          )}
        </div>
      )}
    </article>
  )
}
