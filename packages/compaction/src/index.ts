/**
 * Compaction: the decision (what the transcript occupies, what the tail keeps, when folding is
 * due) and the plugin that acts on it — the summary through the model, the rewrite of the live
 * agent, the entry the store takes, the announcement the runtime forwards.
 */
export * from './plugin.ts'
export * from './policy.ts'
