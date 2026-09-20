/**
 * The conversation's own files: reading a conversation that is not running, deleting it, and
 * writing it out as markdown.
 *
 * Reading a conversation means asking the agent to read it, because the session is the agent's:
 * this opens one short-lived agent for the conversation, reads what it is asked for, and closes it
 * again. Nothing here parses a session file, and nothing here writes one.
 */

import { writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type ChatMessage,
  type ConversationSummary,
  EMPTY_USAGE,
  exportFileName,
  exportMarkdown,
  type Undef,
  type UsageTotals,
} from '@alpha/core'
import { AgentRpc } from '../agent-cli/rpc.ts'
import { agentProcessFor } from './agent-process.ts'
import type { DecisionLookup } from './decisions.ts'
import { SessionReader } from './session-reader.ts'

/** Where the agent is and how it is run, which every read of a resting conversation needs. */
export interface AgentPorts {
  /** The agent's program, or nothing when none is installed: then nothing can be read either. */
  path: () => string
  /** Alpha's own directory for the agent. */
  directory: string
  env: NodeJS.ProcessEnv
  sessionsRoot: string
  /** The key for a provider, and why there is none when there is none (#114). */
  credential: (providerId: string) => { env: NodeJS.ProcessEnv; problem?: { message: string } }
}

/** Reading a conversation that is not open: an agent is started for it, and stopped after. */
async function withAgent<T>(
  ports: AgentPorts,
  conversation: ConversationSummary,
  read: (reader: SessionReader) => Promise<T>,
  absent: T,
  decisions?: DecisionLookup,
): Promise<T> {
  const command = agentProcessFor({
    agentPath: ports.path(),
    agentDirectory: ports.directory,
    env: ports.env,
    workspacePath: conversation.workspacePath,
    sessionsRoot: ports.sessionsRoot,
    conversationId: conversation.id,
    sessionId: conversation.sessionId,
    name: conversation.title,
    model: conversation.model,
    credential: ports.credential(conversation.model.providerId).env,
  })
  if (command === undefined) return absent
  const rpc = AgentRpc.open({ file: command.file, args: command.args, cwd: command.cwd, env: command.env })
  try {
    return await read(new SessionReader(rpc, decisions))
  } finally {
    await rpc.close()
  }
}

export async function readSessionTranscript(
  ports: AgentPorts,
  conversation: ConversationSummary,
  decisions?: DecisionLookup,
): Promise<ChatMessage[]> {
  return withAgent(ports, conversation, (reader) => reader.transcript(), [], decisions)
}

/** What a conversation that is not running has spent. */
export async function readSessionUsage(ports: AgentPorts, conversation: ConversationSummary): Promise<UsageTotals> {
  return withAgent(ports, conversation, (reader) => reader.usage(), EMPTY_USAGE)
}

/** Usage for a conversation that has just been opened: live when it runs, read when it does not. */
export async function usageFor(
  ports: AgentPorts,
  conversation: ConversationSummary,
  runtime?: { usage: () => Promise<UsageTotals> },
): Promise<UsageTotals> {
  if (runtime !== undefined) return runtime.usage()
  return readSessionUsage(ports, conversation)
}

/**
 * Branches a conversation's session before an entry, on an agent of its own so the conversation
 * that is open is not disturbed. The answer is the id of the copy, which is a session the agent
 * names — a new conversation that continues from there is started with it.
 */
export async function forkSession(
  ports: AgentPorts,
  conversation: ConversationSummary,
  entryId: string,
): Promise<Undef<string>> {
  return withAgent(ports, conversation, (reader) => reader.forkAt(entryId), undefined)
}

/**
 * Takes the session off the disk. A conversation that is deleted is deleted, not hidden — and the
 * file is the agent's, so where it is is asked for rather than worked out.
 */
export async function deleteSession(ports: AgentPorts, conversation: ConversationSummary): Promise<void> {
  const file = await withAgent(ports, conversation, (reader) => reader.file(), '')
  if (file === '') return
  await rm(file, { force: true })
}

/** Writes the conversation beside its workspace, and answers with where it went. */
export function writeSessionMarkdown(conversation: ConversationSummary, messages: ChatMessage[]): { path: string } {
  const path = join(conversation.workspacePath, exportFileName(conversation.title))
  writeFileSync(path, exportMarkdown(conversation, messages), 'utf-8')
  return { path }
}
