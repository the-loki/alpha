/**
 * The gate: what a permission level allows and what it asks about, the broker that holds a
 * question until the window answers it, the refusal a run with nobody watching gets instead of a
 * wait (ADR-0012), the ports that reach the workbench's own file for the level in force and the
 * rules it has remembered, and the plugin face that hangs all of it on the agent.
 */
export * from './approvals.ts'
export * from './gate.ts'
export * from './permissions.ts'
export * from './plugin.ts'
export * from './unattended.ts'
