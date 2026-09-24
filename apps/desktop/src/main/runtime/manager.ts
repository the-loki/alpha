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
  type ConversationSummary,
  defaultLevelFor,
  EMPTY_USAGE,
  type PermissionLevel,
  type PermissionRule,
  type RuntimeEvent,
  servesModel,
  type ThinkingLevel,
  type TurnRefusal,
  type Undef,
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
import { defaultModel, describeRuntime, startProblem } from '@alpha/providers'
import { ConversationReads, DecisionLog, SessionStore, sessionIdOf, writeSessionMarkdown } from '@alpha/sessions'
import type { ConversationRuntime } from './conversation-runtime.ts'
import { type EditingPorts, editMessage, regenerate } from './editing.ts'
import { openManagedRuntime, type RuntimeManagerOptions, RuntimeRefresh } from './managed-runtime.ts'
import { askOrRefuse } from './unattended.ts'

export class RuntimeManager {
  private readonly options: RuntimeManagerOptions
  private readonly books: ConversationBookkeeper
  private readonly sessions: SessionStore
  private readonly opened = new Map<string, ConversationRuntime>()
  private readonly runtimeRefresh = new RuntimeRefresh()
  private readonly approvals: ApprovalBroker
  private readonly decisions: DecisionLog
  /**
   * Everything read back out of a conversation, addressed by its id: the transcript, what it has
   * spent, the user's own messages. It is the door a caller that only reads takes (a markdown
   * export, an open, a screen that shows a conversation), so no such caller has to hold a runtime.
   */
  public readonly reads: ConversationReads
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
    this.reads = new ConversationReads({
      conversation: (id) => this.requireConversation(id),
      store: this.sessions,
      decisions: (id) => this.decisions.opened(id),
    })
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
      model: defaultModel(this.options.providers),
    })
    await this.launch(conversation)
    this.books.upsert(conversation)
    this.options.store.rememberConversation(conversation.id)

    return { conversation, messages: [], usage: EMPTY_USAGE }
  }

  public async open(id: string): Promise<OpenedConversation> {
    const conversation = this.requireConversation(id)

    this.options.store.rememberConversation(id)
    // A conversation that is already running is not launched again, and it was named when it was.
    if (!this.opened.has(id)) {
      await this.launch(conversation)
      if (conversation.title !== DEFAULT_TITLE) this.books.markNamed(id)
    }

    return { conversation, messages: this.reads.transcript(id), usage: this.reads.usage(id) }
  }

  /**
   * Runs one turn with nobody watching (a scheduled task, ADR-0012) and answers with what the gate
   * had to refuse and whether the final turn succeeded. A run started by hand is attended.
   * The run is waited out here, because a refusal only happens while the run is in flight and the
   * watching ends when the run does. A turn that did not start has ended too, so the watching ends
   * with it — and the caller hears it as a throw, because a task says how it went, not why.
   */
  public async runUnattended(id: string, text: string): Promise<{ refusals: number; succeeded: boolean }> {
    this.unattended.start(id)
    try {
      const refusal = await this.prompt(id, text)
      // A turn that did not start has ended too, and the caller hears it as a throw: a task records
      // how it went rather than why, and the why was said to the conversation when it was refused.
      if (refusal !== undefined) throw new Error(`The turn did not start: ${refusal.kind}`)
      const succeeded = await (await this.openFor(id)).settle()
      return { refusals: this.unattended.finish(id), succeeded }
    } catch (error) {
      // A run that threw still stops being watched, and the caller hears about the failure.
      this.unattended.finish(id)
      throw error
    }
  }

  /** A task started by hand can ask the gate, but still reports only after its turn finishes. */
  public async runAttended(id: string, text: string): Promise<boolean> {
    if ((await this.prompt(id, text)) !== undefined) return false
    return (await this.openFor(id)).settle()
  }

  /**
   * Starts a turn, and answers with why it did not start when it did not: the refusal is both said
   * to the conversation — so the window draws the case in its own language — and answered to the
   * caller, which needs no words for it (ADR-0010). Nothing is thrown: a turn that cannot start is
   * a fact about the conversation rather than a mistake by whoever asked.
   */
  public async prompt(id: string, text: string, attachments?: Attachment[]): Promise<Undef<TurnRefusal>> {
    const conversation = this.requireConversation(id)
    // Why the turn may not start is said before anyone waits for one: no model, an unreadable key,
    // a picture the model cannot read. Which case it is, is all models.ts answers.
    const refusal = startProblem({
      index: this.options.providers.index(),
      keyProblem: (providerId) => this.options.agent.keyProblem(providerId),
      model: conversation.model,
      pictures: attachments?.length ?? 0,
    })
    // A refusal is said to the conversation, so the window can draw the case in its own language,
    // and answered to the caller, which needs no words for it (ADR-0010). Nothing is thrown: a turn
    // that cannot start is a fact about the conversation rather than a mistake by whoever asked.
    if (refusal !== undefined) this.observe({ conversationId: id, type: 'turn_refused', refusal })
    // The runtime answers the same question for itself — a conversation assembled without a model
    // cannot run even when a model is configured now — so what the caller hears is one answer.
    else return await (await this.openForPrompt(id)).prompt(text, attachments)
    return refusal
  }

  /**
   * A message for the turn in flight. It is the workbench that remembers it as waiting: the lane
   * takes what it was steered with into the conversation, one message per turn boundary, and the
   * queue is Alpha's own book of what waits (ADR-0011).
   */
  public async steer(id: string, text: string): Promise<void> {
    await (await this.openFor(id)).steer(text)
    this.queue.steerSent(id, text)
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
    this.queue.steerCleared(id)
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
    return writeSessionMarkdown(conversation, this.reads.transcript(id))
  }

  /** The runtime's events: what the list makes of them, and what they do to what waits. */
  private observe(event: RuntimeEvent): void {
    this.books.observe(event)
    this.queue.observe(event)
  }

  private editPorts(): EditingPorts {
    return {
      conversation: (id) => this.requireConversation(id),
      runtime: (id) => this.openFor(id),
      reads: this.reads,
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

  /** Switching the model is asked for and reported back as an event, like every other change. */
  public async setConversationModel(id: string, providerId: string, modelId: string): Promise<ConversationSummary> {
    const conversation = this.requireConversation(id)
    // A model nobody serves is a refusal rather than a mistake by whoever asked: the window is told
    // which case it was, in its own language (#199), and the conversation keeps the model it had.
    if (!servesModel(this.options.providers.index(), { providerId, modelId })) {
      this.observe({
        conversationId: id,
        type: 'turn_refused',
        refusal: { kind: 'model-not-served', providerId, modelId },
      })
      return conversation
    }
    const runtime = this.opened.get(id)
    if (
      runtime !== undefined &&
      this.runtimeRefresh.isCurrent(runtime, this.options.providers.index()) &&
      !(await runtime.setModel(providerId, modelId))
    ) {
      return conversation
    }
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

  /** Reassembles a stale runtime after its current turn, before it takes the next prompt. */
  private async openForPrompt(id: string): Promise<ConversationRuntime> {
    return this.runtimeRefresh.forPrompt(
      id,
      () => this.openFor(id),
      () => this.options.providers.index(),
      (stale) => {
        if (this.opened.get(id) === stale) this.opened.delete(id)
        return this.launch(this.requireConversation(id))
      },
    )
  }

  private requireConversation(id: string): ConversationSummary {
    const conversation = this.books.find(id)
    if (conversation === undefined) throw new Error(`No conversation ${id}`)
    return conversation
  }

  /** Opens a conversation's runtime, or returns the one already open. */
  private async launch(conversation: ConversationSummary): Promise<ConversationRuntime> {
    const modelIndex = this.options.providers.index()
    const runtime = await openManagedRuntime(
      this.options,
      conversation,
      this.sessions,
      this.decisions.opened(conversation.id),
      () => this.permissionPorts(),
      (event) => this.observe(event),
    )
    this.opened.set(conversation.id, runtime)
    this.runtimeRefresh.note(runtime, modelIndex)
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
