import type { Accessor } from 'solid-js'
import { BESIDE_SCROLLS } from '../../lib/ledger.ts'
import { useText } from '../../stores/shell.ts'

export type ConversationView = 'conversation' | 'changes'

export function ConversationTabs(props: {
  view: Accessor<ConversationView>
  onViewChange: (view: ConversationView) => void
}) {
  const t = useText()
  const moveTab = (event: KeyboardEvent & { currentTarget: HTMLDivElement }) => {
    const key = event.key
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return
    event.preventDefault()
    const next =
      key === 'Home'
        ? 'conversation'
        : key === 'End'
          ? 'changes'
          : props.view() === 'conversation'
            ? 'changes'
            : 'conversation'
    props.onViewChange(next)
    event.currentTarget
      .querySelector<HTMLButtonElement>(`#${next === 'changes' ? 'workspace-changes-tab' : 'conversation-view-tab'}`)
      ?.focus()
  }

  return (
    <div
      class={`${BESIDE_SCROLLS} flex shrink-0 gap-5 border-b border-line`}
      role="tablist"
      aria-label={t('changes.views')}
      onKeyDown={moveTab}
    >
      <button
        id="conversation-view-tab"
        type="button"
        role="tab"
        tabIndex={props.view() === 'conversation' ? 0 : -1}
        aria-selected={props.view() === 'conversation'}
        aria-controls="conversation-view"
        onClick={() => props.onViewChange('conversation')}
        class={`h-9 border-b-2 font-mono text-label transition-colors ${props.view() === 'conversation' ? 'border-accent text-foreground hover:text-accent-hover' : 'border-transparent text-muted hover:text-foreground'}`}
      >
        {t('changes.conversation')}
      </button>
      <button
        id="workspace-changes-tab"
        type="button"
        role="tab"
        tabIndex={props.view() === 'changes' ? 0 : -1}
        aria-selected={props.view() === 'changes'}
        aria-controls="workspace-changes-view"
        onClick={() => props.onViewChange('changes')}
        class={`h-9 border-b-2 font-mono text-label transition-colors ${props.view() === 'changes' ? 'border-accent text-foreground hover:text-accent-hover' : 'border-transparent text-muted hover:text-foreground'}`}
      >
        {t('changes.tab')}
      </button>
    </div>
  )
}
