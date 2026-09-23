import type { Attachment, Undef } from '@alpha/domain'
import { For, Show } from 'solid-js'
import { readPicked } from '../../lib/attachments.ts'
import { useText } from '../../stores/shell.ts'
import { NOTICE } from '../controls.ts'
import { CloseIcon, PaperclipIcon } from '../icons.tsx'

/**
 * The attach control in the composer's foot: the foot's own glyph button — the standard height
 * it shares with the two chips and send beside it, on a card where the pointer's answer has to
 * step *up* to surface-2 to be seen at all (C5.4, C5.6).
 */
const FOOT_BUTTON = `no-drag grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted transition-colors duration-normal hover:bg-surface-2 hover:text-foreground`

/**
 * The way in to the file picker. The picker is the platform's; this is a button that opens it, and
 * the input itself is off the page because nothing about it is worth drawing.
 */
export function AttachButton(props: { onPicked: (picked: Attachment[], refused: Undef<Refusal>) => void }) {
  const t = useText()
  let input!: HTMLInputElement
  return (
    <>
      <button
        type="button"
        aria-label={t('composer.attach')}
        title={t('composer.attach')}
        onClick={() => input.click()}
        class={FOOT_BUTTON}
      >
        <PaperclipIcon />
      </button>
      {/* Hidden from the accessibility tree as well as the page: the button is the way in, and the
          field is a mechanism with nothing to name. It is not keyboard-reachable either. */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        aria-hidden="true"
        tabIndex={-1}
        class="sr-only"
        onInput={(event) => {
          const files = [...(event.currentTarget.files ?? [])]
          // Choosing the same file twice is only a change the second time if the field is empty.
          event.currentTarget.value = ''
          void readPicked(files).then((picked) =>
            props.onPicked(picked.attachments, picked.refused ? 'file' : undefined),
          )
        }}
      />
    </>
  )
}

/**
 * What is going with the message. A picture is shown rather than named: the thumb is the file,
 * and the only thing to decide about it is whether to keep it.
 */
export function PendingAttachments(props: { items: Attachment[]; onRemove: (index: number) => void }) {
  const t = useText()
  return (
    <Show when={props.items.length > 0}>
      {/* The pictures scroll rather than push — a pile of them may not grow the composer past the
          page the words are written on — with their own padding inside the scroll box, because each
          thumb's remove control sits outside the thumb's corner and would be cut off by the box. */}
      <ul
        aria-label={t('composer.attached')}
        class="-m-2 mb-0 flex max-h-[10vh] flex-wrap items-center gap-2 overflow-y-auto p-2"
      >
        <For each={props.items}>
          {(item, index) => {
            // The same file can be picked twice, so the position is the only identity a row has — and
            // a row that follows a removal is redrawn from its own bytes, which loses no state.
            return (
              <li class="relative">
                <img
                  src={`data:${item.mimeType};base64,${item.data}`}
                  alt={item.name ?? ''}
                  title={item.name}
                  class="h-12 w-12 rounded-md border border-line object-cover"
                />
                <button
                  type="button"
                  aria-label={t('composer.removeAttachment', { name: item.name ?? '' })}
                  onClick={() => props.onRemove(index())}
                  class="absolute -top-1.5 -right-1.5 grid h-4 w-4 place-items-center rounded-md border border-line bg-surface-0 text-muted transition-colors duration-normal hover:border-danger hover:bg-danger/10 hover:text-danger"
                >
                  <CloseIcon class="h-2.5 w-2.5" />
                </button>
              </li>
            )
          }}
        </For>
      </ul>
    </Show>
  )
}

/**
 * Why a picture was turned away: the file was not one the workbench can send, or the model it
 * would run on cannot be handed a picture at all.
 */
export type Refusal = 'file' | 'model'

/**
 * The composer's own line about attachments: a file that was turned away is said out loud, because
 * a picture that never arrived is the kind of thing noticed too late. It clears itself the next
 * time a pick goes through, so it never has to be dismissed.
 */
export function AttachmentNote(props: { refused: Undef<Refusal>; model: Undef<string> }) {
  const t = useText()
  return (
    <Show when={props.refused !== undefined}>
      <p class={`mt-2 ${NOTICE} border-warning font-mono text-label text-warning`}>
        {props.refused === 'model'
          ? t('composer.attachmentNoVision', { model: props.model ?? '' })
          : t('composer.attachmentRefused')}
      </p>
    </Show>
  )
}
