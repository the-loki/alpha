import { formatCost, formatTokens, type McpSamplingAnswer, type McpSamplingRequest, type Undef } from '@alpha/domain'
import { createSignal, For, Show } from 'solid-js'
import { conversationActions } from '../../stores/conversations.ts'
import { useText } from '../../stores/shell.ts'
import { FIELD_FRAME, GHOST_DANGER, PRIMARY_ACTION } from '../controls.ts'

const TEXTAREA = `w-full resize-y rounded-md px-3 py-2 font-text text-body text-foreground ${FIELD_FRAME}`

function SamplingConsent(props: {
  request: McpSamplingRequest
  busy: boolean
  onGenerate: (messages: string[], systemPrompt: Undef<string>) => void
  onDecline: () => void
  onCancel: () => void
}) {
  const t = useText()
  let form!: HTMLFormElement
  const submit = () => {
    const data = new FormData(form)
    const messages = props.request.prompt.messages.map((_, index) => String(data.get(`message-${index}`) ?? ''))
    const system = String(data.get('systemPrompt') ?? '')
    props.onGenerate(messages, system === '' && props.request.prompt.systemPrompt === undefined ? undefined : system)
  }
  return (
    <form
      ref={form}
      aria-label={t('mcp.samplingTitle')}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div class="space-y-3 px-4 py-3">
        <p class="font-mono text-label text-muted">
          {t('mcp.samplingModel', { provider: props.request.model.providerId, model: props.request.model.name })}
          {' · '}
          {t('mcp.samplingLimit', { tokens: String(props.request.prompt.maxTokens) })}
        </p>
        <Show when={props.request.prompt.requestedContext}>
          <p class="font-text text-label text-warning">{t('mcp.samplingContext')}</p>
        </Show>
        <Show when={props.request.prompt.hints.length > 0}>
          <p class="break-words font-text text-label text-faint">
            {t('mcp.samplingHints', { hints: props.request.prompt.hints.join(', ') })}
          </p>
        </Show>
        <label class="block font-mono text-label text-muted" for={`mcp-system-${props.request.requestId}`}>
          {t('mcp.samplingSystem')}
        </label>
        <textarea
          id={`mcp-system-${props.request.requestId}`}
          name="systemPrompt"
          rows={2}
          maxLength={4_000}
          disabled={props.busy}
          class={TEXTAREA}
        >
          {props.request.prompt.systemPrompt ?? ''}
        </textarea>
        <For each={props.request.prompt.messages}>
          {(message, index) => (
            <div>
              <label
                class="mb-1 block font-mono text-label text-muted"
                for={`mcp-message-${props.request.requestId}-${index()}`}
              >
                {t(message.role === 'user' ? 'mcp.samplingUser' : 'mcp.samplingAssistant')}
              </label>
              <textarea
                id={`mcp-message-${props.request.requestId}-${index()}`}
                name={`message-${index()}`}
                rows={3}
                maxLength={10_000}
                required
                disabled={props.busy}
                class={TEXTAREA}
              >
                {message.text}
              </textarea>
            </div>
          )}
        </For>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onCancel}
          class="px-3 font-mono text-label text-muted hover:text-foreground disabled:opacity-60"
        >
          {t('mcp.cancel')}
        </button>
        <button type="button" disabled={props.busy} onClick={props.onDecline} class={GHOST_DANGER}>
          {t('mcp.decline')}
        </button>
        <button type="submit" disabled={props.busy} class={PRIMARY_ACTION}>
          {t('mcp.samplingGenerate')}
        </button>
      </div>
    </form>
  )
}

function SamplingReview(props: {
  request: McpSamplingRequest
  busy: boolean
  onShare: () => void
  onDecline: () => void
  onCancel: () => void
}) {
  const t = useText()
  const generated = () => props.request.generated
  return (
    <section aria-label={t('mcp.samplingReview')}>
      <div class="space-y-3 px-4 py-3">
        <p class="font-mono text-label text-muted">{t('mcp.samplingReview')}</p>
        <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words font-text text-body text-foreground">
          {generated()?.text}
        </pre>
        <Show when={generated()?.usage}>
          {(usage) => (
            <p class="font-mono text-label text-faint">
              {t('mcp.samplingUsage', { tokens: formatTokens(usage().totalTokens) })}
              <Show when={formatCost(usage().cost)}>
                {' '}
                {' · '}
                {formatCost(usage().cost)}
              </Show>
            </p>
          )}
        </Show>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onCancel}
          class="px-3 font-mono text-label text-muted hover:text-foreground disabled:opacity-60"
        >
          {t('mcp.cancel')}
        </button>
        <button type="button" disabled={props.busy} onClick={props.onDecline} class={GHOST_DANGER}>
          {t('mcp.samplingDiscard')}
        </button>
        <button type="button" disabled={props.busy} onClick={props.onShare} class={PRIMARY_ACTION}>
          {t('mcp.samplingShare')}
        </button>
      </div>
    </section>
  )
}

/** Consent before spending, then review before any generated text reaches the server. */
export function SamplingCard(props: { request: McpSamplingRequest }) {
  const t = useText()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const answer = async (decision: McpSamplingAnswer) => {
    if (busy() && decision.action !== 'cancel') return
    setBusy(true)
    setError('')
    try {
      await conversationActions.answerMcpSampling({ requestId: props.request.requestId, ...decision })
      if (decision.action === 'generate') setBusy(false)
    } catch {
      setBusy(false)
      setError(t('mcp.samplingFailed'))
    }
  }
  return (
    <fieldset
      aria-label={t('mcp.samplingTitle')}
      class="slip-in min-w-0 rounded-lg border border-line-subtle bg-surface-2 shadow-medium"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        void answer({ action: 'cancel' })
      }}
    >
      <header class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-subtle px-4 py-3">
        <span class="font-mono text-label font-medium text-warning">{t('mcp.samplingTitle')}</span>
        <span class="min-w-0 break-all font-mono text-label text-muted">
          {t('mcp.from', { server: props.request.server, tool: props.request.toolName })}
        </span>
      </header>
      <Show when={props.request.stage === 'consent'}>
        <SamplingConsent
          request={props.request}
          busy={busy()}
          onGenerate={(messages, systemPrompt) => void answer({ action: 'generate', messages, systemPrompt })}
          onDecline={() => void answer({ action: 'decline' })}
          onCancel={() => void answer({ action: 'cancel' })}
        />
      </Show>
      <Show when={props.request.stage === 'generating'}>
        <div class="flex items-center justify-between gap-3 px-4 py-4">
          <p role="status" class="font-text text-body text-muted">
            {t('mcp.samplingGenerating')}
          </p>
          <button type="button" onClick={() => void answer({ action: 'cancel' })} class={GHOST_DANGER}>
            {t('mcp.cancel')}
          </button>
        </div>
      </Show>
      <Show when={props.request.stage === 'review'}>
        <SamplingReview
          request={props.request}
          busy={busy()}
          onShare={() => void answer({ action: 'share' })}
          onDecline={() => void answer({ action: 'decline' })}
          onCancel={() => void answer({ action: 'cancel' })}
        />
      </Show>
      <Show when={error()}>
        <p role="alert" class="px-4 pb-3 font-text text-label text-danger">
          {error()}
        </p>
      </Show>
    </fieldset>
  )
}
