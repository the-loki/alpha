/**
 * The conversations that are open, and the index of the ones that are not. One runtime per open
 * conversation; everything else is read from the index file, so the sidebar costs one read.
 *
 * The manager also owns the bookkeeping the window should not have to do: a conversation takes
 * its title from the user's first message, its status follows the run, and its model is the
 * configured default until the user picks another.
 */

import {
  type ApprovalRecord,
  type ChatMessage,
  type ConversationSummary,
  DEFAULT_THINKING_LEVEL,
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
import type { Api, Model } from '@earendil-works/pi-ai'
import { createProviderModelRuntime } from '../providers/model-runtime.ts'
import type { ProviderStore } from '../providers/store.ts'
import type { StateStore } from '../state-store.ts'
import { ApprovalBroker } from './approvals.ts'
import { ConversationBookkeeper, DEFAULT_TITLE, NO_MODEL, newConversation } from './bookkeeping.ts'
import { ConversationRuntime, findSessionMetadata, type PermissionPorts } from './conversation-runtime.ts'
import { DecisionLog } from './decisions.ts'
import type { ApprovalAnswer } from './gate.ts'
import { describeRuntime, type ModelRuntime, modelFor, resolveModelRuntime } from './models.ts'
import { createPermissionPorts, rememberWorkspaceLevel, revokeRule, withLevel } from './permissions.ts'
import {
  deleteSession,
  readSessionTranscript,
  sessionLocation,
  usageFor,
  writeSessionMarkdown,
} from './session-files.ts'
import { buildSystemPrompt } from './system-prompt.ts'
import {
  cancelQueued,
  compactConversation,
  editMessage,
  queueMessage,
  regenerate,
  steerConversation,
  type TurnPorts,
} from './turn-ops.ts'

export interface RuntimeManagerOptions {
  dataDirectory: string
  sessionsRoot: string
  providers: ProviderStore
  /** The remembered level and the rules the user has stopped wanting to be asked about. */
  store: StateStore
  env: NodeJS.ProcessEnv
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

  constructor(options: RuntimeManagerOptions) {
    this.#options = options
    this.#books = new ConversationBookkeeper({ dataDirectory: options.dataDirectory, emit: options.emit })
    this.#approvals = new ApprovalBroker({ emit: options.emit })
    this.#decisions = new DecisionLog(options.dataDirectory)
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
    return describeRuntime(this.#modelRuntime())
  }

  async create(workspacePath: string): Promise<OpenedConversation> {
    const model = this.#modelRuntime().defaultModel
    const opened = await this.#tryOpen({
      workspacePath,
      model,
      thinkingLevel: DEFAULT_THINKING_LEVEL,
      emit: (event: RuntimeEvent) => this.#books.observe(event),
    })

    const conversation = newConversation({
      id: opened.conversationId,
      workspacePath,
      now: Date.now(),
      permissionLevel: defaultLevelFor(this.#options.store.read(), workspacePath),
      model: model === undefined ? NO_MODEL : { providerId: model.provider, modelId: model.id },
    })
    if (opened.runtime !== undefined) this.#open.set(conversation.id, opened.runtime)
    this.#books.upsert(conversation)
    this.#options.store.rememberConversation(conversation.id)

    return { conversation, messages: opened.messages, usage: EMPTY_USAGE }
  }

  async open(id: string): Promise<OpenedConversation> {
    const conversation = this.#requireConversation(id)

    this.#options.store.rememberConversation(id)
    const existing = this.#open.get(id)
    if (existing !== undefined) {
      return { conversation, messages: await existing.transcript(), usage: await existing.usage() }
    }

    const opened = await this.#tryOpen({
      conversationId: id,
      workspacePath: conversation.workspacePath,
      model: modelFor(this.#modelRuntime(), conversation),
      thinkingLevel: conversation.thinkingLevel,
      sessionMetadata: await findSessionMetadata({
        sessionsRoot: this.#options.sessionsRoot,
        workspacePath: conversation.workspacePath,
        conversationId: id,
      }),
      emit: (event: RuntimeEvent) => this.#books.observe(event),
    })
    if (opened.runtime !== undefined) this.#open.set(id, opened.runtime)
    if (conversation.title !== DEFAULT_TITLE) this.#books.markNamed(id)

    return {
      conversation,
      messages: opened.messages,
      usage: await usageFor(conversation, this.#options.sessionsRoot, opened.runtime),
    }
  }

  async prompt(id: string, text: string): Promise<void> {
    const conversation = this.#requireConversation(id)
    if (modelFor(this.#modelRuntime(), conversation) === undefined) {
      throw new Error('No model is configured. Add a provider and a model in Settings first.')
    }
    const runtime = await this.#openFor(id)
    await runtime.prompt(text)
  }

  async steer(id: string, text: string): Promise<void> {
    await steerConversation(this.#turnPorts(), id, text)
  }

  async queueMessage(id: string, text: string): Promise<void> {
    await queueMessage(this.#turnPorts(), id, text)
  }

  async cancelQueued(id: string, entryId: string): Promise<void> {
    await cancelQueued(this.#turnPorts(), id, entryId)
  }

  async regenerate(id: string): Promise<void> {
    await regenerate(this.#turnPorts(), id)
    this.#emittedTranscript(id)
  }

  async editMessage(id: string, index: number, text: string, effect: EditEffect): Promise<OpenedConversation> {
    const opened = await editMessage(this.#turnPorts(), id, index, text, effect)
    this.#options.store.rememberConversation(opened.conversation.id)
    if (effect === 'replace') this.#emittedTranscript(id)
    return opened
  }

  async compactConversation(id: string): Promise<boolean> {
    return compactConversation(this.#turnPorts(), id)
  }

  async abort(id: string): Promise<void> {
    // An aborted run leaves nothing to decide, and a promise nobody will answer is a hang.
    this.#approvals.abandon(id, 'The run was stopped before this call was answered.')
    await this.#open.get(id)?.abort()
  }

  rename(id: string, title: string): ConversationSummary {
    return this.#books.rename(id, title)
  }

  /**
   * Deleting means deleting: the transcript directory goes with it, so the conversation is gone
   * from the list and from the disk, not merely hidden from one of them.
   */
  async remove(id: string): Promise<ConversationSummary[]> {
    const conversation = this.#requireConversation(id)
    this.#approvals.abandon(id, 'The conversation was deleted.')
    const runtime = this.#open.get(id)
    if (runtime !== undefined) {
      await runtime.close()
      this.#open.delete(id)
    }
    await deleteSession(sessionLocation(this.#options.sessionsRoot, conversation))
    this.#decisions.forget(id)
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
    return readSessionTranscript(sessionLocation(this.#options.sessionsRoot, conversation), this.#decisions.read(id))
  }

  #turnPorts(): TurnPorts {
    return {
      conversation: (id) => this.#requireConversation(id),
      runtime: (id) => this.#openFor(id),
      register: (conversation) => {
        this.#books.upsert(conversation)
        this.#books.markNamed(conversation.id)
      },
      openConversation: (id) => this.open(id),
      sessionsRoot: this.#options.sessionsRoot,
    }
  }

  /** The window is shown the path as it is now, because an answer it was showing is off it. */
  #emittedTranscript(id: string): void {
    void this.transcriptFor(id).then((messages) =>
      this.#options.emit({ conversationId: id, type: 'transcript_replaced', messages }),
    )
  }

  /** The level in force for one conversation; the gate reads this at the moment of each call. */
  setConversationLevel(id: string, level: PermissionLevel): ConversationSummary {
    return this.#books.upsert(withLevel(this.#requireConversation(id), level))
  }

  /** The level new conversations in a workspace start at. */
  setWorkspaceLevel(workspacePath: string, level: PermissionLevel): void {
    rememberWorkspaceLevel(this.#options.store, workspacePath, level)
  }

  async setConversationModel(id: string, providerId: string, modelId: string): Promise<ConversationSummary> {
    const conversation = this.#requireConversation(id)
    const model = this.#modelRuntime().models.getModel(providerId, modelId)
    if (model === undefined) throw new Error(`${providerId} does not serve ${modelId}`)
    await this.#open.get(id)?.setModel(model)
    return this.#books.upsert({ ...conversation, model: { providerId, modelId }, updatedAt: Date.now() })
  }

  async setThinkingLevel(id: string, level: ThinkingLevel): Promise<ConversationSummary> {
    const conversation = this.#requireConversation(id)
    await this.#open.get(id)?.setThinkingLevel(level)
    return this.#books.upsert({ ...conversation, thinkingLevel: level, updatedAt: Date.now() })
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
    if (opened === undefined) throw new Error('No model is configured. Add a provider and a model in Settings first.')
    return opened
  }

  #requireConversation(id: string): ConversationSummary {
    const conversation = this.#books.find(id)
    if (conversation === undefined) throw new Error(`No conversation ${id}`)
    return conversation
  }

  /**
   * A conversation without a usable model still exists: its transcript stays readable and the
   * composer explains what is missing, rather than the window refusing to open it at all.
   */
  async #tryOpen(options: {
    conversationId?: string
    workspacePath: string
    model?: Model<Api>
    thinkingLevel: ThinkingLevel
    sessionMetadata?: Awaited<ReturnType<typeof findSessionMetadata>>
    emit: (event: RuntimeEvent) => void
  }): Promise<{ runtime?: ConversationRuntime; conversationId: string; messages: OpenedConversation['messages'] }> {
    const modelRuntime = this.#modelRuntime()
    const model = options.model ?? modelRuntime.defaultModel

    if (model === undefined) {
      const transcript =
        options.conversationId === undefined
          ? []
          : await readSessionTranscript({
              sessionsRoot: this.#options.sessionsRoot,
              workspacePath: options.workspacePath,
              conversationId: options.conversationId,
            })
      return { conversationId: options.conversationId ?? crypto.randomUUID(), messages: transcript }
    }

    // Everything that decides how a call got past the gate is restored with the transcript, so a
    // ledger read back after a relaunch says the same thing as the one that was on screen.
    // One map per conversation, and it is the manager's: the gate fills it as calls are decided,
    // and the write callback below persists that same map.
    const decisions =
      options.conversationId === undefined
        ? new Map<string, ApprovalRecord>()
        : this.#decisions.read(options.conversationId)
    let savedAs = options.conversationId ?? ''
    const opened = await ConversationRuntime.open({
      conversationId: options.conversationId,
      workspacePath: options.workspacePath,
      sessionsRoot: this.#options.sessionsRoot,
      modelRuntime,
      model,
      systemPrompt: buildSystemPrompt({ workspacePath: options.workspacePath }),
      sessionMetadata: options.sessionMetadata,
      permissions: this.#permissionPorts(),
      decisions,
      onDecision: () => this.#decisions.write(savedAs, decisions),
      emit: options.emit,
    })
    savedAs = opened.conversationId
    await opened.runtime.setThinkingLevel(options.thinkingLevel)
    return { runtime: opened.runtime, conversationId: opened.conversationId, messages: opened.messages }
  }

  /**
   * The gate reads the level and the rules at the moment of every call, so a change in the header
   * applies to the next call rather than the next conversation.
   */
  #permissionPorts(): PermissionPorts {
    return createPermissionPorts({
      store: this.#options.store,
      levelOf: (id) => this.#books.find(id)?.permissionLevel ?? this.#options.store.read().permissionLevel,
      ask: (id, ask) => this.#approvals.ask(id, ask),
      changed: this.#options.emitRules,
    })
  }

  #modelRuntime(): ModelRuntime {
    return resolveModelRuntime(this.#options.env, () => createProviderModelRuntime(this.#options.providers))
  }
}
