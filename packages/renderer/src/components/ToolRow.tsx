import {
  type ApprovalRecord,
  type ChatBlockTool,
  formatDuration,
  type Language,
  levelKey,
  riskKey,
  type TextKey,
  text,
  type Undef,
} from '@alpha/core'
import { useState } from 'react'
import { languageOf, useShell, useText } from '../stores/shell.ts'
import { DiffView } from './DiffView.tsx'
import { CopyButton } from './MessageView.tsx'

const GLYPH: Record<ChatBlockTool['risk'], string> = { read: '◇', write: '◆', execute: '▶' }

/**
 * How the call got past the gate, in two words or fewer. An automatic approval shows nothing on the
 * line — the header chip already says which level is in force — but every kind is named in the
 * expanded panel, because "why did this run?" is a question the ledger has to answer later.
 */
const MARK: Record<ApprovalRecord['kind'], Undef<TextKey>> = {
  auto: undefined,
  rule: 'tool.markRule',
  once: 'tool.markOnce',
  always: 'tool.markAlways',
  denied: 'tool.markDenied',
  blocked: 'tool.markBlocked',
}

/** What the panel says happened to this call, one sentence per kind. */
const APPROVAL_NOTE: Record<ApprovalRecord['kind'], TextKey> = {
  auto: 'gate.auto',
  rule: 'gate.allowedByRule',
  once: 'gate.once',
  always: 'gate.always',
  denied: 'gate.denied',
  blocked: 'gate.blocked',
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
function approvalNote(language: Language, approval: ApprovalRecord): string {
  const level = text(language, levelKey(approval.level))
  return text(language, APPROVAL_NOTE[approval.kind], { level })
}
const TONE: Record<ChatBlockTool['status'], string> = { running: 'text-amber', ok: 'text-jade', failed: 'text-danger' }
const STATUS_WORD: Record<ChatBlockTool['status'], TextKey> = {
  running: 'tool.running',
  ok: 'tool.done',
  failed: 'tool.failed',
}

/**
 * One line per tool call: what ran, on what, for how long. Expanding shows the arguments the
 * model sent and the output the tool produced, because a ledger you cannot audit is decoration.
 *
 * A row is a ruled line rather than a card: the ledger reads as a log, the answer beside it stays
 * the loudest thing in the transcript, and a run of calls stacks as one ruled block (C5.5). The
 * row directly under an entry's own rule is the one that does not draw a rule of its own — two of
 * them a few pixels apart read as a mistake rather than as two things.
 */
export function ToolRow({ block, first = false }: { block: ChatBlockTool; first?: boolean }) {
  const t = useText()
  const language = useShell((state) => languageOf(state.language))
  const [open, setOpen] = useState(block.status === 'failed')
  // An automatic approval shows no chip: the header's own chip already says which level is on.
  const approval = block.approval
  const mark = approval === undefined ? undefined : MARK[approval.kind]
  const markTone = approval === undefined ? '' : MARK_TONE[approval.kind]

  return (
    // The columns are fixed rather than fitted, so a stack of rows is a table: what ran, on what,
    // how it went, how long. That is what makes it a ledger instead of a list of sentences.
    <article className={first ? '' : 'border-t border-line'} data-role="tool" data-tool={block.name}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-2 text-left transition-colors hover:bg-ink-800"
      >
        <span
          className={`w-3 shrink-0 text-center font-mono text-micro ${TONE[block.status]}`}
          title={t(riskKey(block.risk))}
        >
          {GLYPH[block.risk]}
        </span>
        <span className="w-24 shrink-0 truncate font-mono text-code text-parchment">{block.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-code text-parchment-dim">{block.summary}</span>
        {mark !== undefined && (
          <span className={`shrink-0 border px-1.5 font-mono text-micro tracking-wide ${markTone}`}>{t(mark)}</span>
        )}
        <span className={`w-14 shrink-0 text-right font-mono text-micro ${TONE[block.status]}`}>
          {t(STATUS_WORD[block.status])}
        </span>
        <span className="w-12 shrink-0 text-right font-mono text-micro text-parchment-faint">
          {formatDuration(block.startedAt, block.endedAt)}
        </span>
      </button>

      {open && (
        // Recessed: the audit of a row belongs to the row, and the surface says so without a box
        // drawn around the whole thing.
        <div className="mb-2 rounded-control border border-line bg-ink-900/60 px-3 py-2">
          {block.approval !== undefined && (
            <p className="mb-1 font-mono text-micro text-parchment-faint">
              {approvalNote(language, block.approval)}
              {block.approval.reason === undefined ? '' : ` Reason: ${block.approval.reason}`}
            </p>
          )}
          <p className="font-mono text-micro uppercase tracking-wider text-parchment-faint">{t('tool.arguments')}</p>
          <pre className="mt-1 overflow-x-auto font-mono text-code text-parchment-dim">{block.raw}</pre>
          {block.details?.diff !== undefined && <DiffView diff={block.details.diff} />}
          {block.output !== '' && (
            <>
              {/* The button sits on the heading it belongs to: two rows on screen can each have
                  an output, and "copy" alone would not say which one it takes. */}
              <div className="mt-2 flex items-center justify-between">
                <p className="font-mono text-micro uppercase tracking-wider text-parchment-faint">
                  {t('tool.output')}
                  {block.details?.exitCode === undefined ? '' : ` · exit ${block.details.exitCode}`}
                </p>
                <CopyButton
                  what="message.copyOutput"
                  params={{ tool: block.name }}
                  text={block.output}
                  label="message.copyOutputLabel"
                />
              </div>
              <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-code text-parchment-dim">
                {block.output}
              </pre>
            </>
          )}
          {block.details?.fullOutputPath !== undefined && (
            <p className="mt-1 font-mono text-micro text-parchment-faint">
              {t('tool.truncated', { path: block.details.fullOutputPath })}
            </p>
          )}
        </div>
      )}
    </article>
  )
}
