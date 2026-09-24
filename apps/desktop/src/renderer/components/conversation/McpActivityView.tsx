import type { McpExchange, McpExchangeOutcome } from '@alpha/domain'
import type { TextKey } from '@alpha/i18n'
import { For, Show } from 'solid-js'
import { languageOf, shell, useText } from '../../stores/shell.ts'

const OUTCOME: Record<McpExchangeOutcome, TextKey> = {
  pending: 'mcp.pending',
  accepted: 'mcp.accepted',
  declined: 'mcp.declined',
  cancelled: 'mcp.cancelled',
  refused: 'mcp.refused',
  interrupted: 'mcp.interrupted',
}

function ExchangeRow(props: { exchange: McpExchange }) {
  const t = useText()
  const when = () =>
    new Intl.DateTimeFormat(languageOf(shell.language) === 'zh' ? 'zh-CN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(props.exchange.requestedAt))
  return (
    <li class="border-b border-line py-4" data-mcp-outcome={props.exchange.outcome}>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span class="font-mono text-label font-semibold text-foreground">{props.exchange.server}</span>
        <span class="font-mono text-label text-muted">
          {t(props.exchange.method === 'elicitation/create' ? 'mcp.methodElicitation' : 'mcp.methodSampling')}
        </span>
        <span class="font-mono text-label text-accent">{t(OUTCOME[props.exchange.outcome])}</span>
        <time class="ml-auto font-mono text-label text-faint">{when()}</time>
      </div>
      <p class="mt-1 break-all font-mono text-label text-faint">{props.exchange.toolName}</p>
      <p class="mt-2 whitespace-pre-wrap break-words font-text text-body text-foreground">
        {props.exchange.requestText}
      </p>
      <Show when={props.exchange.content}>
        <div class="mt-3">
          <p class="mb-1 font-mono text-label text-muted">{t('mcp.sharedContent')}</p>
          <pre class="max-h-40 overflow-auto rounded-md border border-line bg-surface-1 px-3 py-2 font-mono text-code whitespace-pre-wrap break-all text-foreground">
            {JSON.stringify(props.exchange.content, undefined, 2)}
          </pre>
        </div>
      </Show>
    </li>
  )
}

export function McpActivityView(props: { exchanges: McpExchange[] }) {
  return (
    <section role="tabpanel" id="mcp-requests-view" aria-labelledby="mcp-requests-tab" class="pb-6">
      <ul>
        <For each={props.exchanges}>{(exchange) => <ExchangeRow exchange={exchange} />}</For>
      </ul>
    </section>
  )
}
