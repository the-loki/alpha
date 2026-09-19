import { type Attachment, type Language, type ModelStatus, modelText, type Null, text } from '@alpha/core'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { composerFolderOf, languageOf, useShell, useText } from '../stores/shell.ts'
import { AttachButton, AttachmentNote, PendingAttachments } from './Attachments.tsx'
import { OUTLINED_ACTION } from './controls.ts'
import { ArrowUpIcon } from './icons.tsx'
import { LevelChip } from './LevelChip.tsx'
import { ModelChip } from './ModelChip.tsx'
import { QueueStrip } from './QueueStrip.tsx'

/**

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
 * The foot of the box: what the message carries, what it is allowed to do, and the control that
 * sends it. One row under the words, so the words keep the whole width to themselves.
 */
function ComposerFoot({
  running,
  canSend,
  canRedirect,
  onSend,
  onStop,
  onRedirect,
  onPicked,
}: {
  running: boolean
  canSend: boolean
  canRedirect: boolean
  onSend: () => void
  onStop: () => void
  onRedirect: (how: 'steer' | 'queue') => void
  onPicked: (picked: Attachment[], refused: boolean) => void
}) {
  const t = useText()
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <AttachButton onPicked={onPicked} />
      <LevelChip />
      <span className="flex-1" />
      {/* The right end of the foot, where the message is sent from: what it is about to run on. */}
      <ModelChip />
      {running ? (
        <RunningActions canRedirect={canRedirect} onStop={onStop} onRedirect={onRedirect} />
      ) : (
        <button
          type="button"
          onClick={onSend}
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
  const [attached, setAttached] = useState<Attachment[]>([])
  const [refused, setRefused] = useState(false)
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
  const words = value.trim() !== ''
  // A picture is a message on its own: "look at this" is often the whole thing being said.
  const writable = hasWorkspace && model.kind !== 'none' && (words || attached.length > 0)
  const canSend = writable && !running
  // Steering and queueing carry words: a picture waits in the composer for a turn of its own.
  const canRedirect = writable && running && words

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
    const picked = attached
    setValue('')
    setAttached([])
    setRefused(false)
    const id = await sendOrCreate(composerFolder.path, message, picked)
    void navigate({ to: '/c/$conversationId', params: { conversationId: id } })
  }

  const removeAt = (index: number) => {
    setAttached((current) => current.filter((_unused, position) => position !== index))
  }

  const redirect = async (how: 'steer' | 'queue') => {
    if (!canRedirect) return
    const message = value
    setValue('')
    await (how === 'steer' ? steer(message) : queueMessage(message))
  }

  return (
    // The floor of the transcript, and a surface of its own: the band is chrome, the box on it is
    // the content surface, which is the same step the transcript takes above it.
    <div className="shrink-0 border-t border-line bg-ink-800 px-8 pt-3 pb-5">
      <div className="mx-auto w-full max-w-3xl">
        <QueueStrip />
        <div className="rounded-card border border-line bg-ink-700 transition-colors focus-within:border-line-strong">
          <div className="px-3.5 pt-2.5">
            <PendingAttachments items={attached} onRemove={removeAt} />
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
              className="block w-full resize-none bg-transparent text-body text-parchment placeholder:text-parchment-faint focus:outline-none"
            />
          </div>
          <ComposerFoot
            running={running}
            canSend={canSend}
            canRedirect={canRedirect}
            onSend={() => void send()}
            onStop={() => void stop()}
            onRedirect={(how) => void redirect(how)}
            onPicked={(picked, anyRefused) => {
              setAttached((current) => [...current, ...picked])
              setRefused(anyRefused)
            }}
          />
        </div>
        <AttachmentNote refused={refused} />
        {note !== '' && <p className="mt-1.5 px-1 text-micro text-parchment-faint">{note}</p>}
      </div>
    </div>
  )
}
