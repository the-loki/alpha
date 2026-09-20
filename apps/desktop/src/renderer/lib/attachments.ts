/**
 * Reading picked files. The bytes a picker hands over arrive as a data URL and nowhere else, so
 * this is the browser end of attachments: `@alpha/core` decides what an attachment *is*, and this
 * is only how the browser spells one.
 */

import { type Attachment, attachmentFromDataUrl, byteLengthOf, MAX_ATTACHMENT_BYTES } from '@alpha/core'

/** A file as a data URL. A file that cannot be read resolves to nothing rather than throwing. */
function dataUrlOf(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
}

/** What came of a pick: the files worth sending, and whether any had to be turned away. */
export interface Picked {
  attachments: Attachment[]
  refused: boolean
}

/**
 * The picked files as attachments. Anything that is not a picture, or that is larger than a
 * provider will take, is turned away here — and counted, so the composer can say so rather than
 * dropping a file in silence.
 */
export async function readPicked(files: File[]): Promise<Picked> {
  const attachments: Attachment[] = []
  let refused = false
  for (const file of files) {
    const attachment = attachmentFromDataUrl(file.name, await dataUrlOf(file))
    if (attachment === undefined || byteLengthOf(attachment) > MAX_ATTACHMENT_BYTES) {
      refused = true
      continue
    }
    attachments.push(attachment)
  }
  return { attachments, refused }
}
