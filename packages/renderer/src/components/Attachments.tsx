import type { Attachment, Null } from '@alpha/core'
import { useRef } from 'react'
import { readPicked } from '../lib/attachments.ts'
import { useText } from '../stores/shell.ts'
import { CloseIcon, PaperclipIcon } from './icons.tsx'

/** A quiet glyph button in the composer's foot, the shape the rest of the window's icons wear. */
export const FOOT_BUTTON =
  'no-drag grid h-7 w-7 shrink-0 place-items-center rounded-control text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment'

/**
 * The way in to the file picker. The picker is the platform's; this is a button that opens it, and
 * the input itself is off the page because nothing about it is worth drawing.
 */
export function AttachButton({ onPicked }: { onPicked: (picked: Attachment[], refused: boolean) => void }) {
  const t = useText()
  const input = useRef<Null<HTMLInputElement>>(null)
  return (
    <>
      <button
        type="button"
        aria-label={t('composer.attach')}
        title={t('composer.attach')}
        onClick={() => input.current?.click()}
        className={FOOT_BUTTON}
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
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          // Choosing the same file twice is only a change the second time if the field is empty.
          event.target.value = ''
          void readPicked(files).then((picked) => onPicked(picked.attachments, picked.refused))
        }}
      />
    </>
  )
}

/**
 * What is going with the message. A picture is shown rather than named: the thumb is the file,
 * and the only thing to decide about it is whether to keep it.
 */
export function PendingAttachments({ items, onRemove }: { items: Attachment[]; onRemove: (index: number) => void }) {
  const t = useText()
  if (items.length === 0) return null
  return (
    <ul aria-label={t('composer.attached')} className="mb-2 flex flex-wrap items-center gap-2">
      {items.map((item, index) => {
        // The same file can be picked twice, so the position is the only identity a row has — and
        // a row that follows a removal is redrawn from its own bytes, which loses no state.
        const key = `${item.name ?? 'shot'}-${index}`
        return (
          <li key={key} className="relative">
            <img
              src={`data:${item.mimeType};base64,${item.data}`}
              alt={item.name ?? ''}
              title={item.name}
              className="h-12 w-12 rounded-control border border-line object-cover"
            />
            <button
              type="button"
              aria-label={t('composer.removeAttachment', { name: item.name ?? '' })}
              onClick={() => onRemove(index)}
              className="absolute -top-1.5 -right-1.5 grid h-4 w-4 place-items-center rounded-full border border-line bg-ink-900 text-parchment-dim transition-colors hover:border-danger hover:text-danger"
            >
              <CloseIcon className="h-2.5 w-2.5" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The composer's own line about attachments: a file that was turned away is said out loud, because
 * a picture that never arrived is the kind of thing noticed too late. It clears itself the next
 * time a pick goes through, so it never has to be dismissed.
 */
export function AttachmentNote({ refused }: { refused: boolean }) {
  const t = useText()
  if (!refused) return null
  return <p className="mt-1.5 px-1 text-micro text-amber">{t('composer.attachmentRefused')}</p>
}
