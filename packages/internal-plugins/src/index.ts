/**
 * Alpha's own plugins: the four capabilities the agent is assembled from, one file each — the gate
 * on `beforeToolCall`, auto-retry on `afterRun`, the four tools, and compaction. Each is a
 * face plus the decision behind it; where a decision is the workbench's to use as well (the
 * permission ladder and the broker, the retry policy the window's annotation reads), it lives in
 * the library the plugin wraps rather than here.
 *
 * One package rather than one per plugin: the plugin is the unit, and a package may hold several
 * (C2.8). This is one of the two packages allowed to name the agent library (C2.0) — the faces are
 * where pi's own shapes are the capability — so `main` keeps nothing but the registration.
 */

export * from './compaction-plugin.ts'
export * from './compaction-policy.ts'
export * from './gate-plugin.ts'
export * from './mcp-plugin.ts'
export * from './retry-plugin.ts'
export * from './subagents-plugin.ts'
export * from './workspace-tools-plugin.ts'
