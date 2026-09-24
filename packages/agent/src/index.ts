/**
 * The agent, as Alpha assembles it: the plugin contract bound to pi (`AlphaPlugin`), the history a
 * run starts from (the session's entries folded into pi's messages), the assembly that turns
 * plugins into a running `Agent`, and the `afterRun` driver that waits a run out and decides
 * whether it is over. The faces themselves are `@alpha/plugin` — pure, so a capability's
 * policy is written against them without pi — and this package is the pi side of the same idea,
 * which is why it is one of the two allowed to name the agent library (C2.0).
 *
 * It is the base rather than a capability: Alpha's own plugins live in `@alpha/internal-plugins`,
 * and `main` holds the registration. `@alpha/agent/testing` carries the scripted provider the
 * runtime's tests stream from.
 */
export * from './after-run.ts'
export * from './assemble-agent.ts'
export * from './failure.ts'
export * from './history.ts'
export * from './plugin-contract.ts'
