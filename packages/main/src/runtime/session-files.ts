/**
 * The conversation's own files: where its transcript lives, what it has spent, deleting it, and
 * writing it out as markdown. Everything here works from the session store alone, so it can be
 * used for a conversation that is open and for one that is not.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ChatMessage,
  type ConversationSummary,
  exportFileName,
  exportMarkdown,
  type UsageTotals,
} from '@alpha/core'
import type { ConversationRuntime } from './conversation-runtime.ts'
import type { DecisionLookup } from './decisions.ts'
import { type SessionLocation, sessionUsage, withSession } from './session-reader.ts'

/** What a conversation that is not running has spent, read straight from its session. */
export const readSessionUsage = sessionUsage

/** Where one conversation's session lives. */
export function sessionLocation(sessionsRoot: string, conversation: ConversationSummary): SessionLocation {
  return {
    sessionsRoot,
    workspacePath: conversation.workspacePath,
    conversationId: conversation.id,
  }
}

/** Usage for a conversation that has just been opened: live when it runs, from disk when it does not. */
export async function usageFor(
  conversation: ConversationSummary,
  sessionsRoot: string,
  runtime?: ConversationRuntime,
): Promise<UsageTotals> {
  if (runtime !== undefined) return runtime.usage()
  return readSessionUsage(sessionLocation(sessionsRoot, conversation))
}

export async function readSessionTranscript(
  location: SessionLocation,
  decisions?: DecisionLookup,
): Promise<ChatMessage[]> {
  return withSession(location, (reader) => reader.transcript(), [], { decisions })
}

/** Writes the conversation beside its workspace, and answers with where it went. */
export function writeSessionMarkdown(conversation: ConversationSummary, messages: ChatMessage[]): { path: string } {
  const path = join(conversation.workspacePath, exportFileName(conversation.title))
  writeFileSync(path, exportMarkdown(conversation, messages), 'utf-8')
  return { path }
}
