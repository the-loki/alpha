import type { Undef } from '@alpha/core'
import { useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { DESTRUCTIVE_ACTION, TEXT_ACTION } from './controls.ts'

/**
 * What is waiting, in the order it will be sent: the steers the runtime is holding for this turn,
 * then the messages the workbench is holding for the next one. A steered message can only be
 * cancelled — it is already in the turn — while a queued one can be edited where it stands, which
 * is the whole reason the workbench owns that queue (ADR-0011). When the queue has stopped, the
 * strip says so and offers the one way to start it again.
 */
export function QueueStrip() {
  const queued = useConversations((state) => state.transcript.queued)
  const paused = useConversations((state) => state.transcript.queuedPaused)
  const editQueued = useConversations((state) => state.editQueued)
  const cancelQueued = useConversations((state) => state.cancelQueued)
  const resumeQueue = useConversations((state) => state.resumeQueue)
  const [editing, setEditing] = useState<Undef<{ entryId: string; text: string }>>(undefined)
  const t = useText()
  if (queued.length === 0 && !paused) return null

  const save = async () => {
    const draft = editing
    setEditing(undefined)
    if (draft === undefined || draft.text.trim() === '') return
    await editQueued(draft.entryId, draft.text)
  }

  return (
    <div className="mb-1.5">
      <ul aria-label={t('composer.queuedList')} className="space-y-1">
        {queued.map((item) => (
          <li
            key={item.entryId}
            className="flex items-center gap-2 rounded-control border border-line bg-ink-800/70 px-2.5 py-1"
          >
            <span className="shrink-0 font-mono text-micro tracking-wider text-parchment-faint uppercase">
              {t(item.kind === 'steer' ? 'composer.steered' : 'composer.queued')}
            </span>
            {editing?.entryId === item.entryId ? (
              <input
                // biome-ignore lint/a11y/noAutofocus: editing is deliberate, and the field is the whole act.
                autoFocus
                value={editing.text}
                aria-label={t('composer.editQueued', { text: item.text })}
                onChange={(event) => setEditing({ entryId: item.entryId, text: event.target.value })}
                onBlur={() => void save()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setEditing(undefined)
                  if (event.key === 'Enter') void save()
                }}
                className="min-w-0 flex-1 rounded-control border border-line-strong bg-ink-900 px-1.5 py-0.5 text-code text-parchment focus:outline-none"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate text-xs text-parchment-dim">{item.text}</span>
            )}
            {item.kind === 'queued' && editing?.entryId !== item.entryId && (
              <button
                type="button"
                aria-label={t('composer.editQueued', { text: item.text })}
                onClick={() => setEditing({ entryId: item.entryId, text: item.text })}
                className={`shrink-0 ${TEXT_ACTION}`}
              >
                {t('composer.edit')}
              </button>
            )}
            <button
              type="button"
              aria-label={
                item.kind === 'queued'
                  ? t('composer.deleteQueued', { text: item.text })
                  : t('composer.cancelQueued', { text: item.text })
              }
              onClick={() => void cancelQueued(item.entryId)}
              className={`shrink-0 ${DESTRUCTIVE_ACTION}`}
            >
              {t(item.kind === 'queued' ? 'composer.delete' : 'composer.cancel')}
            </button>
          </li>
        ))}
      </ul>
      {paused && (
        <div className="mt-1 flex items-center gap-2 rounded-control border border-amber/40 bg-amber/5 px-2.5 py-1">
          <span className="min-w-0 flex-1 text-xs text-amber" title={t('composer.queueStoppedWhy')}>
            {t('composer.queueStopped')}
          </span>
          <button type="button" onClick={() => void resumeQueue()} className={`shrink-0 ${TEXT_ACTION}`}>
            {t('composer.resume')}
          </button>
        </div>
      )}
    </div>
  )
}
