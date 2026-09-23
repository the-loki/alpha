/**
 * Runs with nobody watching (ADR-0012): a scheduled task's turn, and the refusals its gate had to
 * hand out. The watching is what makes a refusal a refusal — with nobody there, a call the gate
 * would have asked about is denied instead — so it has to be on for as long as the run is in
 * flight, and what it counted has to be read before the run ends, or the answer would always be
 * zero.
 *
 * The manager keeps the state and this file keeps the two rules that go with it: which questions
 * become refusals, and what a run that threw still owes the count.
 */

import type { ApprovalAsk } from '@alpha/domain'
import type { ApprovalAnswer, ApprovalBroker, UnattendedRuns } from '@alpha/gate'

/** A question nobody is there to answer becomes a refusal, or a card when somebody is. */
export function askOrRefuse(
  unattended: UnattendedRuns,
  approvals: ApprovalBroker,
  id: string,
  ask: ApprovalAsk,
): Promise<ApprovalAnswer> {
  const refusal = unattended.refuse(id)
  return refusal === undefined ? approvals.ask(id, ask) : Promise.resolve(refusal)
}

/** What one unattended turn needs of the conversation it runs in. */
export interface UnattendedPorts {
  unattended: UnattendedRuns
  /** Sends the turn's message. */
  prompt: (id: string, text: string) => Promise<void>
  /** Waits the run out: the watching ends when the run does. */
  settle: (id: string) => Promise<void>
}

/** One turn nobody is watching, answered with how many calls its gate had to refuse. */
export async function runUnattended(ports: UnattendedPorts, id: string, text: string): Promise<number> {
  ports.unattended.start(id)
  try {
    await ports.prompt(id, text)
    await ports.settle(id)
  } catch (error) {
    // A run that threw still stops being watched, and the caller hears about the failure.
    ports.unattended.finish(id)
    throw error
  }
  return ports.unattended.finish(id)
}
