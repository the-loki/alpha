/**
 * Calls waiting on a person. The gate asks; this holds the promise until the window answers, and
 * makes sure nothing is left waiting when the conversation it belongs to goes away.
 */
import type { ApprovalAsk, ApprovalRequest, RuntimeEvent } from '@alpha/domain'
import type { ApprovalAnswer } from './gate.ts'

interface Waiting {
  conversationId: string
  callId: string
  resolve: (answer: ApprovalAnswer) => void
}

export class ApprovalBroker {
  readonly #emit: (event: RuntimeEvent) => void
  readonly #waiting = new Map<string, Waiting>()

  public constructor(ports: { emit: (event: RuntimeEvent) => void }) {
    this.#emit = ports.emit
  }

  /** Puts the question to the window and resolves when the user answers it. */
  public ask(conversationId: string, ask: ApprovalAsk): Promise<ApprovalAnswer> {
    const request: ApprovalRequest = { ...ask, requestId: crypto.randomUUID(), requestedAt: Date.now() }
    return new Promise<ApprovalAnswer>((resolve) => {
      this.#waiting.set(request.requestId, { conversationId, callId: ask.callId, resolve })
      this.#emit({ conversationId, type: 'approval_requested', request })
    })
  }

  public answer(conversationId: string, requestId: string, answer: ApprovalAnswer): void {
    const waiting = this.#waiting.get(requestId)
    if (waiting === undefined || waiting.conversationId !== conversationId) return
    this.#settle(requestId, waiting, answer)
  }

  /** A conversation that closed, failed, or was aborted has nothing left to wait for. */
  public abandon(conversationId: string, reason: string): void {
    for (const [requestId, waiting] of [...this.#waiting]) {
      if (waiting.conversationId === conversationId) this.#settle(requestId, waiting, { decision: 'deny', reason })
    }
  }

  #settle(requestId: string, waiting: Waiting, answer: ApprovalAnswer): void {
    this.#waiting.delete(requestId)
    this.#emit({
      conversationId: waiting.conversationId,
      type: 'approval_decided',
      requestId,
      callId: waiting.callId,
      decision: answer.decision,
      scope: answer.scope,
      reason: answer.reason,
    })
    waiting.resolve(answer)
  }
}
