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
import { CopyButton } from './CopyButton.tsx'
import { GROUP_LABEL } from './controls.ts'
import { DiffView } from './DiffView.tsx'

const GLYPH: Record<ChatBlockTool['risk'], string> = { read: '◇', write: '◆', execute: '▶' }

/**
 * How the call got past the gate, in two words or fewer. An automatic approval shows nothing on the
 * line — the level is already named on the chip — but every kind is named in the expanded panel,
 * because "why did this run?" is a question the ledger has to answer later.
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
  rule: 'text-success border-success/40',
  once: 'text-success border-success/40',
  always: 'text-success border-success/40',
  denied: 'text-danger border-danger/50',
  blocked: 'text-danger border-danger/50',
}

/** The full sentence, for the panel: the level at the time, then what decided it. */
function approvalNote(language: Language, approval: ApprovalRecord): string {
  const level = text(language, levelKey(approval.level))
  return text(language, APPROVAL_NOTE[approval.kind], { level })
}
const TONE: Record<ChatBlockTool['status'], string> = {
  running: 'text-accent',
  ok: 'text-success',
  failed: 'text-danger',
}
const STATUS_WORD: Record<ChatBlockTool['status'], TextKey> = {
  running: 'tool.running',
  ok: 'tool.done',
  failed: 'tool.failed',
}

/**
 * One line per tool call: what ran, on what, for how long. Expanding shows the arguments the
 * model sent and the output the tool produced, because a call you cannot audit is decoration.
 *
 * A call is one quiet sentence of measurement in the answer's own column — glyph, mono name, what
 * it touched, who let it through, how it went, how long — and only the pointer's arrow reveals
 * that it turns at all (C5.5).
 */
export function ToolRow(props: { block: ChatBlockTool }) {
  const t = useText()
  const language = () => languageOf(shell.language)
  const [open, setOpen] = createSignal(props.block.status === 'failed')
  // A call that fails while the transcript is open opens itself, so the reason is on the screen
  // without anyone knowing to click; one that arrives already failed does the same at mount.
  createEffect(() => {
    if (props.block.status === 'failed') setOpen(true)
  })
  // An automatic approval shows no mark: the level chip already says which level is on.
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
    <article class="w-full" data-role="tool" data-tool={props.block.name}>
      {/* The line dims into the column and answers the pointer with a fill: what it names is
          quiet, what it points at is not. The arrow is the affordance — hidden until the hand
          arrives, turned when the call is open. */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open()}
        class="group/tool inline-flex max-w-full cursor-pointer items-center gap-2 self-start rounded-md text-left font-mono text-code text-muted transition-colors duration-normal hover:bg-surface-1 hover:text-foreground"
      >
        <span class={`shrink-0 font-mono text-label ${TONE[props.block.status]}`} title={t(riskKey(props.block.risk))}>
          {GLYPH[props.block.risk]}
        </span>
        <span class="shrink-0">{props.block.name}</span>
        <span class="min-w-0 truncate text-faint">{props.block.summary}</span>
        <Show when={mark()}>
          {(key) => (
            <span class={`shrink-0 rounded-sm border px-2 font-mono text-label tracking-wide ${markTone()}`}>
              {t(key())}
            </span>
          )}
        </Show>
        <span class={`shrink-0 font-mono text-label ${TONE[props.block.status]}`}>
          {t(STATUS_WORD[props.block.status])}
        </span>
        <span class="shrink-0 font-mono text-label text-faint">
          {formatDuration(props.block.startedAt, props.block.endedAt)}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          class={`h-3.5 w-3.5 shrink-0 transition-all duration-normal ${
            open()
              ? 'rotate-90 opacity-100'
              : 'rotate-0 opacity-0 group-focus-visible/tool:opacity-100 group-hover/tool:opacity-100'
          }`}
        >
          <path d="M6 4l4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <Show when={open()}>
        {/* The audit hangs straight under the line it belongs to, unboxed: it is part of the same
            sentence, separated by space rather than a rule. It is laid out as a record — a label
            column and a value column — so it is scanned rather than read. */}
        <div class="pt-2">
          <Show when={approval()}>
            {(record) => (
              <AuditRow label={t('tool.gate')}>
                {approvalNote(language(), record())}
                {record().reason === undefined ? '' : ` Reason: ${record().reason}`}
              </AuditRow>
            )}
          </Show>
          <AuditRow label={t('tool.arguments')}>
            <pre class="overflow-x-auto rounded-sm bg-surface-1 px-2 py-1 font-mono text-code text-muted">
              {props.block.raw}
            </pre>
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
              label={t('tool.output')}
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
              <pre class="max-h-80 overflow-auto rounded-sm bg-surface-1 px-2 py-1 whitespace-pre-wrap font-mono text-code text-muted">
                {props.block.output}
              </pre>
              <Show when={props.block.details?.exitCode !== undefined}>
                <p class="mt-1 font-mono text-label text-faint">exit {props.block.details?.exitCode}</p>
              </Show>
            </AuditRow>
          </Show>
          <Show when={props.block.details?.fullOutputPath}>
            {(path) => (
              <p class="mt-1 break-all font-mono text-label text-faint">{t('tool.truncated', { path: path() })}</p>
            )}
          </Show>
        </div>
      </Show>
    </article>
  )
}

/**
 * One line of the audit: what this part of the record is, in the label column, and the thing
 * itself beside it. The label column is fixed, so three rows of a record are read as a table.
 */
function AuditRow(props: { label: string; action?: JSX.Element; children: JSX.Element }) {
  return (
    <div class="mt-1.5 flex gap-3 first:mt-0">
      {/* Wide enough for "OUTPUT · exit 12" on one line: a label that wraps is a row that reads as two. */}
      <span class={`w-20 shrink-0 pt-0.5 ${GROUP_LABEL}`}>{props.label}</span>
      <div class="min-w-0 flex-1">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1 wrap-anywhere font-mono text-label leading-relaxed text-faint">
            {props.children}
          </div>
          <Show when={props.action !== undefined}>
            <span class="shrink-0">{props.action}</span>
          </Show>
        </div>
      </div>
    </div>
  )
}
