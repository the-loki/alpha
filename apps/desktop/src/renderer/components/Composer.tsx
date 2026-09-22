import type { Attachment, Undef } from '@alpha/core'
import { useNavigate } from '@solidjs/router'
import { batch, createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { runningModel } from '../stores/providers.ts'
import { composerFolderOf, shell, useText } from '../stores/shell.ts'
import { AttachButton, AttachmentNote, PendingAttachments, type Refusal } from './Attachments.tsx'
import { AMBER_ACTION, OUTLINED_ACTION } from './controls.ts'
import { ArrowUpIcon } from './icons.tsx'
import { LevelChip } from './LevelChip.tsx'
import { COLUMN } from './ledger.ts'
import { ModelChip } from './ModelChip.tsx'
import { QueueStrip } from './QueueStrip.tsx'

/**
 * While a turn is running the send control splits in three, because stopping, steering and
 * queueing do different things and the choice is made at the moment of pressing.
 */
function RunningActions(props: {
  canRedirect: boolean
  onStop: () => void
  onRedirect: (how: 'steer' | 'queue') => void
}) {
  const t = useText()
  return (
    <div class="flex items-center gap-2">
      <button type="button" onClick={() => props.onStop()} class={AMBER_ACTION}>
        {t('composer.stop')}
      </button>
      <button
        type="button"
        onClick={() => props.onRedirect('queue')}
        disabled={!props.canRedirect}
        class={OUTLINED_ACTION}
      >
        {t('composer.queue')}
      </button>
      <button
        type="button"
        onClick={() => props.onRedirect('steer')}
        disabled={!props.canRedirect}
        class={OUTLINED_ACTION}
      >
        {t('composer.steer')}
      </button>
    </div>
  )
}

/**
 * The bar's own surface: the page lifted one step and framed, on the same card radius as every
 * other block that holds something. It is opaque and takes no light of its own — what makes the
 * foot of the page readable is the page colour under it, which the rows fade into as they pass —
 * and it answers the two things that are about it: the keyboard inside it, and the turn running
 * through it.
 */
const CARD = (streaming: boolean) =>
  `rounded-card border bg-ink-800 p-3 transition-colors focus-within:border-accent/50 ${
    streaming ? 'border-accent/30 shadow-glow' : 'border-line'
  }`

/**
 * The foot of the box: what the message carries and what it is allowed to do at its left, what it
 * will run on and the control that sends it at its right. The row is aligned to the bottom of the
 * words rather than to their top, so the two controls that stand on the baseline of a growing
 * message stay where the hand left them, and neither cluster may push the other out of the card:
 * the left one is the one that gives way, and the right one is the one that is never cut.
 */
function ComposerFoot(props: {
  running: boolean
  canSend: boolean
  canRedirect: boolean
  onSend: () => void
  onStop: () => void
  onRedirect: (how: 'steer' | 'queue') => void
  onPicked: (picked: Attachment[], refused: Undef<Refusal>) => void
}) {
  const t = useText()
  return (
    <div class="flex items-end gap-3">
      <div class="flex min-w-0 flex-1 items-center gap-1">
        <AttachButton onPicked={props.onPicked} />
        <LevelChip />
      </div>
      <div class="ml-auto flex shrink-0 items-center justify-end gap-1.5">
        <ModelChip />
        <Show
          when={props.running}
          fallback={
            <button
              type="button"
              onClick={() => props.onSend()}
              disabled={!props.canSend}
              aria-label={t('composer.send')}
              // The accent means "this does something". A disabled send wears the quiet surface
              // instead, so the ember in the corner always means a message can go.
              class="grid h-7 w-7 shrink-0 place-items-center rounded-control bg-gradient-to-b from-accent to-accent-bright text-accent-ink shadow-glow transition-all hover:brightness-110 disabled:bg-none disabled:bg-ink-600 disabled:text-parchment-faint disabled:shadow-none"
            >
              <ArrowUpIcon />
            </button>
          }
        >
          <RunningActions canRedirect={props.canRedirect} onStop={props.onStop} onRedirect={props.onRedirect} />
        </Show>
      </div>
    </div>
  )
}

/**
 * While a turn is running, Escape stops it: the composer is where the hands already are. A menu
 * that is open keeps its own Escape, which is the one thing this has to stay out of the way of.
 */
function useEscapeToStop(stop: () => Promise<void>, running: () => boolean): void {
  createEffect(() => {
    if (!running()) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const element = document.activeElement
      if (element instanceof HTMLElement && element.closest('[role="menu"]') !== null) return
      event.preventDefault()
      void stop()
    }
    document.addEventListener('keydown', onKeyDown)
    // The listener belongs to the run it stops, so it goes when the run does.
    onCleanup(() => document.removeEventListener('keydown', onKeyDown))
  })
}

/**
 * The keyboard on the line being typed: Enter sends it, Shift+Enter is a new line, and
 * Cmd/Ctrl+Enter queues it behind the turn that is already running — the one the user does not
 * want to interrupt. Named rather than inlined because it is the whole interaction, and the
 * component around it is about layout.
 */
function composerKeys(
  event: KeyboardEvent & { currentTarget: HTMLTextAreaElement },
  acts: { running: boolean; send: () => void; queue: () => void },
): void {
  if (event.key !== 'Enter') return
  if (event.metaKey || event.ctrlKey) {
    if (!acts.running) return
    event.preventDefault()
    acts.queue()
    return
  }
  if (event.shiftKey) return
  event.preventDefault()
  acts.send()
}

/**
 * The composer sends. What it may do is its foot's business — the controls it carries, and a send
 * control that is disabled while nothing can leave — and it says nothing about itself: what the
 * keyboard does is learned once, and a line under the box repeating it is a line every reader pays
 * for. The one line that can appear there is a refusal no control could have made.
 */
export function Composer(props: { streaming?: boolean }) {
  const [value, setValue] = createSignal('')
  const [attached, setAttached] = createSignal<Attachment[]>([])
  const [refused, setRefused] = createSignal<Undef<Refusal>>(undefined)
  const model = runningModel()
  const composerFolder = () => composerFolderOf(shell)
  const t = useText()
  const navigate = useNavigate()
  let field: Undef<HTMLTextAreaElement>

  // Answering a card hands the keyboard back: the next thing typed is the next message.
  createEffect(() => {
    if (conversations.composerFocus > 0) field?.focus()
  })

  // A picture is held only for as long as the model that would run on it can take one. Switching
  // to a model that cannot — or opening a conversation that runs on one — drops what is attached
  // and says why, rather than failing at the boundary with the picture already in the message
  // (ADR-0018). With no provider list to read, the main process has the last word.
  createEffect(() => {
    if (model.takesPictures() || attached().length === 0) return
    setAttached([])
    setRefused('model')
  })

  const hasWorkspace = () => composerFolder() !== undefined
  const running = () => conversations.transcript.status === 'running'
  const words = () => value().trim() !== ''
  // A picture is a message on its own: "look at this" is often the whole thing being said.
  const writable = () => hasWorkspace() && shell.model.kind !== 'none' && (words() || attached().length > 0)
  const canSend = () => writable() && !running()
  // Steering and queueing carry words: a picture waits in the composer for a turn of its own.
  const canRedirect = () => writable() && running() && words()

  useEscapeToStop(conversationActions.stop, running)

  const send = async () => {
    const folder = composerFolder()
    if (!canSend() || folder === undefined) return
    const message = value()
    const picked = attached()
    setValue('')
    setAttached([])
    setRefused(undefined)
    const id = await conversationActions.sendOrCreate(folder.path, message, picked)
    navigate(`/c/${id}`)
  }

  const removeAt = (index: number) => setAttached((current) => current.filter((_unused, at) => at !== index))

  const redirect = async (how: 'steer' | 'queue') => {
    if (!canRedirect()) return
    const message = value()
    setValue('')
    await (how === 'steer' ? conversationActions.steer(message) : conversationActions.queueMessage(message))
  }

  return (
    // The bar the next message is written in: the last thing in the conversation's own scroll and
    // stuck to its foot, so the transcript slides under it while it scrolls and it comes to rest
    // after the last row rather than sitting in a strip of its own (ADR-0024). It stands on the
    // page's column, the same edges every answer stands on.
    //
    // The shell takes no pointer at all: the air beside the bar is still the page, so a wheel over
    // it scrolls the transcript the way the reader expects. The page-coloured foot under the bar is
    // what the rows fade into as they pass behind it.
    <div class={`pointer-events-none sticky bottom-0 z-20 mt-auto w-full ${COLUMN}`} data-column="conversation">
      <div class="pointer-events-auto bg-gradient-to-t from-ink-700 via-ink-700/85 to-transparent pt-10 pb-4">
        <QueueStrip />
        <div class={CARD(props.streaming === true)}>
          <PendingAttachments items={attached()} onRemove={(index) => removeAt(index)} />
          <textarea
            ref={(element) => {
              field = element
            }}
            rows={1}
            aria-label={t('composer.messageLabel')}
            value={value()}
            placeholder={hasWorkspace() ? t('composer.placeholder') : t('composer.placeholderNoFolder')}
            onInput={(event) => setValue(event.target.value)}
            onKeyDown={(event) =>
              composerKeys(event, {
                running: running(),
                send: () => void send(),
                queue: () => void redirect('queue'),
              })
            }
            class="field-sizing-content block max-h-40 min-h-10 w-full resize-none overflow-y-auto bg-transparent text-body text-parchment placeholder:text-parchment-faint"
          />
          <ComposerFoot
            running={running()}
            canSend={canSend()}
            canRedirect={canRedirect()}
            onSend={() => void send()}
            onStop={() => void conversationActions.stop()}
            onRedirect={(how) => void redirect(how)}
            onPicked={(picked, anyRefused) => {
              // Together: the effect that drops what the model cannot take must see both writes.
              batch(() => {
                setAttached((current) => [...current, ...picked])
                setRefused(anyRefused)
              })
            }}
          />
          <AttachmentNote refused={refused()} model={model.name()} />
        </div>
      </div>
    </div>
  )
}
