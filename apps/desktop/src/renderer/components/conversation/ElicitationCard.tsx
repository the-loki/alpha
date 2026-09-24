import type { McpElicitationContent, McpElicitationField, McpElicitationRequest } from '@alpha/domain'
import { createSignal, For, onMount, Show } from 'solid-js'
import { conversationActions } from '../../stores/conversations.ts'
import { useText } from '../../stores/shell.ts'
import { CONTROL_HEIGHT, FIELD_FRAME, GHOST_DANGER, PRIMARY_ACTION } from '../controls.ts'

function inputType(field: McpElicitationField): string {
  if (field.type === 'integer' || field.type === 'number') return 'number'
  if (field.format === 'email') return 'email'
  if (field.format === 'uri') return 'url'
  if (field.format === 'date') return 'date'
  if (field.format === 'date-time') return 'datetime-local'
  return 'text'
}

function FormField(props: { field: McpElicitationField; busy: boolean }) {
  const field = props.field
  const t = useText()
  const label = () => field.title || field.name
  const frame = `${CONTROL_HEIGHT} w-full rounded-md px-2.5 font-text text-body text-foreground ${FIELD_FRAME}`
  return (
    <div class="min-w-0">
      <label class="mb-1 block font-mono text-label text-muted" for={`mcp-field-${field.name}`}>
        {label()}
        <Show when={field.required && field.type !== 'boolean'}>
          <span class="ml-1 text-danger" aria-hidden="true">
            *
          </span>
          <span class="sr-only">{t('mcp.required')}</span>
        </Show>
      </label>
      <Show
        when={field.type === 'boolean'}
        fallback={
          <Show
            when={field.enum !== undefined}
            fallback={
              <input
                id={`mcp-field-${field.name}`}
                name={field.name}
                type={inputType(field)}
                required={field.required}
                minLength={field.minLength}
                maxLength={field.maxLength}
                min={field.minimum}
                max={field.maximum}
                step={field.type === 'integer' ? '1' : 'any'}
                disabled={props.busy}
                class={frame}
              />
            }
          >
            <select
              id={`mcp-field-${field.name}`}
              name={field.name}
              required={field.required}
              disabled={props.busy}
              class={frame}
            >
              <Show when={!field.required}>
                <option value="">{t('mcp.noSelection')}</option>
              </Show>
              <For each={field.enum}>
                {(value, index) => <option value={value}>{field.enumNames?.[index()] ?? value}</option>}
              </For>
            </select>
          </Show>
        }
      >
        <input
          id={`mcp-field-${field.name}`}
          name={field.name}
          type="checkbox"
          checked={field.default === true}
          disabled={props.busy}
          class="h-4 w-4 accent-accent"
        />
      </Show>
      <Show when={field.description}>
        <p class="mt-1 font-text text-label text-faint">{field.description}</p>
      </Show>
    </div>
  )
}

function formContent(form: HTMLFormElement, fields: McpElicitationField[]): McpElicitationContent {
  const data = new FormData(form)
  const content: McpElicitationContent = Object.create(null) as McpElicitationContent
  for (const field of fields) {
    if (field.type === 'boolean') {
      content[field.name] = data.has(field.name)
      continue
    }
    const raw = data.get(field.name)
    if (typeof raw !== 'string' || (raw === '' && !field.required)) continue
    if (field.type === 'number' || field.type === 'integer') content[field.name] = Number(raw)
    else if (field.format === 'date-time' && !Number.isNaN(Date.parse(raw))) {
      content[field.name] = new Date(raw).toISOString()
    } else content[field.name] = raw
  }
  return content
}

/** The server's question, separate from the tool permission gate and answered only once. */
export function ElicitationCard(props: { request: McpElicitationRequest }) {
  const t = useText()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  let form!: HTMLFormElement

  onMount(() => form.querySelector<HTMLElement>('input, select, button')?.focus())

  const answer = async (action: 'accept' | 'decline' | 'cancel') => {
    if (busy()) return
    const content = action === 'accept' ? formContent(form, props.request.form.fields) : undefined
    setBusy(true)
    setError('')
    try {
      const requestId = props.request.requestId
      if (action === 'accept') {
        await conversationActions.answerMcpElicitation({
          requestId,
          action,
          content: content ?? {},
        })
      } else await conversationActions.answerMcpElicitation({ requestId, action })
    } catch {
      setBusy(false)
      setError(t('mcp.invalidAnswer'))
    }
  }

  return (
    <form
      ref={form}
      aria-label={t('mcp.formTitle')}
      class="slip-in rounded-lg border border-line-subtle bg-surface-2 shadow-medium"
      onSubmit={(event) => {
        event.preventDefault()
        void answer('accept')
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        void answer('cancel')
      }}
    >
      <header class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-subtle px-4 py-3">
        <span class="font-mono text-label font-medium text-warning">{t('mcp.formTitle')}</span>
        <span class="min-w-0 break-all font-mono text-label text-muted">
          {t('mcp.from', { server: props.request.server, tool: props.request.toolName })}
        </span>
      </header>
      <div class="space-y-3 px-4 py-3">
        <p class="whitespace-pre-wrap break-words font-text text-body text-foreground">{props.request.form.message}</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <For each={props.request.form.fields}>{(field) => <FormField field={field} busy={busy()} />}</For>
        </div>
        <Show when={error()}>
          <p role="alert" class="font-text text-label text-danger">
            {error()}
          </p>
        </Show>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
        <button
          type="button"
          disabled={busy()}
          onClick={() => void answer('cancel')}
          class="px-3 font-mono text-label text-muted hover:text-foreground disabled:opacity-60"
        >
          {t('mcp.cancel')}
        </button>
        <button type="button" disabled={busy()} onClick={() => void answer('decline')} class={GHOST_DANGER}>
          {t('mcp.decline')}
        </button>
        <button type="submit" disabled={busy()} class={PRIMARY_ACTION}>
          {t('mcp.send')}
        </button>
      </div>
    </form>
  )
}
