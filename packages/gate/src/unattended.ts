/**
 * Runs with nobody watching, and the one thing that changes because of it: a call that would ask
 * is refused at once, with a reason the agent reads (ADR-0012). Waiting would hold the run open
 * for hours while the card sits in a transcript no one is looking at, and the refusal is counted
 * so the run can report afterwards what it could not do.
 */
import type { Undef } from '@alpha/domain'
import type { ApprovalAnswer } from './gate.ts'

/** What the agent is told when a call needed approval and nobody was there to give it. */
export const UNATTENDED_REFUSAL =
  'Nobody is watching this run, so the call was refused rather than left waiting for an answer. ' +
  'Carry on without it and say what you could not do.'

export class UnattendedRuns {
  /** Conversation ids whose current run has nobody watching, and what each had to refuse. */
  readonly #refusals = new Map<string, number>()

  public start(conversationId: string): void {
    this.#refusals.set(conversationId, 0)
  }

  public finish(conversationId: string): number {
    const count = this.#refusals.get(conversationId) ?? 0
    this.#refusals.delete(conversationId)
    return count
  }

  public watching(conversationId: string): boolean {
    return !this.#refusals.has(conversationId)
  }

  /** The refusal that stands in for an approval card, or nothing when somebody is watching. */
  public refuse(conversationId: string): Undef<ApprovalAnswer> {
    if (this.watching(conversationId)) return undefined
    this.#refusals.set(conversationId, (this.#refusals.get(conversationId) ?? 0) + 1)
    return { decision: 'deny', reason: UNATTENDED_REFUSAL }
  }
}
