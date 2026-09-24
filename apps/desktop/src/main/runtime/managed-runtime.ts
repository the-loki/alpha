import {
  type ConversationModel,
  type ConversationSummary,
  type ModelIndex,
  type PermissionRule,
  type RuntimeEvent,
  servesModel,
  type TurnRefusal,
} from '@alpha/domain'
import type { PermissionPorts } from '@alpha/gate'
import type { McpServers } from '@alpha/mcp'
import type { ProviderStore } from '@alpha/providers'
import type { AgentPorts, DecisionLedger, SessionStore, WorkspaceChangeLog } from '@alpha/sessions'
import type { StateStore } from '@alpha/state'
import type { CompactionSettings } from '@earendil-works/pi-agent-core'
import type { Models } from '@earendil-works/pi-ai'
import { openRuntime } from './assemble-runtime.ts'
import type { ConversationRuntime } from './conversation-runtime.ts'

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

/** Assembles one managed conversation with the workbench's current providers and permissions. */
export async function openManagedRuntime(
  options: RuntimeManagerOptions,
  conversation: ConversationSummary,
  sessions: SessionStore,
  decisions: DecisionLedger,
  changes: WorkspaceChangeLog,
  permissions: () => PermissionPorts,
  emit: (event: RuntimeEvent) => void,
): Promise<ConversationRuntime> {
  return openRuntime({
    conversation,
    mcp: await options.mcp?.(),
    sessions,
    sessionsRoot: options.sessionsRoot,
    providers: options.providers,
    models: options.models,
    compactionSettings: options.compactionSettings,
    retryDelays: options.retryDelays,
    decisions,
    changes,
    permissions,
    emit,
  })
}

/** Tracks the model definitions each open runtime was built with and coalesces a refresh. */
export class RuntimeRefresh {
  private readonly atLaunch = new WeakMap<ConversationRuntime, ModelIndex>()
  private readonly pending = new Map<string, Promise<ConversationRuntime>>()

  public note(runtime: ConversationRuntime, index: ModelIndex): void {
    this.atLaunch.set(runtime, index)
  }

  public isCurrent(runtime: ConversationRuntime, index: ModelIndex): boolean {
    return this.atLaunch.get(runtime) === index
  }

  /** A model choice changes the running agent only when it still has the current provider catalog. */
  public async chooseModel(
    conversation: ConversationSummary,
    providerId: string,
    modelId: string,
    ports: {
      providers: ProviderStore
      opened?: ConversationRuntime
      refused: (refusal: TurnRefusal) => void
      update: (model: ConversationModel) => ConversationSummary
    },
  ): Promise<ConversationSummary> {
    const index = ports.providers.index()
    if (!servesModel(index, { providerId, modelId })) {
      ports.refused({ kind: 'model-not-served', providerId, modelId })
      return conversation
    }
    if (ports.opened !== undefined && this.isCurrent(ports.opened, index)) {
      if (conversation.model === undefined || !servesModel(index, conversation.model)) {
        this.atLaunch.delete(ports.opened)
      } else if (!(await ports.opened.setModel(providerId, modelId))) {
        return conversation
      }
    }
    return ports.update({ providerId, modelId })
  }

  public async forPrompt(
    id: string,
    opened: () => Promise<ConversationRuntime>,
    index: () => ModelIndex,
    reopen: (stale: ConversationRuntime) => Promise<ConversationRuntime>,
  ): Promise<ConversationRuntime> {
    const pending = this.pending.get(id)
    if (pending !== undefined) return pending
    const runtime = await opened()
    const started = this.pending.get(id)
    if (started !== undefined) return started
    if (this.isCurrent(runtime, index())) return runtime
    const refresh = (async () => {
      await runtime.settle()
      await runtime.close()
      return reopen(runtime)
    })()
    this.pending.set(id, refresh)
    try {
      return await refresh
    } finally {
      this.pending.delete(id)
    }
  }
}
