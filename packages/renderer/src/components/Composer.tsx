import { type Attachment, type Language, type ModelStatus, modelText, text, type Undef } from '@alpha/core'
import { useNavigate } from '@solidjs/router'
import { batch, createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { runningModel } from '../stores/providers.ts'
import { composerFolderOf, languageOf, shell, useText } from '../stores/shell.ts'
import { AttachButton, AttachmentNote, PendingAttachments, type Refusal } from './Attachments.tsx'
import { OUTLINED_ACTION } from './controls.ts'
import { ArrowUpIcon } from './icons.tsx'
import { LevelChip } from './LevelChip.tsx'
import { PAGE } from './ledger.ts'
import { ModelChip } from './ModelChip.tsx'
import { QueueStrip } from './QueueStrip.tsx'

/** The prompt mark: the one mark on the page that is not an entry's number (C5.5). */
function PromptMark() {
  return (
    <span class="pt-0.5 font-mono text-body text-accent select-none" aria-hidden="true">
      ❯
    </span>
  )
}

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
      <button
        type="button"
        onClick={() => props.onStop()}
        class="rounded-control border border-amber/50 px-3 py-1 text-xs text-amber transition-colors hover:bg-amber/10"
      >
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
 * The foot of the box: what the message carries, what it is allowed to do, and the control that
 * sends it. One row under the words, so the words keep the whole width to themselves.
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
    <div class="mt-1 flex items-center gap-2">
      <AttachButton onPicked={props.onPicked} />
      <LevelChip />
      <span class="flex-1" />
      {/* The right end of the foot, where the message is sent from: what it is about to run on. */}
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
            class="grid h-7 w-7 shrink-0 place-items-center bg-accent text-accent-ink transition-colors hover:bg-accent-bright disabled:bg-ink-600 disabled:text-parchment-faint"
          >
            <ArrowUpIcon />
          </button>
        }
      >
        <RunningActions canRedirect={props.canRedirect} onStop={props.onStop} onRedirect={props.onRedirect} />
      </Show>
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

/** The bar's own surface: glass at rest, and carrying a little of its own light while the agent works. */
const BAR = (streaming: boolean) =>
  `rounded-card border bg-ink-800/80 px-4 pt-3 pb-2.5 shadow-soft backdrop-blur-xl transition-all focus-within:border-line-strong ${
    streaming ? 'border-accent/30 shadow-glow' : 'border-line'
  }`

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
 * What the composer says under itself. It is the only line of explanation, so it says only what
 * the box itself cannot: with no folder the placeholder has already said that, and repeating it
 * here would be the same sentence twice.
 */
function composerNote(language: Language, state: ComposerNote): string {
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
interface ComposerNote {
  hasFolder: boolean
  model: ModelStatus
  running: boolean
  typed: boolean
}

/**
 * The composer sends; everything about whether it *may* send is stated in the note under it
 * rather than left to a disabled button with no explanation.
 */
export function Composer(props: { streaming?: boolean }) {
  const [value, setValue] = createSignal('')
  const [attached, setAttached] = createSignal<Attachment[]>([])
  const [refused, setRefused] = createSignal<Undef<Refusal>>(undefined)
  const model = runningModel()
  const composerFolder = () => composerFolderOf(shell)
  const language = () => languageOf(shell.language)
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
  const note = () =>
    composerNote(language(), {
      hasFolder: hasWorkspace(),
      model: shell.model,
      running: running(),
      typed: value().trim() !== '',
    })
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
    // The line the next message is written on: a soft bar floating at the foot of the page, one
    // column in from the page's own edge so it starts where every entry's words start, with the
    // prompt mark at its left — the one mark that is not a number (C5.4).
    <div class={`shrink-0 pt-2 pb-4 ${PAGE}`}>
      <QueueStrip />
      {/* One column in from the page's edge — the width of an entry's number and the gap after it —
          so the bar lines up with the words above it rather than with the numbers. */}
      <div class="ml-10">
        <div class={BAR(props.streaming === true)}>
          <PendingAttachments items={attached()} onRemove={(index) => removeAt(index)} />
          <div class="flex items-start gap-2.5">
            <PromptMark />
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
              class="field-sizing-content block max-h-40 min-h-6 w-full resize-none overflow-y-auto bg-transparent text-body text-parchment placeholder:text-parchment-faint focus:outline-none"
            />
          </div>
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
          <Show when={note() !== ''}>
            <p class="mt-1 font-mono text-micro text-parchment-faint">{note()}</p>
          </Show>
        </div>
      </div>
    </div>
  )
}
