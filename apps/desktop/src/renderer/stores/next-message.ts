/**
 * What the next message runs under: the level that bounds it, the model it runs on, how hard that
 * model thinks. CONTEXT.md states the rule twice — the level chip's and the model chip's — and it
 * is one rule: with a conversation open a chip names and changes *that conversation's*, and with
 * none open it names and changes the default the next conversation starts on. This module is that
 * rule's one home, one read and one write per attribute; the chips at the foot of the composer are
 * views over it.
 */
import {
  type ConversationModel,
  definitionOf,
  modelIn,
  type PermissionLevel,
  type ProviderModelDefinition,
  type ThinkingLevel,
  type Undef,
} from '@alpha/core'
import { conversationActions, conversations } from './conversations.ts'
import { providerActions, providers } from './providers.ts'
import { shell, shellActions } from './shell.ts'

/** Whether the message about to be typed opens a turn of a conversation already open. */
export const inConversation = (): boolean =>
  conversations.activeId !== '' && conversations.transcript.summary !== undefined

/** What a message typed now would run on, as far as the window can tell. */
export interface RunningModel {
  /** Which model it is, by provider and id: what a menu marks as the current one. */
  chosen: () => Undef<ConversationModel>
  /** The model's own definition, when the window's provider list serves it. */
  definition: () => Undef<ProviderModelDefinition>
  /** What to call it: its own name, or nothing when the window has never heard of it. */
  name: () => Undef<string>
  /**
   * Whether it may be handed a picture. Unknown reads as yes, because the window only refuses what
   * it knows is impossible — with no provider list in front of it (the scripted runtime, a
   * conversation whose provider was deleted before the list arrived) the main process is the one
   * that decides, and it refuses there (ADR-0018).
   */
  takesPictures: () => boolean
}

/**
 * The model the next message runs on: with a conversation open it is that conversation's own,
 * falling back to the default when it no longer resolves, and with none open it is what a new
 * conversation would start on. One rule with three readers — the composer's chip, the composer's
 * paperclip, and anything that has to name the model — so they cannot disagree about it.
 *
 * Every answer is a getter: it reads the stores where it is asked for, so a chip that names the
 * model follows a change to it without anything having to subscribe.
 */
export function runningModel(): RunningModel {
  const chosen = (): Undef<ConversationModel> => {
    const summary = conversations.transcript.summary
    return summary !== undefined && summary.model.providerId !== '' ? summary.model : undefined
  }
  const resolved = () => modelIn(providers.snapshot, chosen())
  const definition = () => definitionOf(providers.snapshot, resolved())
  return {
    chosen: resolved,
    definition,
    name: () => definition()?.name,
    takesPictures: () => {
      const found = definition()
      return found === undefined || found.images
    },
  }
}

/** What a change at the chip means: re-point this conversation, or choose the starting default. */
export const setRunningModel = async (next: ConversationModel): Promise<void> => {
  if (inConversation()) await conversationActions.setModel(next.providerId, next.modelId)
  else await providerActions.setDefaultModel(next)
}

/** The level in force for what is about to be typed, by the same rule the model follows. */
export const nextLevel = (): PermissionLevel => {
  const summary = conversations.transcript.summary
  return inConversation() && summary !== undefined ? summary.permissionLevel : shell.workspaceLevel
}

export const setNextLevel = async (level: PermissionLevel): Promise<void> => {
  if (inConversation()) await conversationActions.setLevel(level)
  else await shellActions.setPermissionLevel(level)
}

/** How hard the next turn thinks. It is a conversation's own setting, so there is none until a
    conversation is open — the chip is not drawn before that. */
export const nextThinking = (): Undef<ThinkingLevel> => conversations.transcript.summary?.thinkingLevel

export const setNextThinking = async (level: ThinkingLevel): Promise<void> => {
  await conversationActions.setThinkingLevel(level)
}
