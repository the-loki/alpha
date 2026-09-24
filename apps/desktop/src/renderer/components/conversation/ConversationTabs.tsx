import { type Accessor, For } from 'solid-js'
import { BESIDE_SCROLLS } from '../../lib/ledger.ts'
import { useText } from '../../stores/shell.ts'

export type ConversationView = 'conversation' | 'changes' | 'mcp'

const TABS = [
  { view: 'conversation', id: 'conversation-view-tab', panel: 'conversation-view', label: 'changes.conversation' },
  { view: 'changes', id: 'workspace-changes-tab', panel: 'workspace-changes-view', label: 'changes.tab' },
  { view: 'mcp', id: 'mcp-requests-tab', panel: 'mcp-requests-view', label: 'mcp.tab' },
] as const

export function ConversationTabs(props: {
  view: Accessor<ConversationView>
  onViewChange: (view: ConversationView) => void
  hasMcp: boolean
}) {
  const t = useText()
  const tabs = () => (props.hasMcp ? TABS : TABS.slice(0, 2))
  const moveTab = (event: KeyboardEvent & { currentTarget: HTMLDivElement }) => {
    const key = event.key
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return
    event.preventDefault()
    const available = tabs()
    const current = Math.max(
      0,
      available.findIndex((tab) => tab.view === props.view()),
    )
    const index =
      key === 'Home'
        ? 0
        : key === 'End'
          ? available.length - 1
          : (current + (key === 'ArrowRight' ? 1 : -1) + available.length) % available.length
    const next = available[index]
    if (next === undefined) return
    props.onViewChange(next.view)
    event.currentTarget.querySelector<HTMLButtonElement>(`#${next.id}`)?.focus()
  }

  return (
    <div
      class={`${BESIDE_SCROLLS} flex shrink-0 gap-5 border-b border-line`}
      role="tablist"
      aria-label={t('changes.views')}
      onKeyDown={moveTab}
    >
      <For each={tabs()}>
        {(tab) => (
          <button
            id={tab.id}
            type="button"
            role="tab"
            tabIndex={props.view() === tab.view ? 0 : -1}
            aria-selected={props.view() === tab.view}
            aria-controls={tab.panel}
            onClick={() => props.onViewChange(tab.view)}
            class={`h-9 border-b-2 font-mono text-label transition-colors ${props.view() === tab.view ? 'border-accent text-foreground hover:text-accent-hover' : 'border-transparent text-muted hover:text-foreground'}`}
          >
            {t(tab.label)}
          </button>
        )}
      </For>
    </div>
  )
}
