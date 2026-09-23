/**
 * The conversations that are open, and the index of the ones that are not. One runtime per open
 * conversation — one embedded agent each (ADR-0025) — and everything else is read from the index
 * file, so the sidebar costs one read.
 *
 * The manager also owns the bookkeeping the window should not have to do: a conversation takes its
 * title from the user's first message, its status follows the run, and its model is the configured
 * default until the user picks another.
 */

import type { EditEffect, ModelStatus, OpenedConversation } from '@alpha/contract'
import { ConversationBookkeeper, DEFAULT_TITLE, newConversation, QueueRunner } from '@alpha/conversations'
import {
  type Attachment,
  type ChatMessage,
  type ConversationSummary,
  defaultLevelFor,
  EMPTY_USAGE,
  type PermissionLevel,
  type PermissionRule,
  type RuntimeEvent,
  servesModel,
  type ThinkingLevel,
} from '@alpha/domain'
import {
  type ApprovalAnswer,
  ApprovalBroker,
  createPermissionPorts,
  type PermissionPorts,
  rememberWorkspaceLevel,
  revokeRule,
  UnattendedRuns,
} from '@alpha/gate'
import type { McpServers } from '@alpha/mcp'
import { defaultModel, describeRuntime, type ProviderStore, startProblem } from '@alpha/providers'
import {
  type AgentPorts,
  DecisionLog,
  readSessionTranscript,
  SessionStore,
  sessionIdOf,
  writeSessionMarkdown,
} from '@alpha/sessions'
import type { StateStore } from '@alpha/state'
import type { CompactionSettings } from '@earendil-works/pi-agent-core'
import type { Models } from '@earendil-works/pi-ai'
import { openRuntime } from './assemble-runtime.ts'
import type { ConversationRuntime } from './conversation-runtime.ts'
import { type EditingPorts, editMessage, regenerate } from './editing.ts'
import { askOrRefuse } from './unattended.ts'

export interface RuntimeManagerOptions {
  dataDirectory: string
  sessionsRoot: string
  providers: ProviderStore
  /** Where the sessions are and how a key is answered: the slim shape the embedded agent needs. */
  agent: AgentPorts
  /** The remembered level and the rules the user has stopped wanting to be asked about. */
  store: StateStore
  /** Builds the model runtime an open conversation dials with; tests script one. */
  models?: () => Models
  /** The MCP servers of this run, connected by `main`; a conversation waits for them here. */
  mcp?: () => Promise<McpServers>
  /** The compaction thresholds and retry backoff, when the caller shrinks them; tests do. */
  compactionSettings?: CompactionSettings
  retryDelays?: number[]
  emit: (event: RuntimeEvent) => void
  /** Told when the rules change, so a settings page that is open can follow along. */
  emitRules: (rules: PermissionRule[]) => void
}

export class RuntimeManager {
  private readonly options: RuntimeManagerOptions
  private readonly books: ConversationBookkeeper
  private readonly sessions: SessionStore
  private readonly opened = new Map<string, ConversationRuntime>()
  private readonly approvals: ApprovalBroker
  private readonly decisions: DecisionLog
  /** Messages waiting for a turn of their own, and what the agent is holding for this one. */
  private readonly queue: QueueRunner
  /** Runs with nobody watching, and the refusals their gate had to hand out (ADR-0012). */
  private readonly unattended = new UnattendedRuns()

  public constructor(options: RuntimeManagerOptions) {
    this.options = options
    this.books = new ConversationBookkeeper({ dataDirectory: options.dataDirectory, emit: options.emit })
    this.sessions = new SessionStore(options.sessionsRoot)
    this.approvals = new ApprovalBroker({ emit: options.emit })
    this.decisions = new DecisionLog(options.dataDirectory)
    this.queue = new QueueRunner({
      statusOf: (id) => this.books.find(id)?.status,
      send: (id, text) => this.prompt(id, text),
      emit: options.emit,
    })
  }

  public permissionRules(): PermissionRule[] {
    return this.options.store.read().permissionRules
  }

  public revokeRule(ruleId: string): PermissionRule[] {
    const rules = revokeRule(this.options.store, ruleId)
    this.options.emitRules(rules)
    return rules
  }

  public answerApproval(id: string, requestId: string, answer: ApprovalAnswer): void {
    this.approvals.answer(id, requestId, answer)
  }

  public list(): ConversationSummary[] {
    return this.books.list()
  }

  public modelStatus(): ModelStatus {
    return describeRuntime(this.options.providers)
  }

  public async create(workspacePath: string): Promise<OpenedConversation> {
    const conversation = newConversation({
      id: crypto.randomUUID(),
      workspacePath,
      now: Date.now(),
      permissionLevel: defaultLevelFor(this.options.store.read(), workspacePath),
      model: this.startingModel(),
    })
    await this.launch(conversation)
    this.books.upsert(conversation)
    this.options.store.rememberConversation(conversation.id)

    return { conversation, messages: [], usage: EMPTY_USAGE }
  }

  public async open(id: string): Promise<OpenedConversation> {
    const conversation = this.requireConversation(id)

    this.options.store.rememberConversation(id)
    const existing = this.opened.get(id)
    if (existing !== undefined) {
      return { conversation, messages: await existing.transcript(), usage: await existing.usage() }
    }

    const runtime = await this.launch(conversation)
    if (conversation.title !== DEFAULT_TITLE) this.books.markNamed(id)

    return { conversation, messages: await runtime.transcript(), usage: await runtime.usage() }
  }

  /**
   * Runs one turn with nobody watching (a scheduled task, ADR-0012) and answers with what the gate
   * had to refuse. A run started by hand is attended: whoever pressed "run now" is right there.
   * The run is waited out here, because a refusal only happens while the run is in flight — the
   * watching ends when the run does, or the count would always be zero.
   */
  public async runUnattended(id: string, text: string): Promise<number> {
    this.unattended.start(id)
    try {
      await this.prompt(id, text)
      await (await this.openFor(id)).settle()
    } catch (error) {
      // A run that threw still stops being watched, and the caller hears about the failure.
      this.unattended.finish(id)
      throw error
    }
    return this.unattended.finish(id)
  }

  public async prompt(id: string, text: string, attachments?: Attachment[]): Promise<void> {
    const conversation = this.requireConversation(id)
    // Why the turn may not start is said before anyone waits for one: no model, an unreadable key,
    // a picture the model cannot read (models.ts owns the sentences).
    const problem = startProblem({
      index: this.options.providers.index(),
      keyProblem: (providerId) => this.options.agent.keyProblem(providerId),
      model: conversation.model,
      pictures: attachments?.length ?? 0,
    })
    if (problem !== undefined) throw new Error(problem)
    await (await this.openFor(id)).prompt(text, attachments)
  }

  public async steer(id: string, text: string): Promise<void> {
    await (await this.openFor(id)).steer(text)
  }

  /**
   * Compacting the conversation now, whatever the threshold says (ADR-0025). The answer says
   * whether a compaction happened: a conversation with nothing to summarize is a no, not an error.
   */
  public async compactConversation(id: string): Promise<boolean> {
    return (await this.openFor(id)).compact()
  }

  /**
   * Waiting for the turn to end is the workbench's own business (ADR-0011): the message goes into
   * our list, where it can be edited, and a new turn picks it up when the current one finishes.
   */
  public async queueMessage(id: string, text: string): Promise<void> {
    this.requireConversation(id)
    await this.queue.add(id, text)
  }

  /** Editing one where it stands: same position, new words. */
  public async editQueued(id: string, entryId: string, text: string): Promise<void> {
    this.queue.edit(id, entryId, text)
  }

  /**
   * Taking back a message that has not been sent. The agent's queue is emptied whole and ours is
   * not, so which one an id belongs to decides which of the two is asked.
   */
  public async cancelQueued(id: string, entryId: string): Promise<void> {
    if (this.queue.cancel(id, entryId)) return
    await (await this.openFor(id)).cancelQueued()
  }

  /** Starting a stopped queue again: pressing Stop, or a failed turn, is what stopped it. */
  public async resumeQueue(id: string): Promise<void> {
    this.requireConversation(id)
    await this.queue.resume(id)
  }

  /** Both of these move the branch tip, and the editing module replaces the window's copy. */
  public async regenerate(id: string): Promise<void> {
    await regenerate(this.editPorts(), id)
  }

  public async editMessage(id: string, index: number, text: string, effect: EditEffect): Promise<OpenedConversation> {
    const opened = await editMessage(this.editPorts(), id, index, text, effect)
    this.options.store.rememberConversation(opened.conversation.id)
    return opened
  }

  public async abort(id: string): Promise<void> {
    // An aborted run leaves nothing to decide, and a promise nobody will answer is a hang.
    this.approvals.abandon(id, 'The run was stopped before this call was answered.')
    this.queue.stop(id)
    await this.opened.get(id)?.abort()
  }

  public rename(id: string, title: string): ConversationSummary {
    return this.books.rename(id, title)
  }

  public archive(id: string): ConversationSummary[] {
    this.books.archive(id)
    return this.list()
  }

  public unarchive(id: string): ConversationSummary[] {
    this.books.unarchive(id)
    return this.list()
  }

  /**
   * Deleting means deleting: the session goes with it, so the conversation is gone from the list
   * and from the disk, not merely hidden from one of them.
   */
  public async remove(id: string): Promise<ConversationSummary[]> {
    const conversation = this.requireConversation(id)
    this.approvals.abandon(id, 'The conversation was deleted.')
    const runtime = this.opened.get(id)
    if (runtime !== undefined) {
      await runtime.close()
      this.opened.delete(id)
    }
    this.sessions.remove(sessionIdOf(conversation), conversation.workspacePath)
    this.decisions.forget(id)
    this.queue.forget(id)
    this.books.forget(id)
    if (this.options.store.read().lastConversationId === id) this.options.store.rememberConversation('')
    return this.list()
  }

  /** A markdown file beside the workspace, with everything the conversation said and did. */
  public async exportMarkdown(id: string): Promise<{ path: string }> {
    const conversation = this.requireConversation(id)
    return writeSessionMarkdown(conversation, await this.transcriptFor(id))
  }

  /** The transcript of a conversation, open or not: the same reading either way. */
  public async transcriptFor(id: string): Promise<ChatMessage[]> {
    const runtime = this.opened.get(id)
    if (runtime !== undefined) return runtime.transcript()
    const conversation = this.requireConversation(id)
    return readSessionTranscript(this.sessions, conversation, this.decisions.opened(id))
  }

  /**
   * The runtime's events, and the two moments the queue changes because of them: a turn that
   * finished sends the next message, and a turn that failed stops the queue.
   */
  private observe(event: RuntimeEvent): void {
    if (event.type === 'queue_updated') {
      this.books.observe(event)
      this.queue.rememberSteers(event.conversationId, event.queued)
      return
    }

    this.books.observe(event)
    if (event.type === 'run_failed') this.queue.stop(event.conversationId)
    if (event.type === 'turn_finished') void this.queue.flush(event.conversationId)
  }

  private editPorts(): EditingPorts {
    return {
      conversation: (id) => this.requireConversation(id),
      runtime: (id) => this.openFor(id),
      register: (conversation) => {
        this.books.upsert(conversation)
        this.books.markNamed(conversation.id)
      },
      openConversation: (id) => this.open(id),
      agent: this.options.agent,
      adopt: (id, sessionId) => void this.books.update(id, { sessionId, updatedAt: Date.now() }),
      replaceTranscript: (id, messages) =>
        this.options.emit({ conversationId: id, type: 'transcript_replaced', messages }),
    }
  }

  /** The level in force for one conversation; the gate reads this at the moment of each call. */
  public setConversationLevel(id: string, level: PermissionLevel): ConversationSummary {
    this.requireConversation(id)
    return this.books.update(id, { permissionLevel: level, updatedAt: Date.now() })
  }

  /** The level new conversations in a workspace start at. */
  public setWorkspaceLevel(workspacePath: string, level: PermissionLevel): void {
    rememberWorkspaceLevel(this.options.store, workspacePath, level)
  }

  public async setConversationModel(id: string, providerId: string, modelId: string): Promise<ConversationSummary> {
    this.requireConversation(id)
    if (!servesModel(this.options.providers.index(), { providerId, modelId })) {
      throw new Error(`${providerId} does not serve ${modelId}`)
    }
    await this.opened.get(id)?.setModel(providerId, modelId)
    return this.books.update(id, { model: { providerId, modelId }, updatedAt: Date.now() })
  }

  public async setThinkingLevel(id: string, level: ThinkingLevel): Promise<ConversationSummary> {
    this.requireConversation(id)
    await this.opened.get(id)?.setThinkingLevel(level)
    return this.books.update(id, { thinkingLevel: level, updatedAt: Date.now() })
  }

  public async closeAll(): Promise<void> {
    for (const id of this.opened.keys()) this.approvals.abandon(id, 'The window closed before this call was answered.')
    for (const runtime of this.opened.values()) await runtime.close()
    this.opened.clear()
  }

  /** The runtime for a conversation, opening it first when it is not already open. */
  private async openFor(id: string): Promise<ConversationRuntime> {
    const existing = this.opened.get(id)
    if (existing !== undefined) return existing
    await this.open(id)
    const runtime = this.opened.get(id)
    if (runtime === undefined) throw new Error(`No conversation ${id}`)
    return runtime
  }

  private requireConversation(id: string): ConversationSummary {
    const conversation = this.books.find(id)
    if (conversation === undefined) throw new Error(`No conversation ${id}`)
    return conversation
  }

  /** Where a new conversation starts, and what it is named while it has no name of its own. */
  private startingModel(): ConversationSummary['model'] {
    return defaultModel(this.options.providers)
  }

  /** Opens a conversation's runtime, or returns the one already open. */
  private async launch(conversation: ConversationSummary): Promise<ConversationRuntime> {
    const runtime = await openRuntime({
      conversation,
      mcp: await this.options.mcp?.(),
      sessions: this.sessions,
      sessionsRoot: this.options.sessionsRoot,
      providers: this.options.providers,
      models: this.options.models,
      compactionSettings: this.options.compactionSettings,
      retryDelays: this.options.retryDelays,
      decisions: this.decisions.opened(conversation.id),
      permissions: () => this.permissionPorts(),
      emit: (event) => this.observe(event),
    })
    this.opened.set(conversation.id, runtime)
    return runtime
  }

  /** The gate's ports over the workbench: the level in force, the rules, and the person to ask. */
  private permissionPorts(): PermissionPorts {
    return createPermissionPorts({
      store: this.options.store,
      levelOf: (id) => this.books.find(id)?.permissionLevel ?? this.options.store.read().permissionLevel,
      ask: (id, ask) => askOrRefuse(this.unattended, this.approvals, id, ask),
      changed: this.options.emitRules,
    })
  }
}
