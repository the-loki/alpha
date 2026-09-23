/**
 * What arrives from another process, read defensively before a handler touches it. The window is
 * the process that could be compromised and the served workbench is reachable from the network, so
 * every argument is checked here rather than trusted where it is used.
 */

import type { AppearancePatch, ApprovalAnswerInput, NetworkPatch } from '@alpha/contract'
import {
  type Attachment,
  byteLengthOf,
  type ConversationModel,
  isImageMime,
  isNetworkBind,
  isPermissionLevel,
  isPortNumber,
  isRuleScope,
  isTheme,
  MAX_ATTACHMENT_BYTES,
  type PermissionLevel,
  type Undef,
} from '@alpha/domain'
import { isLanguageSetting } from '@alpha/i18n'

/** How it looks and reads: the theme and the language. Any field may be left out. */
export function readAppearancePatch(input: unknown): AppearancePatch {
  if (typeof input !== 'object' || input === null) throw new Error('an appearance patch is required')
  const record = input as Record<string, unknown>
  const patch: AppearancePatch = {}
  if (record.theme !== undefined) {
    if (!isTheme(record.theme)) throw new Error('theme must be system, light or dark')
    patch.theme = record.theme
  }
  if (record.language !== undefined) {
    if (!isLanguageSetting(record.language)) throw new Error('language must be system, en or zh')
    patch.language = record.language
  }
  return patch
}

/** A patch from the window: only the fields it may change, and only if they are the right shape. */
export function readNetworkPatch(input: unknown): NetworkPatch {
  if (typeof input !== 'object' || input === null) throw new Error('a network patch is required')
  const record = input as Record<string, unknown>
  const patch: NetworkPatch = {}
  if (record.enabled !== undefined) {
    if (typeof record.enabled !== 'boolean') throw new Error('enabled must be a boolean')
    patch.enabled = record.enabled
  }
  if (record.port !== undefined) {
    if (!isPortNumber(record.port)) throw new Error('port must be a whole number between 0 and 65535')
    patch.port = record.port
  }
  if (record.bind !== undefined) {
    if (!isNetworkBind(record.bind)) throw new Error('bind must be local or network')
    patch.bind = record.bind
  }
  return patch
}

/** The window is the process that could be compromised, so its answer is read defensively. */
export function readApprovalAnswer(input: unknown): ApprovalAnswerInput {
  if (typeof input !== 'object' || input === null) throw new Error('an approval answer is required')
  const record = input as Record<string, unknown>
  const decision = record.decision
  if (decision !== 'once' && decision !== 'always' && decision !== 'deny') {
    throw new Error('decision must be once, always, or deny')
  }
  if (record.scope !== undefined && !isRuleScope(record.scope)) throw new Error('scope must be a rule scope')
  return {
    conversationId: requireString(record.conversationId, 'conversationId'),
    requestId: requireString(record.requestId, 'requestId'),
    decision,
    scope: isRuleScope(record.scope) ? record.scope : undefined,
    reason: typeof record.reason === 'string' ? record.reason : undefined,
  }
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${field} must be a non-empty string`)
  return value
}

/**
 * What a client may attach to a message. The boundary is where this is checked, because the HTTP
 * transport is reachable by anything on the network: pictures only, and only up to the size a
 * provider will take.
 */
export function readAttachments(value: unknown): Undef<Attachment[]> {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) throw new Error('attachments must be a list of pictures')
  return value.map((entry, index) => {
    const part = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {}
    const mimeType = requireString(part.mimeType, `attachments[${index}].mimeType`)
    if (!isImageMime(mimeType)) throw new Error(`attachments[${index}] is not a picture`)
    const attachment: Attachment = {
      name: typeof part.name === 'string' ? part.name : undefined,
      mimeType,
      data: requireString(part.data, `attachments[${index}].data`),
    }
    if (byteLengthOf(attachment) > MAX_ATTACHMENT_BYTES) throw new Error(`attachments[${index}] is too large`)
    return attachment
  })
}

export function requireLevel(value: unknown): PermissionLevel {
  if (!isPermissionLevel(value)) throw new Error('level must be a permission level')
  return value
}

/**
 * What a new conversation should start on, or nothing at all to hand the choice back to the first
 * model there is. Two ids, and no reason for the boundary to know what they name: the store is
 * what checks that the model exists.
 */
export function readDefaultModel(value: unknown): Undef<ConversationModel> {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object') throw new Error('a default model must be a provider and a model')
  const record = value as Record<string, unknown>
  return {
    providerId: requireString(record.providerId, 'providerId'),
    modelId: requireString(record.modelId, 'modelId'),
  }
}
