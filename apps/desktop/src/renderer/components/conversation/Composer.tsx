import type { Attachment, Undef } from '@alpha/domain'
import { useNavigate } from '@solidjs/router'
import { batch, createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { conversationActions, conversations } from '../../stores/conversations.ts'
import { runningModel } from '../../stores/next-message.ts'
import { composerFolderOf, shell, useText } from '../../stores/shell.ts'
import { OUTLINED_ACTION, WARNING_ACTION } from '../controls.ts'
import { ArrowUpIcon } from '../icons.tsx'
import { AttachButton, AttachmentNote, PendingAttachments, type TurnedAway } from './Attachments.tsx'
import { FolderLine } from './FolderLine.tsx'
import { LevelChip } from './LevelChip.tsx'
import { ModelChip } from './ModelChip.tsx'
import { QueueStrip } from './QueueStrip.tsx'
import { ThinkingChip } from './ThinkingChip.tsx'

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
      <button type="button" onClick={() => props.onStop()} class={WARNING_ACTION}>
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
 * The foot of the box: what the message carries and what it is allowed to do at its left, what it
 * will run on, how hard it will think, and the control that sends it at its right. The row is
 * aligned to the bottom of the words rather than to their top, so the controls stay where the hand
 * left them as the message grows; the left cluster is the one that gives way, and the right one is
 * never cut.
 */
function ComposerFoot(props: {
  running: boolean
  canSend: boolean
  canRedirect: boolean
  onSend: () => void
  onStop: () => void
  onRedirect: (how: 'steer' | 'queue') => void
  onPicked: (picked: Attachment[], refused: Undef<TurnedAway>) => void
}) {
  const t = useText()
  return (
    // Two groups, and the row gives way rather than the page: `flex-wrap` because the workbench
    // reaches a browser, and a browser window can be narrower than the five controls in this row are
    // (`minWidth` stops a desktop window at 1024; ADR-0009 does not stop a phone, and a phone shows
    // the composer at 375 — narrower than the five together, so there it wraps into two lines, the
    // left group then the right). Neither group may shrink under its own contents: a group that can
    // shrink to nothing does not wrap, it squeezes — and the controls inside it, which cannot shrink,
    // are then drawn over the group beside them. What may shrink is a chip that has a ceiling of its
    // own: the model chip's name ellipsises inside `max-w-40` rather than pushing the row past the
    // page. The level chip's name is not a candidate, because C5.7 pairs it with the colour and a
    // name that ellipsised would leave the colour carrying it alone.
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex flex-1 items-center gap-1">
        <AttachButton onPicked={props.onPicked} />
        <LevelChip />
      </div>
      {/* `ml-auto` keeps the controls at the row's right end, on their own line when there is one. */}
      <div class="ml-auto flex items-center justify-end gap-1.5">
        <ModelChip />
        <ThinkingChip />
        <Show
          when={props.running}
          fallback={
            <button
              type="button"
              onClick={() => props.onSend()}
              disabled={!props.canSend}
              aria-label={t('composer.send')}
              // Solid accent: the same ink that streams the answer is the ink that sends it. A
              // disabled send goes back to the well, so a red control always means a message can
              // go. One height with the chips beside it (C5.4).
              class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-strong text-accent-ink transition-colors duration-normal hover:bg-accent-deep disabled:bg-surface-1 disabled:text-faint"
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
 * that is open keeps its own Escape, and so does a decision the gate is waiting on — that card's
 * Escape never decides, so it must not quietly cancel the turn underneath it either (C5.7).
 * Solid delegates keydown to document, so the card's own stopPropagation cannot keep this
 * listener out; the pending decision is what keeps it out.
 */
function useEscapeToStop(stop: () => Promise<void>, running: () => boolean, decisionPending: () => boolean): void {
  createEffect(() => {
    if (!running()) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (decisionPending()) return
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
 * The writing field itself: the caret is its focus answer, so it wears no ring — the ring would
 * frame a second box inside the card that already frames it (C5.7). The one exception to the
 * ring, named where the checker can see it.
 */
const COMPOSER_FIELD = `field-sizing-content block max-h-40 min-h-12 w-full resize-none overflow-y-auto bg-transparent px-1 font-text text-body text-foreground placeholder:text-faint focus:outline-none` // constraints-ignore 05-design — the caret is this field's focus answer (C5.7's one exception)

const [starter, setStarter] = createSignal('')

/** A starter's words travel to the box: the one composer on the page picks them up and focuses. */
export function seedComposer(text: string): void {
  setStarter(text)
}

/**
 * The keyboard's two arrivals at the box: answering a card hands it back, and a starter's words
 * fill the field and focus it. Both own a focus call, which is why they live side by side.
 */
function useComposerIntents(field: () => Undef<HTMLTextAreaElement>, setValue: (text: string) => void): void {
  createEffect(() => {
    if (conversations.composerFocus > 0) field()?.focus()
  })
  createEffect(() => {
    const text = starter()
    if (text === '') return
    setStarter('')
    setValue(text)
    field()?.focus()
  })
}

/**
 * The composer sends. It is the writing card docked at the foot of the page (C5.4): a rounded
 * card on the page's own edges, its top edge the one rule in the window that lights while a turn
 * is being written (C5.5). It explains nothing about itself — what the keyboard does is learned
 * once — and the one line that can appear under the foot is a refusal no control could have made.
 */
export function Composer(props: { streaming?: boolean; folder?: boolean }) {
  const [value, setValue] = createSignal('')
  const [attached, setAttached] = createSignal<Attachment[]>([])
  const [refused, setRefused] = createSignal<Undef<TurnedAway>>(undefined)
  const model = runningModel()
  const composerFolder = () => composerFolderOf(shell)
  const t = useText()
  const navigate = useNavigate()
  let field: Undef<HTMLTextAreaElement>

  useComposerIntents(() => field, setValue)

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
  const writable = () => hasWorkspace() && model.chosen() !== undefined && (words() || attached().length > 0)
  const canSend = () => writable() && !running()
  // Steering and queueing carry words: a picture waits in the composer for a turn of its own.
  const canRedirect = () => writable() && running() && words()

  useEscapeToStop(
    conversationActions.stop,
    running,
    () =>
      conversations.transcript.approvals.length > 0 ||
      conversations.transcript.mcpPending.length > 0 ||
      conversations.transcript.mcpSamplingPending.length > 0,
  )

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
    // The writing card on the page's own edge: its top edge is the rule that lights while a turn
    // is being written — the accent is what "happening now" means (C5.2).
    <div class="w-full" data-column="composer">
      <QueueStrip />
      <div
        class={`rounded-lg border-x border-b border-line bg-surface-1 border-t-2 ${props.streaming === true ? 'border-t-accent' : 'border-t-line'}`}
      >
        <div class="px-3 pt-2 pb-2">
          {/* Which work this conversation is being started in, and the control that changes it: the
              welcome page is where that choice is being made (C5.4). Only a new conversation shows
              it — an open one was started in a folder and stays there. */}
          <Show when={props.folder === true}>
            <FolderLine />
          </Show>
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
            class={COMPOSER_FIELD}
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
