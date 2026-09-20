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
import { createEffect, createSignal, type JSX, Show } from 'solid-js'
import { languageOf, shell, useText } from '../stores/shell.ts'
import { GROUP_LABEL } from './controls.ts'
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
export function ToolRow(props: { block: ChatBlockTool; first?: boolean }) {
  const t = useText()
  const language = () => languageOf(shell.language)
  const [open, setOpen] = createSignal(props.block.status === 'failed')
  // A call that fails while the transcript is open opens itself, so the reason is on the screen
  // without anyone knowing to click; one that arrives already failed does the same at mount.
  createEffect(() => {
    if (props.block.status === 'failed') setOpen(true)
  })
  // An automatic approval shows no chip: the header's own chip already says which level is on.
  const approval = () => props.block.approval
  const mark = (): Undef<TextKey> => {
    const record = approval()
    return record === undefined ? undefined : MARK[record.kind]
  }
  const markTone = (): string => {
    const record = approval()
    return record === undefined ? '' : MARK_TONE[record.kind]
  }

  return (
    // The columns are fixed rather than fitted, so a stack of rows is a table: what ran, on what,
    // how it went, how long. That is what makes it a ledger instead of a list of sentences.
    <article class={props.first === true ? '' : 'border-t border-line'} data-role="tool" data-tool={props.block.name}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open()}
        class="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-ink-600"
      >
        <span
          class={`w-3 shrink-0 text-center font-mono text-micro ${TONE[props.block.status]}`}
          title={t(riskKey(props.block.risk))}
        >
          {GLYPH[props.block.risk]}
        </span>
        <span class="w-24 shrink-0 truncate font-mono text-code text-parchment">{props.block.name}</span>
        <span class="min-w-0 flex-1 truncate font-mono text-code text-parchment-dim">{props.block.summary}</span>
        <Show when={mark()}>
          {(key) => (
            <span class={`shrink-0 rounded-full border px-2 font-mono text-micro tracking-wide ${markTone()}`}>
              {t(key())}
            </span>
          )}
        </Show>
        <span class={`w-14 shrink-0 text-right font-mono text-micro ${TONE[props.block.status]}`}>
          {t(STATUS_WORD[props.block.status])}
        </span>
        <span class="w-12 shrink-0 text-right font-mono text-micro text-parchment-faint">
          {formatDuration(props.block.startedAt, props.block.endedAt)}
        </span>
      </button>

      <Show when={open()}>
        {/* Recessed: the audit of a row belongs to the row, and the surface says so without a box
            drawn around the whole thing. It is a record and it is laid out as one — a label column
            and a value column — so the panel is scanned rather than read line by line. */}
        <div class="mb-2 rounded-card border border-line bg-ink-900/50 px-3 py-2.5">
          <Show when={approval()}>
            {(record) => (
              <AuditRow label={t('tool.gate')}>
                {approvalNote(language(), record())}
                {record().reason === undefined ? '' : ` Reason: ${record().reason}`}
              </AuditRow>
            )}
          </Show>
          <AuditRow label={t('tool.arguments')}>
            <pre class="overflow-x-auto font-mono text-code text-parchment-dim">{props.block.raw}</pre>
          </AuditRow>
          <Show when={props.block.details?.diff}>
            {(diff) => (
              <AuditRow label={t('tool.diff')}>
                <DiffView diff={diff()} />
              </AuditRow>
            )}
          </Show>
          <Show when={props.block.output !== ''}>
            <AuditRow
              label={
                props.block.details?.exitCode === undefined
                  ? t('tool.output')
                  : `${t('tool.output')} · exit ${props.block.details.exitCode}`
              }
              // The button belongs to the value it copies: two rows on screen can each have an
              // output, and "copy" alone would not say which one it takes.
              action={
                <CopyButton
                  what="message.copyOutput"
                  params={{ tool: props.block.name }}
                  text={props.block.output}
                  label="message.copyOutputLabel"
                />
              }
            >
              <pre class="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-code text-parchment-dim">
                {props.block.output}
              </pre>
            </AuditRow>
          </Show>
          <Show when={props.block.details?.fullOutputPath}>
            {(path) => (
              <p class="mt-1 font-mono text-micro text-parchment-faint">{t('tool.truncated', { path: path() })}</p>
            )}
          </Show>
        </div>
      </Show>
    </article>
  )
}

/**
 * One line of the audit: what this part of the record is, in the label column, and the thing
 * itself beside it. The label column is fixed, so three rows of a panel are read as a table.
 */
function AuditRow(props: { label: string; action?: JSX.Element; children: JSX.Element }) {
  return (
    <div class="mt-1.5 flex gap-3 first:mt-0">
      <span class={`w-16 shrink-0 pt-0.5 ${GROUP_LABEL}`}>{props.label}</span>
      <div class="min-w-0 flex-1">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1 font-mono text-micro leading-relaxed text-parchment-faint">{props.children}</div>
          <Show when={props.action !== undefined}>
            <span class="shrink-0">{props.action}</span>
          </Show>
        </div>
      </div>
    </div>
  )
}
