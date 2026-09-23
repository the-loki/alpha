/**
 * The gate: one question, asked for every tool call the agent is about to make. It answers with a
 * decision — run, block, or ask — and with the record of how it decided, which is what the row in
 * the transcript shows afterwards. The record travels back with the answer rather than only being
 * written down: the row it belongs to is already on screen, and a conversation whose decisions are
 * not being kept still says how each call got past.
 *
 * A block is not an error: the agent turns it into a tool result the model reads, which is how the
 * agent learns to propose instead of trying again.
 */
import {
  type ApprovalAsk,
  type ApprovalRecord,
  changePreview,
  evaluateCall,
  type PermissionLevel,
  type PermissionRule,
  patternOf,
  type RuleScope,
  recordOf,
  summarizeToolCall,
  toolRiskOf,
} from '@alpha/domain'
import type { PluginToolCall, ToolVerdict } from '@alpha/plugin'

/** What the user answered when the card was put in front of them. */
export interface ApprovalAnswer {
  decision: 'once' | 'always' | 'deny'
  scope?: RuleScope
  reason?: string
}

export interface GatePorts {
  level: (conversationId: string) => PermissionLevel
  rules: () => PermissionRule[]
  conversationId: string
  workspacePath: string
  /** Puts the card in front of the user and resolves when they answer. */
  ask: (conversationId: string, request: ApprovalAsk) => Promise<ApprovalAnswer>
  /** Persists a rule the answer asked for, and returns it. */
  remember: (rule: PermissionRule) => void
  /** Keeps the decision so the translator can stamp the row it belongs to. */
  note: (callId: string, record: ApprovalRecord) => void
}

/**
 * What the agent is told: a block replaces the call with an error result carrying the reason, in
 * Alpha's words. The record is what the ledger row shows — the block itself is the base's verdict,
 * because a gate is a face on the plugin base like any other (C2.8).
 */
export type GateVerdict = ToolVerdict & { record: ApprovalRecord }

const DENIED_FALLBACK = 'The user denied this call.'

/** What is about to run, in full: a card that truncates the command is asking about something else. */
function toolDetail(toolName: string, args: Record<string, unknown>): string {
  const command = typeof args.command === 'string' ? args.command : undefined
  const path = typeof args.path === 'string' ? args.path : undefined
  if (toolName === 'bash' && command !== undefined) return command
  if (path !== undefined) return path
  return summarizeToolCall(toolName, args)
}

/**
 * The gate as the base hands it a call: the arguments are read as a record, because that is what
 * every judgement below needs — a tool call whose arguments are not a record is a call no tool
 * could run either.
 */
export function createToolGate(ports: GatePorts): (call: PluginToolCall) => Promise<GateVerdict> {
  return async (call) => {
    const args = recordOf(call.args)
    const risk = toolRiskOf(call.toolName)
    const decision = evaluateCall({
      level: ports.level(ports.conversationId),
      risk,
      toolName: call.toolName,
      args,
      conversationId: ports.conversationId,
      workspacePath: ports.workspacePath,
      rules: ports.rules(),
    })

    if (decision.outcome === 'allow') {
      const level = ports.level(ports.conversationId)
      const record: ApprovalRecord =
        decision.by === 'rule' ? { kind: 'rule', level, ruleId: decision.ruleId } : { kind: 'auto', level }
      ports.note(call.toolCallId, record)
      return { record }
    }

    if (decision.outcome === 'block') {
      const record: ApprovalRecord = {
        kind: 'blocked',
        level: ports.level(ports.conversationId),
        reason: decision.reason,
      }
      ports.note(call.toolCallId, record)
      return { block: { reason: decision.reason }, record }
    }

    return askForApproval(ports, call, args, risk)
  }
}

async function askForApproval(
  ports: GatePorts,
  call: PluginToolCall,
  args: Record<string, unknown>,
  risk: ReturnType<typeof toolRiskOf>,
): Promise<GateVerdict> {
  const level = ports.level(ports.conversationId)
  const answer = await ports.ask(ports.conversationId, {
    callId: call.toolCallId,
    toolName: call.toolName,
    risk,
    summary: summarizeToolCall(call.toolName, args),
    detail: toolDetail(call.toolName, args),
    raw: JSON.stringify(args),
    diff: changePreview(call.toolName, args),
    cwd: ports.workspacePath,
    level,
  })

  if (answer.decision === 'deny') {
    const reason = answer.reason === undefined || answer.reason === '' ? DENIED_FALLBACK : answer.reason
    const record: ApprovalRecord = { kind: 'denied', level, reason }
    ports.note(call.toolCallId, record)
    return { block: { reason }, record }
  }

  if (answer.decision === 'always') {
    const scope: RuleScope = answer.scope ?? 'conversation'
    const rule: PermissionRule = {
      id: crypto.randomUUID(),
      scope,
      conversationId: scope === 'conversation' ? ports.conversationId : '',
      workspacePath: ports.workspacePath,
      toolName: call.toolName,
      pattern: patternOf(call.toolName, args) ?? '',
      createdAt: Date.now(),
    }
    ports.remember(rule)
    const record: ApprovalRecord = { kind: 'always', level, ruleId: rule.id }
    ports.note(call.toolCallId, record)
    return { record }
  }

  const once: ApprovalRecord = { kind: 'once', level }
  ports.note(call.toolCallId, once)
  return { record: once }
}
