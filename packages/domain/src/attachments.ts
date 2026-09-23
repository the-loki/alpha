/**
 * A file the user attached to a message. It travels as its own bytes rather than as a path: the
 * model is handed the picture itself, and the transcript keeps it, so the same message means the
 * same thing in the window, in the export, and in the session log afterwards (ADR-0004).
 */

import type { Undef } from './maybe.ts'

export interface Attachment {
  /** What the file is called, when whoever holds it knows. A transcript keeps the picture, not the name. */
  name?: string
  mimeType: string
  /** The file's bytes, base64, with no `data:` prefix. */
  data: string
}

/** What every provider that takes pictures takes. Anything else is refused rather than guessed at. */
const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** One file's ceiling. The bytes themselves, not the base64 that carries them. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024

export function isImageMime(mimeType: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)
}

/**
 * A file input hands over a data URL; this is that URL as an attachment, or nothing when it is
 * not a picture or carries no bytes. Nothing is attached half-read.
 */
export function attachmentFromDataUrl(name: string, url: string): Undef<Attachment> {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url)
  if (match === null) return undefined
  const [, mimeType, data] = match
  if (data === '' || !isImageMime(mimeType)) return undefined
  return { name, mimeType, data }
}

/**
 * How many bytes the base64 stands for. Base64 spends four characters on every three bytes, and a
 * padding character on the last group, so the size limit is about the file and not its encoding.
 */
export function byteLengthOf(attachment: Attachment): number {
  const padding = attachment.data.endsWith('==') ? 2 : attachment.data.endsWith('=') ? 1 : 0
  return Math.floor((attachment.data.length * 3) / 4) - padding
}

/**
 * The pictures a message carries, read back out of its content. The content is where they end up
 * on both sides: what the lane was given, and what the session wrote down.
 */
export function attachmentsOf(content: unknown): Attachment[] {
  if (!Array.isArray(content)) return []
  const found: Attachment[] = []
  for (const part of content) {
    if (typeof part !== 'object' || part === null || !('type' in part)) continue
    const typed = part as { type: string; data?: unknown; mimeType?: unknown }
    const { data, mimeType } = typed
    if (typed.type !== 'image' || typeof data !== 'string' || typeof mimeType !== 'string') continue
    found.push({ mimeType, data })
  }
  return found
}

/** A picture as a message's content takes it, which is what the lane is handed. */
export interface ImagePart {
  type: 'image'
  data: string
  mimeType: string
}

/**
 * The attachments as content parts, or nothing at all when there are none: a lane handed an empty
 * list has been told something different from a lane handed no pictures.
 */
export function imagesOf(attachments: Undef<Attachment[]>): Undef<ImagePart[]> {
  if (attachments === undefined || attachments.length === 0) return undefined
  const pictures = attachments.filter((attachment) => isImageMime(attachment.mimeType))
  if (pictures.length === 0) return undefined
  return pictures.map(({ data, mimeType }) => ({ type: 'image', data, mimeType }))
}
