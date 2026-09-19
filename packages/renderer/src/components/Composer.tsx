import { type Language, type ModelStatus, modelText, type Null, text } from '@alpha/core'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { composerFolderOf, languageOf, useShell, useText } from '../stores/shell.ts'
import { DESTRUCTIVE_ACTION, OUTLINED_ACTION } from './controls.ts'
import { ArrowUpIcon } from './icons.tsx'

/** The messages behind the running turn, each with the way to take it back. */
function QueueStrip() {
  const queued = useConversations((state) => state.transcript.queued)
  const cancelQueued = useConversations((state) => state.cancelQueued)
  const t = useText()
  if (queued.length === 0) return null

  return (
    <ul aria-label={t('composer.queuedList')} className="mb-1.5 space-y-1">
      {queued.map((item) => (
        <li
          key={item.entryId}
          className="flex items-center gap-2 rounded-control border border-line bg-ink-800/70 px-2.5 py-1"
        >
          <span className="shrink-0 font-mono text-micro uppercase tracking-wider text-parchment-faint">
            {t('composer.queued')}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-parchment-dim">{item.text}</span>
          <button
            type="button"
            aria-label={t('composer.cancelQueued', { text: item.text })}
            onClick={() => void cancelQueued(item.entryId)}
            className={`shrink-0 ${DESTRUCTIVE_ACTION}`}
          >
            {t('composer.cancel')}
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * While a turn is running the send control splits in three, because stopping, steering and
 * queueing do different things and the choice is made at the moment of pressing.
 */
function RunningActions({
  canRedirect,
  onStop,
  onRedirect,
}: {
  canRedirect: boolean
  onStop: () => void
  onRedirect: (how: 'steer' | 'queue') => void
}) {
  const t = useText()
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onStop}
        className="rounded-control border border-amber/50 px-3 py-1 text-xs text-amber transition-colors hover:bg-amber/10"
      >
        {t('composer.stop')}
      </button>
      <button type="button" onClick={() => onRedirect('queue')} disabled={!canRedirect} className={OUTLINED_ACTION}>
        {t('composer.queue')}
      </button>
      <button type="button" onClick={() => onRedirect('steer')} disabled={!canRedirect} className={OUTLINED_ACTION}>
        {t('composer.steer')}
      </button>
    </div>
  )
}

/**
 * What the composer says under itself. It is the only line of explanation, so it says only what
 * the box itself cannot: with no folder the placeholder has already said that, and repeating it
 * here would be the same sentence twice.
 */
export function composerNote(language: Language, state: ComposerNote): string {
  if (!state.hasFolder) return ''
  // The model's own line comes first: with nothing to talk to, what the keyboard does is not the
  // thing the reader needs to know.
  const aboutModel = modelText(language, state.model)
  if (aboutModel !== '') return aboutModel
  if (state.running) {
    return text(language, state.typed ? 'composer.noteSteer' : 'composer.noteWorking')
  }
  return text(language, 'composer.noteIdle')
}

/** Everything the composer's one line of explanation depends on. */
export interface ComposerNote {
  hasFolder: boolean
  model: ModelStatus
  running: boolean
  typed: boolean
}

/**
 * The composer sends; everything about whether it *may* send is stated in the note under it
 * rather than left to a disabled button with no explanation.
 */
export function Composer() {
  const [value, setValue] = useState('')
  const composerFolder = useShell(composerFolderOf)
  const language = useShell((state) => languageOf(state.language))
  const t = useText()
  const model = useShell((state) => state.model)
  const status = useConversations((state) => state.transcript.status)
  const sendOrCreate = useConversations((state) => state.sendOrCreate)
  const steer = useConversations((state) => state.steer)
  const queueMessage = useConversations((state) => state.queueMessage)
  const stop = useConversations((state) => state.stop)
  const focusSignal = useConversations((state) => state.composerFocus)
  const navigate = useNavigate()
  const field = useRef<Null<HTMLTextAreaElement>>(null)

  // Answering a card hands the keyboard back: the next thing typed is the next message.
  useEffect(() => {
    if (focusSignal > 0) field.current?.focus()
  }, [focusSignal])

  const hasWorkspace = composerFolder !== undefined
  const running = status === 'running'
  const note = composerNote(language, {
    hasFolder: hasWorkspace,
    model,
    running,
    typed: value.trim() !== '',
  })
  const writable = hasWorkspace && model.kind !== 'none' && value.trim() !== ''
  const canSend = writable && !running
  const canRedirect = writable && running

  // While a turn is running, Escape stops it: the composer is where the hands already are.
  useEffect(() => {
    if (!running) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const element = document.activeElement
      if (element instanceof HTMLElement && element.closest('[role="menu"]') !== null) return
      event.preventDefault()
      void stop()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [running, stop])

  const send = async () => {
    if (!canSend || composerFolder === undefined) return
    const message = value
    setValue('')
    const id = await sendOrCreate(composerFolder.path, message)
    void navigate({ to: '/c/$conversationId', params: { conversationId: id } })
  }

  const redirect = async (how: 'steer' | 'queue') => {
    if (!canRedirect) return
    const message = value
    setValue('')
    await (how === 'steer' ? steer(message) : queueMessage(message))
  }

  return (
    <div className="shrink-0 px-8 pt-2 pb-5">
      <div>
        <QueueStrip />
        <div className="flex items-end gap-3 rounded-card border border-line bg-ink-800 px-3.5 py-2.5 transition-colors focus-within:border-line-strong">
          <textarea
            ref={field}
            rows={2}
            aria-label={t('composer.messageLabel')}
            value={value}
            placeholder={hasWorkspace ? t('composer.placeholder') : t('composer.placeholderNoFolder')}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
              // Cmd/Ctrl+Enter queues, which is the one the user does not want to interrupt with.
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && running) {
                event.preventDefault()
                void redirect('queue')
              }
            }}
            className="block min-w-0 flex-1 resize-none bg-transparent text-body text-parchment placeholder:text-parchment-faint focus:outline-none"
          />
          {/* Beside the words rather than under them: the control the message goes through belongs
              on the same line as the message, and the box stays as tall as what is typed. */}
          {running ? (
            <RunningActions
              canRedirect={canRedirect}
              onStop={() => void stop()}
              onRedirect={(how) => void redirect(how)}
            />
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              aria-label={t('composer.send')}
              // The accent means "this does something". A disabled send wears the quiet surface
              // instead, so the ember in the corner always means a message can go.
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition-colors hover:bg-accent-bright disabled:bg-ink-600 disabled:text-parchment-faint"
            >
              <ArrowUpIcon />
            </button>
          )}
        </div>
        {note !== '' && <p className="mt-1.5 px-1 text-micro text-parchment-faint">{note}</p>}
      </div>
    </div>
  )
}
