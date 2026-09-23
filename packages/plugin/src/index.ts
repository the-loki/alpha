/**
 * The plugin base, as Alpha states it: the vocabulary of a face — a tool call and the verdict about
 * it, how a run turned out, the retry policy's decision — and the rules that turn faces in assembly
 * order into one decision, one rule per face that has more than one hook.
 *
 * Pure, so the policy half of a capability lives and is tested in a library, with the pi-shaped
 * adapter that attaches it to the agent left in `main` (C2.8).
 */
export * from './compose.ts'
export * from './faces.ts'
