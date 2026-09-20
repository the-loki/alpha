/**
 * The conversations that are open, and the index of the ones that are not. One runtime per open
 * conversation — one agent process each — and everything else is read from the index file, so the
 * sidebar costs one read.
 *
 * The manager also owns the bookkeeping the window should not have to do: a conversation takes
 * its title from the user's first message, its status follows the run, and its model is the
 * configured default until the user picks another.
 */

import {
  type ApprovalAsk,
  type Attachment,
  type ChatMessage,
  type ConversationSummary,
  defaultLevelFor,
  type EditEffect,
  EMPTY_USAGE,
  type ModelStatus,
  type OpenedConversation,
  type PermissionLevel,
  type PermissionRule,
  type RuntimeEvent,
  type ThinkingLevel,
} from '@alpha/core'
import type { ProviderStore } from '../providers/store.ts'
import type { StateStore } from '../state-store.ts'
import { ApprovalBroker } from './approvals.ts'
import { ConversationBookkeeper, DEFAULT_TITLE, NO_MODEL, newConversation } from './bookkeeping.ts'
import type { ConversationRuntime, PermissionPorts } from './conversation-runtime.ts'
import { DecisionLog } from './decisions.ts'
import { type EditingPorts, editMessage, regenerate } from './editing.ts'
import type { ApprovalAnswer } from './gate.ts'
import { defaultModel, describeRuntime, modelFor, refusesPictures } from './models.ts'
import { type OpeningPorts, tryOpen } from './opening.ts'
import { createPermissionPorts, rememberWorkspaceLevel, revokeRule } from './permissions.ts'
import { QueueRunner } from './queue.ts'
import {
  type AgentPorts,
  deleteSession,
  readSessionTranscript,
  usageFor,
  writeSessionMarkdown,
} from './session-files.ts'
import { UnattendedRuns } from './unattended.ts'

export interface RuntimeManagerOptions {
  dataDirectory: string
  sessionsRoot: string
  providers: ProviderStore
  /** Where the agent is and how it is run: the same answers every part of the runtime needs. */
  agent: AgentPorts
  /** The remembered level and the rules the user has stopped wanting to be asked about. */
  store: StateStore
  emit: (event: RuntimeEvent) => void
  /** Told when the rules change, so a settings page that is open can follow along. */
  emitRules: (rules: PermissionRule[]) => void
}

export class RuntimeManager {
  readonly #options: RuntimeManagerOptions
  readonly #books: ConversationBookkeeper
  readonly #open = new Map<string, ConversationRuntime>()
  readonly #approvals: ApprovalBroker
  readonly #decisions: DecisionLog
  /** Messages waiting for a turn of their own, and what the agent is holding for this one. */
  readonly #queue: QueueRunner
  /** Runs with nobody watching, and the refusals their gate had to hand out (ADR-0012). */
  readonly #unattended = new UnattendedRuns()

  constructor(options: RuntimeManagerOptions) {
    this.#options = options
    this.#books = new ConversationBookkeeper({ dataDirectory: options.dataDirectory, emit: options.emit })
    this.#approvals = new ApprovalBroker({ emit: options.emit })
    this.#decisions = new DecisionLog(options.dataDirectory)
    this.#queue = new QueueRunner({
      statusOf: (id) => this.#books.find(id)?.status,
      send: (id, text) => this.prompt(id, text),
      emit: options.emit,
    })
  }

  permissionRules(): PermissionRule[] {
    return this.#options.store.read().permissionRules
  }

  revokeRule(ruleId: string): PermissionRule[] {
    const rules = revokeRule(this.#options.store, ruleId)
    this.#options.emitRules(rules)
    return rules
  }

  answerApproval(id: string, requestId: string, answer: ApprovalAnswer): void {
    this.#approvals.answer(id, requestId, answer)
  }

  list(): ConversationSummary[] {
    return this.#books.list()
  }

  modelStatus(): ModelStatus {
    return describeRuntime(this.#options.providers)
  }

  async create(workspacePath: string): Promise<OpenedConversation> {
    const conversation = newConversation({
      id: crypto.randomUUID(),
      workspacePath,
      now: Date.now(),
      permissionLevel: defaultLevelFor(this.#options.store.read(), workspacePath),
      model: this.#startingModel(),
    })
    const runtime = tryOpen(this.#openingPorts(), {
      conversationId: conversation.id,
      conversation,
      model: defaultModel(this.#options.providers),
    })
    if (runtime !== undefined) this.#open.set(conversation.id, runtime)
    this.#books.upsert(conversation)
    this.#options.store.rememberConversation(conversation.id)

    return { conversation, messages: [], usage: EMPTY_USAGE }
  }

  async open(id: string): Promise<OpenedConversation> {
    const conversation = this.#requireConversation(id)

    this.#options.store.rememberConversation(id)
    const existing = this.#open.get(id)
    if (existing !== undefined) {
      return { conversation, messages: await existing.transcript(), usage: await existing.usage() }
    }

    const runtime = tryOpen(this.#openingPorts(), {
      conversationId: id,
      conversation,
      model: modelFor(this.#options.providers, conversation),
    })
    if (runtime !== undefined) this.#open.set(id, runtime)
    if (conversation.title !== DEFAULT_TITLE) this.#books.markNamed(id)

    return {
      conversation,
      messages: await this.transcriptFor(id),
      usage: await usageFor(this.#options.agent, conversation, runtime),
    }
  }

  /**
   * Runs one turn with nobody watching (a scheduled task, ADR-0012) and answers with what the gate
   * had to refuse. A run started by hand is attended: whoever pressed "run now" is right there.
   */
  async runUnattended(id: string, text: string): Promise<number> {
    this.#unattended.start(id)
    try {
      await this.prompt(id, text)
    } catch (error) {
      // A run that threw still stops being watched, and the caller hears about the failure.
      this.#unattended.finish(id)
      throw error
    }
    return this.#unattended.finish(id)
  }

  async prompt(id: string, text: string, attachments?: Attachment[]): Promise<void> {
    const conversation = this.#requireConversation(id)
    // A credential Alpha cannot read is reported as such, and the run is refused before the agent
    // is asked: a turn that fails at its first token is a worse answer than a sentence (#114).
    const model = modelFor(this.#options.providers, conversation)
    const key = model === undefined ? undefined : this.#options.agent.credential(model.providerId)
    if (key?.problem !== undefined) throw new Error(key.problem.message)
    // The last word on whether a picture may go: an agent handed a picture its model cannot read
    // answers about something it never saw, and a turn that refuses is better than that (ADR-0018).
    if ((attachments?.length ?? 0) > 0 && refusesPictures(this.#options.providers, conversation.model)) {
      throw new Error(
        `${conversation.model.modelId} does not take pictures. Turn that on for it under Settings, Models.`,
      )
    }
    await (await this.#openFor(id)).prompt(text, attachments)
  }

  async steer(id: string, text: string): Promise<void> {
    await (await this.#openFor(id)).steer(text)
  }

  /**
   * Waiting for the turn to end is the workbench's own business (ADR-0011): the message goes into
   * our list, where it can be edited, and a new turn picks it up when the current one finishes.
   */
  async queueMessage(id: string, text: string): Promise<void> {
    this.#requireConversation(id)
    await this.#queue.add(id, text)
  }

  /** Editing one where it stands: same position, new words. */
  async editQueued(id: string, entryId: string, text: string): Promise<void> {
    this.#queue.edit(id, entryId, text)
  }

  /**
   * Taking back a message that has not been sent. The agent's queue is emptied whole and ours is
   * not, so which one an id belongs to decides which of the two is asked.
   */
  async cancelQueued(id: string, entryId: string): Promise<void> {
    if (this.#queue.cancel(id, entryId)) return
    await (await this.#openFor(id)).cancelQueued()
  }

  /** Starting a stopped queue again: pressing Stop, or a failed turn, is what stopped it. */
  async resumeQueue(id: string): Promise<void> {
    this.#requireConversation(id)
    await this.#queue.resume(id)
  }

  /** Both of these move the branch tip, and the editing module replaces the window's copy. */
  async regenerate(id: string): Promise<void> {
    await regenerate(this.#editPorts(), id)
  }

  async editMessage(id: string, index: number, text: string, effect: EditEffect): Promise<OpenedConversation> {
    const opened = await editMessage(this.#editPorts(), id, index, text, effect)
    this.#options.store.rememberConversation(opened.conversation.id)
    return opened
  }

  async compactConversation(id: string): Promise<boolean> {
    return (await this.#openFor(id)).compact()
  }

  async abort(id: string): Promise<void> {
    // An aborted run leaves nothing to decide, and a promise nobody will answer is a hang.
    this.#approvals.abandon(id, 'The run was stopped before this call was answered.')
    this.#queue.stop(id)
    await this.#open.get(id)?.abort()
  }

  rename(id: string, title: string): ConversationSummary {
    return this.#books.rename(id, title)
  }

  archive(id: string): ConversationSummary[] {
    this.#books.archive(id)
    return this.list()
  }

  unarchive(id: string): ConversationSummary[] {
    this.#books.unarchive(id)
    return this.list()
  }

  /**
   * Deleting means deleting: the session goes with it, so the conversation is gone from the list
   * and from the disk, not merely hidden from one of them.
   */
  async remove(id: string): Promise<ConversationSummary[]> {
    const conversation = this.#requireConversation(id)
    this.#approvals.abandon(id, 'The conversation was deleted.')
    const runtime = this.#open.get(id)
    if (runtime !== undefined) {
      await runtime.close()
      this.#open.delete(id)
    }
    await deleteSession(this.#options.agent, conversation)
    this.#decisions.forget(id)
    this.#queue.forget(id)
    this.#books.forget(id)
    if (this.#options.store.read().lastConversationId === id) this.#options.store.rememberConversation('')
    return this.list()
  }

  /** A markdown file beside the workspace, with everything the conversation said and did. */
  async exportMarkdown(id: string): Promise<{ path: string }> {
    const conversation = this.#requireConversation(id)
    return writeSessionMarkdown(conversation, await this.transcriptFor(id))
  }

  /** The transcript of a conversation, open or not: the same reading either way. */
  async transcriptFor(id: string): Promise<ChatMessage[]> {
    const runtime = this.#open.get(id)
    if (runtime !== undefined) return runtime.transcript()
    const conversation = this.#requireConversation(id)
    return readSessionTranscript(this.#options.agent, conversation, this.#decisions.opened(id))
  }

  /**
   * The runtime's events, and the two moments the queue changes because of them: a turn that
   * finished sends the next message, and a turn that failed stops the queue.
   */
  #observe(event: RuntimeEvent): void {
    if (event.type === 'queue_updated') {
      this.#books.observe(event)
      this.#queue.rememberSteers(event.conversationId, event.queued)
      return
    }

    this.#books.observe(event)
    if (event.type === 'run_failed') this.#queue.stop(event.conversationId)
    if (event.type === 'turn_finished') void this.#queue.flush(event.conversationId)
  }

  #editPorts(): EditingPorts {
    return {
      conversation: (id) => this.#requireConversation(id),
      runtime: (id) => this.#openFor(id),
      register: (conversation) => {
        this.#books.upsert(conversation)
        this.#books.markNamed(conversation.id)
      },
      openConversation: (id) => this.open(id),
      agent: this.#options.agent,
      adopt: (id, sessionId) => void this.#books.update(id, { sessionId, updatedAt: Date.now() }),
      replaceTranscript: (id, messages) =>
        this.#options.emit({ conversationId: id, type: 'transcript_replaced', messages }),
    }
  }

  /** The level in force for one conversation; the gate reads this at the moment of each call. */
  setConversationLevel(id: string, level: PermissionLevel): ConversationSummary {
    this.#requireConversation(id)
    return this.#books.update(id, { permissionLevel: level, updatedAt: Date.now() })
  }

  /** The level new conversations in a workspace start at. */
  setWorkspaceLevel(workspacePath: string, level: PermissionLevel): void {
    rememberWorkspaceLevel(this.#options.store, workspacePath, level)
  }

  async setConversationModel(id: string, providerId: string, modelId: string): Promise<ConversationSummary> {
    this.#requireConversation(id)
    if (this.#options.providers.find(providerId)?.models.some((model) => model.id === modelId) !== true) {
      throw new Error(`${providerId} does not serve ${modelId}`)
    }
    await this.#open.get(id)?.setModel(providerId, modelId)
    return this.#books.update(id, { model: { providerId, modelId }, updatedAt: Date.now() })
  }

  async setThinkingLevel(id: string, level: ThinkingLevel): Promise<ConversationSummary> {
    this.#requireConversation(id)
    await this.#open.get(id)?.setThinkingLevel(level)
    return this.#books.update(id, { thinkingLevel: level, updatedAt: Date.now() })
  }

  async closeAll(): Promise<void> {
    for (const id of this.#open.keys()) this.#approvals.abandon(id, 'The window closed before this call was answered.')
    for (const runtime of this.#open.values()) await runtime.close()
    this.#open.clear()
  }

  /** The runtime for a conversation, opening it first when it is not already open. */
  async #openFor(id: string): Promise<ConversationRuntime> {
    const open = this.#open.get(id)
    if (open !== undefined) return open
    await this.open(id)
    const opened = this.#open.get(id)
    if (opened === undefined) throw new Error('No agent is installed, so this conversation cannot run.')
    return opened
  }

  #requireConversation(id: string): ConversationSummary {
    const conversation = this.#books.find(id)
    if (conversation === undefined) throw new Error(`No conversation ${id}`)
    return conversation
  }

  /** A question nobody is there to answer becomes a refusal, or a card when somebody is. */
  #askOrRefuse(id: string, ask: ApprovalAsk): Promise<ApprovalAnswer> {
    const refusal = this.#unattended.refuse(id)
    return refusal === undefined ? this.#approvals.ask(id, ask) : Promise.resolve(refusal)
  }

  #openingPorts(): OpeningPorts {
    return {
      agent: this.#options.agent,
      decisions: this.#decisions,
      permissions: () => this.#permissionPorts(),
      emit: (event) => this.#observe(event),
    }
  }

  #permissionPorts(): PermissionPorts {
    return createPermissionPorts({
      store: this.#options.store,
      levelOf: (id) => this.#books.find(id)?.permissionLevel ?? this.#options.store.read().permissionLevel,
      ask: (id, ask) => this.#askOrRefuse(id, ask),
      changed: this.#options.emitRules,
    })
  }

  /** Where a new conversation starts, and what it is named while it has no name of its own. */
  #startingModel(): ConversationSummary['model'] {
    return defaultModel(this.#options.providers) ?? NO_MODEL
  }
}
