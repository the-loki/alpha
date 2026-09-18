/**
 * The gate: one hook, evaluated for every tool call the harness is about to make. It answers with
 * a decision — run, block, or ask — and leaves a record on the call so the row in the transcript
 * can say afterwards how it got past. A block is not an error: the harness turns it into a tool
 * result the model reads, which is how the agent learns to propose instead of trying again.
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
  toolRiskOf,
} from '@alpha/core'
import { summarizeToolCall } from './tool-call.ts'

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

export interface ToolCallEvent {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

/** What the harness reads: undefined runs the call, a block replaces it with an error result. */
export type GateVerdict = undefined | { block: { reason: string } }

const DENIED_FALLBACK = 'The user denied this call.'

/** What is about to run, in full: a card that truncates the command is asking about something else. */
function toolDetail(toolName: string, args: Record<string, unknown>): string {
  const command = typeof args.command === 'string' ? args.command : undefined
  const path = typeof args.path === 'string' ? args.path : undefined
  if (toolName === 'bash' && command !== undefined) return command
  if (path !== undefined) return path
  return summarizeToolCall(toolName, args)
}

export function createToolGate(ports: GatePorts): (event: ToolCallEvent) => Promise<GateVerdict> {
  return async (event) => {
    const risk = toolRiskOf(event.toolName)
    const decision = evaluateCall({
      level: ports.level(ports.conversationId),
      risk,
      toolName: event.toolName,
      args: event.args,
      conversationId: ports.conversationId,
      workspacePath: ports.workspacePath,
      rules: ports.rules(),
    })

    if (decision.outcome === 'allow') {
      const level = ports.level(ports.conversationId)
      const record: ApprovalRecord =
        decision.by === 'rule' ? { kind: 'rule', level, ruleId: decision.ruleId } : { kind: 'auto', level }
      ports.note(event.toolCallId, record)
      return undefined
    }

    if (decision.outcome === 'block') {
      ports.note(event.toolCallId, {
        kind: 'blocked',
        level: ports.level(ports.conversationId),
        reason: decision.reason,
      })
      return { block: { reason: decision.reason } }
    }

    return askForApproval(ports, event, risk)
  }
}

async function askForApproval(
  ports: GatePorts,
  event: ToolCallEvent,
  risk: ReturnType<typeof toolRiskOf>,
): Promise<GateVerdict> {
  const level = ports.level(ports.conversationId)
  const answer = await ports.ask(ports.conversationId, {
    callId: event.toolCallId,
    toolName: event.toolName,
    risk,
    summary: summarizeToolCall(event.toolName, event.args),
    detail: toolDetail(event.toolName, event.args),
    raw: JSON.stringify(event.args ?? {}),
    diff: changePreview(event.toolName, event.args),
    cwd: ports.workspacePath,
    level,
  })

  if (answer.decision === 'deny') {
    const reason = answer.reason === undefined || answer.reason === '' ? DENIED_FALLBACK : answer.reason
    ports.note(event.toolCallId, { kind: 'denied', level, reason })
    return { block: { reason } }
  }

  if (answer.decision === 'always') {
    const scope: RuleScope = answer.scope ?? 'conversation'
    const rule: PermissionRule = {
      id: crypto.randomUUID(),
      scope,
      conversationId: scope === 'conversation' ? ports.conversationId : '',
      workspacePath: ports.workspacePath,
      toolName: event.toolName,
      pattern: patternOf(event.toolName, event.args) ?? '',
      createdAt: Date.now(),
    }
    ports.remember(rule)
    ports.note(event.toolCallId, { kind: 'always', level, ruleId: rule.id })
    return undefined
  }

  ports.note(event.toolCallId, { kind: 'once', level })
  return undefined
}
