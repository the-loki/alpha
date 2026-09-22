import { type ApprovalRequest, levelKey, type RuleScope, riskKey } from '@alpha/core'
import { createSignal, onMount, Show } from 'solid-js'
import { conversationActions } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { CONTROL_HEIGHT, DESTRUCTIVE_BUTTON, FIELD_FRAME, PRIMARY_ACTION } from './controls.ts'
import { DiffView } from './DiffView.tsx'

/**
 * The gate, in the transcript. It says what is about to run and where, and waits: nothing happens
 * until one of the three answers is given. The keyboard is the fast path — Enter allows once,
 * Escape denies — because a card that needs a mouse is a card that gets clicked without reading.
 */
export function ApprovalCard(props: { request: ApprovalRequest }) {
  const answer = conversationActions.answerApproval
  const t = useText()
  const [reason, setReason] = createSignal('')
  const [scope, setScope] = createSignal<RuleScope>('conversation')
  let field!: HTMLInputElement
  const [busy, setBusy] = createSignal(false)

  onMount(() => field.focus())

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
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          allowOnce()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          deny()
        }
      }}
      class="relative overflow-hidden rounded-card border border-amber/40 bg-ink-700 shadow-soft"
    >
      {/* The spine: a stop of the deciding colour down the card's left edge, so a waiting card is
          told apart from a finished one before a word of it is read. */}
      <span aria-hidden="true" class="absolute inset-y-0 left-0 w-1 bg-amber/60" />
      <header class="flex items-baseline gap-2 px-4 pb-1 pt-3">
        <span class="font-mono text-micro uppercase tracking-wider text-amber">
          {t(props.request.risk === 'execute' ? 'approval.command' : 'approval.change')}
        </span>
        <span class="text-micro text-parchment-faint">· {t(levelKey(props.request.level))}</span>
      </header>

      <div class="px-4 pb-1">
        {/* The thing about to run, in its own well: recessed, mono, and honest about line breaks. */}
        <pre class="max-h-40 overflow-auto rounded-control border border-line bg-ink-900/60 px-3 py-2 font-mono text-code whitespace-pre-wrap wrap-anywhere text-parchment">
          {props.request.detail === '' ? t(riskKey(props.request.risk)) : props.request.detail}
        </pre>
        <p class="mt-1.5 break-all font-mono text-micro text-parchment-faint">
          {t('approval.inFolder', { path: props.request.cwd })}
        </p>
        <Show when={props.request.diff}>{(diff) => <DiffView diff={diff()} />}</Show>
      </div>

      {/* One row of decisions, one height: Allow once, Always allow with the scope it is
          remembered for, a reason, and Deny. The reason field is the same height as the buttons —
          a field that is taller than the decision beside it is the row reading as two rows. */}
      <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-amber/20 px-4 py-3">
        <button type="button" onClick={allowOnce} disabled={busy()} class={PRIMARY_ACTION}>
          {t('approval.allowOnce')}
        </button>

        <div class={`${CONTROL_HEIGHT} flex items-center rounded-control border border-line bg-ink-700 shadow-soft`}>
          <button
            type="button"
            onClick={allowAlways}
            disabled={busy()}
            class="h-full rounded-l-control px-3 text-xs text-parchment transition-colors hover:bg-ink-600 disabled:opacity-60"
          >
            {t('approval.alwaysAllow')}
          </button>
          <select
            aria-label={t('approval.rememberFor')}
            value={scope()}
            onInput={(event) => setScope(event.currentTarget.value as RuleScope)}
            class="h-full border-l border-line bg-transparent px-1.5 text-micro text-parchment-dim"
          >
            <option value="conversation">{t('approval.scopeConversation')}</option>
            <option value="workspace">{t('approval.scopeWorkspace')}</option>
          </select>
        </div>

        {/* A reason is a sentence, not a column: it takes a share of the row and then stops,
            and the space it leaves is what keeps Deny next to the decision it belongs to. */}
        <input
          ref={field}
          value={reason()}
          onInput={(event) => setReason(event.currentTarget.value)}
          aria-label={t('approval.reasonLabel')}
          placeholder={t('approval.reasonPlaceholder')}
          class={`min-w-40 max-w-64 flex-1 px-2.5 text-xs text-parchment placeholder:text-parchment-faint ${CONTROL_HEIGHT} ${FIELD_FRAME}`}
        />

        <button type="button" onClick={deny} disabled={busy()} class={DESTRUCTIVE_BUTTON}>
          {t('approval.deny')}
        </button>
      </div>
    </section>
  )
}
