/**
 * Opening a conversation's runtime (ADR-0025): the session's history is imported where it is
 * legacy, read off the store, and handed to the assembly with the conversation's model — which is
 * how an old conversation keeps talking where it left off. There is nothing to find or spawn, so
 * opening always succeeds; what may be missing is a model, and a runtime without one can still be
 * read, forked and closed even though it cannot run.
 */

import { readFileSync } from 'node:fs'
import type { AlphaPlugin } from '@alpha/agent'
import { assembleAgentWithHost, createPluginHost, historyOf, type PluginHost } from '@alpha/agent'
import type { ApprovalRecord, ConversationSummary, RuntimeEvent, Undef } from '@alpha/domain'
import type { PermissionPorts } from '@alpha/gate'
import {
  createCompactionPlugin,
  createGatePlugin,
  createMcpPlugin,
  createRetryPlugin,
  createSubagentsPlugin,
  createWorkspaceToolsPlugin,
} from '@alpha/internal-plugins'
import type { McpServers } from '@alpha/mcp'
import type { RetryDecider } from '@alpha/plugin'
import { modelFor, type ProviderStore } from '@alpha/providers'
import {
  type DecisionLedger,
  importLegacySessionIn,
  type SessionStore,
  sessionDirectoryFor,
  sessionIdOf,
  tipPath,
  type WorkspaceChangeLog,
} from '@alpha/sessions'
import type { Agent, CompactionSettings } from '@earendil-works/pi-agent-core'
import type { Api, Model, Models } from '@earendil-works/pi-ai'
import { ConversationRuntime } from './conversation-runtime.ts'
import { createModelRuntime } from './model-runtime.ts'
import { type ReadTextFile, systemPromptFor } from './system-prompt.ts'

/** A workspace file's text, or nothing when it is not there: what the system prompt reads. */
const readTextFile: ReadTextFile = async (path) => {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return undefined
  }
}

/** What opening needs: the conversation, the store behind it, the providers, and the window. */
export interface OpenRuntimeOptions {
  conversation: ConversationSummary
  sessions: SessionStore
  providers: ProviderStore
  /** Where the session files live, which the legacy import reads. */
  sessionsRoot: string
  /** Builds the model runtime an open conversation dials with; tests script one. */
  models?: () => Models
  /** The conversation's ledger: it keeps the gate's decisions, and reads them for the rows. */
  decisions: DecisionLedger
  /** The gate's reach into the workbench, required for every assembled agent. */
  permissions: () => PermissionPorts
  /**
   * The MCP servers this workbench run holds, when it has any: one hub for the run, connected by
   * `main`, whose tools join the agent's own. Absent means this workbench reaches no server.
   */
  mcp?: McpServers
  /** The compaction thresholds, when the caller shrinks them; the defaults are the library's. */
  compactionSettings?: CompactionSettings
  /** The retry backoff, when the caller shrinks it; the default is two retries at 2s and 8s. */
  retryDelays?: number[]
  changes?: WorkspaceChangeLog
  emit: (event: RuntimeEvent) => void
}

/** Builds the model runtime: one provider per configured entry, the key answered from the vault. */
function modelRuntime(options: OpenRuntimeOptions): Models {
  const build = options.models
  if (build !== undefined) return build()
  return createModelRuntime({
    providers: options.providers.list(),
    credential: (id) => options.providers.credential(id),
  })
}

/** The configured choice or default, only when this runtime serves that exact model. */
function modelForConversation(options: OpenRuntimeOptions, models: Models): Undef<Model<Api>> {
  const chosen = modelFor(options.providers, options.conversation)
  if (chosen === undefined) return undefined
  return models.getModel(chosen.providerId, chosen.modelId)
}

/** The plugins and the two policy handles an opening hands the runtime. */
export interface AssembledPlugins {
  plugins: AlphaPlugin[]
  /** The compaction plugin's on-demand path, which the runtime's `compact` calls. */
  compact: () => Promise<boolean>
  /** The retry plugin's pure decision, which the runtime reads when annotating an `agent_end`. */
  retry: RetryDecider
}

/**
 * The plugins every real conversation is assembled from: the workspace tools always, the MCP
 * servers' tools when this run holds any, the gate, then compaction, auto-retry and the subagents.
 *
 * It is written as two lists, and which one a capability goes in is what decides whether a subagent
 * sees it. `shared` is what the run and every child it hands work to are both made of — a
 * capability's tools, and the blocks that stand in front of them — and `shared` is what the
 * subagents plugin is given, so a child is built out of what came before it and never out of
 * itself. The after-run half (compaction, retry, the `task` tool) stays out of `shared`, because it
 * belongs to the conversation that is running: `@alpha/internal-plugins` says as much for its own
 * face, and the registry never lists `task` for a subagent either, so no child can hand work on.
 *
 * This is the one place a capability is registered (C2.8): a feature that needs to be wired
 * somewhere else to reach the agent has not found its face yet.
 * The policies read the conversation through getters — the agent does not exist yet at assembly,
 * and the model and the session both move under a long-lived conversation.
 */
function pluginsFor(
  options: OpenRuntimeOptions,
  session: { id: string; workspacePath: string },
  models: Models,
  agent: () => Undef<Agent>,
  announce: (callId: string, record: ApprovalRecord) => void,
): AssembledPlugins {
  const shared: AlphaPlugin[] = [createWorkspaceToolsPlugin({ workspacePath: session.workspacePath })]
  if (options.mcp !== undefined) shared.push(createMcpPlugin({ servers: options.mcp }))
  shared.push(
    createGatePlugin({
      conversationId: options.conversation.id,
      workspacePath: session.workspacePath,
      permissions: options.permissions(),
      note: (callId, record) => options.decisions.note(callId, record),
      onDecided: announce,
    }),
  )
  const compaction = createCompactionPlugin({
    conversationId: options.conversation.id,
    workspacePath: session.workspacePath,
    sessionId: () => agent()?.sessionId ?? session.id,
    store: options.sessions,
    models,
    agent,
    model: () => agent()?.state.model,
    onCompacted: (compacted) =>
      options.emit({ conversationId: options.conversation.id, type: 'history_compacted', ...compacted }),
    ...(options.compactionSettings === undefined ? {} : { settings: options.compactionSettings }),
  })
  const retry = createRetryPlugin(options.retryDelays === undefined ? {} : { delays: options.retryDelays })
  const subagents = createSubagentsPlugin({
    plugins: () => shared,
    models,
    model: () => agent()?.state.model,
    systemPrompt: async (subagent) =>
      `${await systemPromptFor(session.workspacePath, readTextFile)}\n\n${subagent.prompt}`,
  })
  return { plugins: [...shared, compaction, retry, subagents], compact: () => compaction.compact(), retry }
}

/** The assembled agent, or nothing when no model is configured: then nothing can run. */
async function assembleFor(
  options: OpenRuntimeOptions,
  session: { id: string; workspacePath: string },
  models: Models,
  model: Model<Api>,
  host: PluginHost,
): Promise<Agent> {
  const history = options.sessions.entries(session.id, session.workspacePath)
  return assembleAgentWithHost({
    models,
    model,
    host,
    systemPrompt: await systemPromptFor(session.workspacePath, readTextFile),
    messages: historyOf(tipPath(history.entries, history.leafId)),
    thinkingLevel: options.conversation.thinkingLevel,
    sessionId: session.id,
  }).agent
}

/** The runtime for a conversation, ready to prompt, steer, fork, or just be read. */
export async function openRuntime(options: OpenRuntimeOptions): Promise<ConversationRuntime> {
  const conversation = options.conversation
  const session = { id: sessionIdOf(conversation), workspacePath: conversation.workspacePath }
  // A conversation of the previous Alpha's is imported one way before its directory is read, so
  // the store finds it under the conversation's own id (the same call the spawn path used to make).
  if (session.id === conversation.id) {
    importLegacySessionIn(sessionDirectoryFor(options.sessionsRoot, conversation.workspacePath), conversation.id)
  }
  const models = modelRuntime(options)
  const model = modelForConversation(options, models)
  // The runtime does not exist until the plugins do, so the gate's announcements are bound here
  // and travel the rest of the way through it. The policies read the agent through a cell, which
  // the assembly fills in below.
  let runtime: Undef<ConversationRuntime>
  let agent: Undef<Agent>
  const policies = pluginsFor(
    options,
    session,
    models,
    () => agent,
    (callId, approval) => runtime?.decided(callId, approval),
  )
  const host = createPluginHost(policies.plugins)
  const assembled = model === undefined ? undefined : await assembleFor(options, session, models, model, host)
  agent = assembled
  runtime = new ConversationRuntime({
    conversationId: conversation.id,
    agent: assembled,
    models,
    session,
    store: options.sessions,
    plugins: policies.plugins,
    host,
    compact: policies.compact,
    retry: policies.retry,
    changes: options.changes,
    emit: options.emit,
  })
  return runtime
}
