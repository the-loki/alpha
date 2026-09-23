/**
 * The coding tools: pi-agent-core's four — read, bash, edit, write — over a `NodeExecutionEnv`
 * rooted at the conversation's workspace, hung on the plugin base as a capability (C2.8).
 *
 * This is the one kind of package that names the agent library: a tool is an `AgentTool`, so the
 * capability's own package is where its adapter lives and `main` holds nothing but the
 * registration.
 */
export * from './coding-tools.ts'
