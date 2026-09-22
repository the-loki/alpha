import { type ApprovalRequest, levelKey, type RuleScope, riskKey } from '@alpha/core'
import { createSignal, onMount, Show } from 'solid-js'
import { conversationActions } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { CONTROL_HEIGHT, FIELD_FRAME, GHOST_DANGER, PRIMARY_ACTION } from './controls.ts'
import { DiffView } from './DiffView.tsx'
import { CopyButton } from './MessageView.tsx'

/**
 * The gate in the transcript, drawn as an inline card (C5.5): a raised surface with a frame, a
 * medium shadow and an amber mark that breathes while it waits, the exact command in a copyable
 * mono well, and three decisions at one height. Nothing happens until one of the three answers is
 * given. The keyboard is the fast path — the card takes focus on Allow once when it appears and
 * Tab cycles the decisions — while Escape never decides: denial is an act, not a dismissal
 * (C5.7), so Escape only lets the focus go and Deny has to be pressed.
 */
export function ApprovalCard(props: { request: ApprovalRequest }) {
  const answer = conversationActions.answerApproval
  const t = useText()
  const [reason, setReason] = createSignal('')
  const [scope, setScope] = createSignal<RuleScope>('conversation')
  let allow!: HTMLButtonElement
  const [busy, setBusy] = createSignal(false)

  onMount(() => allow.focus())

  // The thing about to run, exactly as it was handed over.
  const command = () => (props.request.detail === '' ? t(riskKey(props.request.risk)) : props.request.detail)

  const settle = async (input: Parameters<typeof answer>[0]) => {
    if (busy()) return
    setBusy(true)
    await answer(input)
  }

  const allowOnce = () => void settle({ requestId: props.request.requestId, decision: 'once' })
  const allowAlways = () => void settle({ requestId: props.request.requestId, decision: 'always', scope: scope() })
  const deny = () => void settle({ requestId: props.request.requestId, decision: 'deny', reason: reason().trim() })

  return (
    <section
      aria-label={t('approval.region')}
      onKeyDown={(event) => {
        const target = event.target
        // A field or a select handles its own keys: Enter in the reason line decides nothing, and
        // a button already answers Enter with its own click.
        const wired = target instanceof HTMLElement && target.closest('button, input, select, textarea, a') !== null
        if (event.key === 'Escape') {
          // Escape never decides (C5.7): at most the focus leaves the card. Denial stays an act.
          event.preventDefault()
          event.stopPropagation()
          if (target instanceof HTMLElement) target.blur()
          return
        }
        if (event.key === 'Enter' && !event.shiftKey && !wired) {
          event.preventDefault()
          allowOnce()
        }
      }}
      class="slip-in relative rounded-xl border border-line-subtle bg-surface-2 shadow-medium"
    >
      <header class="flex flex-wrap items-center gap-2 px-4 pt-3 pb-1">
        {/* The amber mark while it waits: the only thing on the page that breathes in warning
            colour, so a waiting card is told apart from a settled one before a word is read. */}
        <span aria-hidden="true" class="status-live h-1.5 w-1.5 shrink-0 bg-warning" />
        <span class="font-mono text-label font-medium text-warning">{t('approval.region')}</span>
        <span class="font-mono text-label text-muted">
          {t(props.request.risk === 'execute' ? 'approval.command' : 'approval.change')}
        </span>
        <span class="font-mono text-label text-faint">· {t(levelKey(props.request.level))}</span>
        <span class="ml-auto">
          <CopyButton what="message.copy" label="message.copy" text={command()} />
        </span>
      </header>

      <div class="px-4 pb-1">
        {/* The thing about to run, in its own well: a surface-1 step down, mono, selectable, and
            honest about line breaks — with the copy control that takes it away as it came. */}
        <pre class="max-h-40 select-text overflow-auto rounded-sm border border-line bg-surface-1 px-3 py-2 font-mono text-code whitespace-pre-wrap wrap-anywhere text-foreground">
          {command()}
        </pre>
        <p class="mt-1.5 break-all font-mono text-label text-faint">
          {t('approval.inFolder', { path: props.request.cwd })}
        </p>
        <Show when={props.request.diff}>{(diff) => <DiffView diff={diff()} />}</Show>
      </div>

      {/* One row of decisions, right-aligned and one height: Allow once, Always allow with the
          scope it is remembered for, a reason, and Deny. The reason field is the same height as
          the buttons — a field that is taller than the decision beside it is the row reading as
          two rows (C5.4). */}
      <div class="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
        <button ref={allow} type="button" onClick={allowOnce} disabled={busy()} class={PRIMARY_ACTION}>
          {t('approval.allowOnce')}
        </button>

        {/* The scope select is this control's inner box, not a second height (C5.4). */}
        <div class={`${CONTROL_HEIGHT} flex items-center rounded-md border border-line`}>
          <button
            type="button"
            onClick={allowAlways}
            disabled={busy()}
            class="h-full px-3 font-mono text-label font-medium text-foreground transition-colors duration-normal hover:bg-surface-1 disabled:opacity-60"
          >
            {t('approval.alwaysAllow')}
          </button>
          <select
            aria-label={t('approval.rememberFor')}
            value={scope()}
            onInput={(event) => setScope(event.currentTarget.value as RuleScope)}
            class="h-full border-l border-line bg-transparent px-1.5 font-mono text-label font-medium text-muted"
          >
            <option value="conversation">{t('approval.scopeConversation')}</option>
            <option value="workspace">{t('approval.scopeWorkspace')}</option>
          </select>
        </div>

        {/* A reason is a sentence, not a column: it takes a share of the row and then stops,
            and the space it leaves is what keeps Deny next to the decision it belongs to. */}
        <input
          value={reason()}
          onInput={(event) => setReason(event.currentTarget.value)}
          aria-label={t('approval.reasonLabel')}
          placeholder={t('approval.reasonPlaceholder')}
          class={`min-w-40 max-w-64 flex-1 px-2.5 font-mono text-label text-foreground placeholder:text-faint ${CONTROL_HEIGHT} ${FIELD_FRAME}`}
        />

        {/* The refusal wears no frame: a row of decisions is one weight, and the word Deny in
            danger with the tint under the hand is the whole control (#151). */}
        <button type="button" onClick={deny} disabled={busy()} class={GHOST_DANGER}>
          {t('approval.deny')}
        </button>
      </div>
    </section>
  )
}
