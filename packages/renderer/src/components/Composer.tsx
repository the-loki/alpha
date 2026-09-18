import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { useShell } from '../stores/shell.ts'

/** The messages behind the running turn, each with the way to take it back. */
function QueueStrip() {
  const queued = useConversations((state) => state.transcript.queued)
  const cancelQueued = useConversations((state) => state.cancelQueued)
  if (queued.length === 0) return null

  return (
    <ul aria-label="Queued messages" className="mb-1.5 space-y-1">
      {queued.map((item) => (
        <li
          key={item.entryId}
          className="flex items-center gap-2 rounded-control border border-line bg-ink-800/70 px-2.5 py-1"
        >
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-parchment-faint">Queued</span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-parchment-dim">{item.text}</span>
          <button
            type="button"
            aria-label={`Cancel the queued message: ${item.text}`}
            onClick={() => void cancelQueued(item.entryId)}
            className="shrink-0 font-mono text-[11px] text-parchment-faint transition-colors hover:text-danger"
          >
            Cancel
          </button>
        </li>
      ))}
    </ul>
  )
}

const PRIMARY =
  'rounded-control bg-ember px-3 py-1 text-[12px] font-medium text-ember-ink transition-colors hover:bg-ember-bright disabled:cursor-not-allowed disabled:bg-ember/25 disabled:text-ember-ink/60'

/**
 * The secondary actions are outlined, not filled: while a turn runs the accent belongs to the one
 * primary control, and a filled button that cannot be pressed reads as a button that can.
 */
const SECONDARY =
  'rounded-control border border-line px-3 py-1 text-[12px] text-parchment transition-colors hover:bg-ink-600 disabled:cursor-not-allowed disabled:opacity-40'

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
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onStop}
        className="rounded-control border border-amber/50 px-3 py-1 text-[12px] text-amber transition-colors hover:bg-amber/10"
      >
        Stop
      </button>
      <button type="button" onClick={() => onRedirect('queue')} disabled={!canRedirect} className={SECONDARY}>
        Queue
      </button>
      <button type="button" onClick={() => onRedirect('steer')} disabled={!canRedirect} className={SECONDARY}>
        Steer
      </button>
    </div>
  )
}

/**
 * The composer sends; everything about whether it *may* send is stated in the hint under it
 * rather than left to a disabled button with no explanation.
 */
export function Composer() {
  const [text, setText] = useState('')
  const workspace = useShell((state) => state.workspace)
  const model = useShell((state) => state.model)
  const status = useConversations((state) => state.transcript.status)
  const sendOrCreate = useConversations((state) => state.sendOrCreate)
  const steer = useConversations((state) => state.steer)
  const queueMessage = useConversations((state) => state.queueMessage)
  const stop = useConversations((state) => state.stop)
  const focusSignal = useConversations((state) => state.composerFocus)
  const navigate = useNavigate()
  const field = useRef<HTMLTextAreaElement>(null)

  // Answering a card hands the keyboard back: the next thing typed is the next message.
  useEffect(() => {
    if (focusSignal > 0) field.current?.focus()
  }, [focusSignal])

  const hasWorkspace = workspace.kind === 'selected'
  const running = status === 'running'
  const writable = hasWorkspace && model.configured && text.trim() !== ''
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
    if (!canSend || workspace.kind !== 'selected') return
    const message = text
    setText('')
    const id = await sendOrCreate(workspace.workspace.path, message)
    void navigate({ to: '/c/$conversationId', params: { conversationId: id } })
  }

  const redirect = async (how: 'steer' | 'queue') => {
    if (!canRedirect) return
    const message = text
    setText('')
    await (how === 'steer' ? steer(message) : queueMessage(message))
  }

  const hint = () => {
    if (!hasWorkspace) return 'A workspace is the folder the agent works in.'
    if (!model.configured) return `No model configured yet: ${model.description}`
    if (running) {
      return text.trim() === ''
        ? 'The agent is working. Escape stops it.'
        : 'Steer changes what it does next. Queue waits until this turn is done.'
    }
    return 'Enter sends, Shift+Enter starts a new line.'
  }

  return (
    <div className="shrink-0 border-t border-line bg-ink-900 px-6 pb-5 pt-4">
      <div className="mx-auto max-w-3xl">
        <QueueStrip />
        <div className="rounded-card border border-line bg-ink-700 px-3 py-2.5 focus-within:border-line-strong">
          <textarea
            ref={field}
            rows={2}
            aria-label="Message the agent"
            value={text}
            placeholder={hasWorkspace ? 'Ask the agent to change something…' : 'Open a folder first'}
            onChange={(event) => setText(event.target.value)}
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
            className="block w-full resize-none bg-transparent text-[15px] leading-relaxed text-parchment placeholder:text-parchment-faint focus:outline-none"
          />
          <div className="mt-1 flex items-center justify-between gap-4">
            <span className="text-[11px] text-parchment-faint">{hint()}</span>
            {running ? (
              <RunningActions
                canRedirect={canRedirect}
                onStop={() => void stop()}
                onRedirect={(how) => void redirect(how)}
              />
            ) : (
              <button type="button" onClick={() => void send()} disabled={!canSend} className={PRIMARY}>
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
