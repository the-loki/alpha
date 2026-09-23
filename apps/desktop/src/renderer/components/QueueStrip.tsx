import type { Undef } from '@alpha/domain'
import { createSignal, For, Show } from 'solid-js'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { DESTRUCTIVE_ACTION, GROUP_LABEL, NOTICE, TEXT_ACTION } from './controls.ts'

/**
 * What is waiting, in the order it will be sent: the steers the runtime is holding for this turn,
 * then the messages the workbench is holding for the next one. A steered message can only be
 * cancelled — it is already in the turn — while a queued one can be edited where it stands, which
 * is the whole reason the workbench owns that queue (ADR-0011). When the queue has stopped, the
 * strip says so and offers the one way to start it again.
 */
export function QueueStrip() {
  const t = useText()
  const [editing, setEditing] = createSignal<Undef<{ entryId: string; text: string }>>(undefined)

  const save = async () => {
    const draft = editing()
    setEditing(undefined)
    if (draft === undefined || draft.text.trim() === '') return
    await conversationActions.editQueued(draft.entryId, draft.text)
  }

  return (
    <Show when={conversations.transcript.queued.length > 0 || conversations.transcript.queuedPaused}>
      {/* What waits scrolls on its own, because a queue may not grow the composer past the page:
          the words, and the controls that send them, live under it. The paused notice stays outside
          the strip — Resume is one of those controls. */}
      <div class="mb-1.5">
        <ul aria-label={t('composer.queuedList')} class="max-h-[15vh] space-y-1 overflow-y-auto">
          <For each={conversations.transcript.queued}>
            {(item) => (
              <li class="flex items-center gap-2 rounded-md border border-line bg-surface-1 px-2.5 py-1">
                <span class={`shrink-0 ${GROUP_LABEL}`}>
                  {t(item.kind === 'steer' ? 'composer.steered' : 'composer.queued')}
                </span>
                <Show
                  when={editing()?.entryId === item.entryId}
                  fallback={<span class="min-w-0 flex-1 truncate font-text text-name text-muted">{item.text}</span>}
                >
                  <input
                    // Autofocus is the point: editing is deliberate, and the field is the whole act.
                    autofocus
                    value={editing()?.text ?? ''}
                    aria-label={t('composer.editQueued', { text: item.text })}
                    onInput={(event) => setEditing({ entryId: item.entryId, text: event.currentTarget.value })}
                    onBlur={() => void save()}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditing(undefined)
                      if (event.key === 'Enter') void save()
                    }}
                    class="min-w-0 flex-1 rounded-md border border-line bg-surface-0 px-1.5 py-0.5 font-text text-name text-foreground focus:border-line-strong"
                  />
                </Show>
                <Show when={item.kind === 'queued' && editing()?.entryId !== item.entryId}>
                  <button
                    type="button"
                    aria-label={t('composer.editQueued', { text: item.text })}
                    onClick={() => setEditing({ entryId: item.entryId, text: item.text })}
                    class={`shrink-0 ${TEXT_ACTION}`}
                  >
                    {t('composer.edit')}
                  </button>
                </Show>
                <button
                  type="button"
                  aria-label={
                    item.kind === 'queued'
                      ? t('composer.deleteQueued', { text: item.text })
                      : t('composer.cancelQueued', { text: item.text })
                  }
                  onClick={() => void conversationActions.cancelQueued(item.entryId)}
                  class={`shrink-0 ${DESTRUCTIVE_ACTION}`}
                >
                  {t(item.kind === 'queued' ? 'composer.delete' : 'composer.cancel')}
                </button>
              </li>
            )}
          </For>
        </ul>
        <Show when={conversations.transcript.queuedPaused}>
          <div class={`mt-1 flex items-center gap-2 ${NOTICE} border-warning`}>
            <span class="min-w-0 flex-1 font-text text-name text-warning" title={t('composer.queueStoppedWhy')}>
              {t('composer.queueStopped')}
            </span>
            <button
              type="button"
              onClick={() => void conversationActions.resumeQueue()}
              class={`shrink-0 ${TEXT_ACTION}`}
            >
              {t('composer.resume')}
            </button>
          </div>
        </Show>
      </div>
    </Show>
  )
}
