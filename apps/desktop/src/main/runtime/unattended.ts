/**
 * Runs with nobody watching (ADR-0012): the question a scheduled task's turn has to answer, and
 * the refusals its gate had to hand out. The watching is what makes a refusal a refusal — with
 * nobody there, a call the gate would have asked about is denied instead — so it has to be on for
 * as long as the run is in flight, and what it counted has to be read before the run ends, or the
 * answer would always be zero.
 *
 * The manager keeps the state and the length of that window (`runUnattended`); this file keeps the
 * one rule that goes with it: which questions become refusals. A rule that lives in `main` is not
 * a seam (C4.2 lists four, and this is none of them), so there is no `unattended.test.ts`: the
 * rule is tested where it is reachable, through the runtime the manager hands it.
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
