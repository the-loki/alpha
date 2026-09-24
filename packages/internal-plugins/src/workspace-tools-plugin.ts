/**
 * The workspace tools plugin (ADR-0025): pi-agent-core's four tools — read, bash, edit, write — over
 * a `NodeExecutionEnv` rooted at the conversation's workspace, so a relative path lands there and a
 * command runs there. Rooted, not contained: what bounds a call is the permission gate, and the
 * name says where the tools stand rather than what Alpha is for.
 *
 * The tools are harness-shaped; the adapter hands the assembled Agent the shape it takes, which is
 * the same tool with one difference in the `execute` arguments: the agent's abort signal sits where
 * the harness tool takes its context, so the adapter puts the signal into that context and fills
 * the rest itself.
 *
 * The plugin is a face and nothing else: `tools()` hands the base the four, and `main` registers
 * it. This package naming pi is the point rather than an accident — a tool *is* an `AgentTool`, so
 * the capability's package is where its adapter belongs (C2.0, C2.8).
 */

import {
  type AgentHarnessTool,
  type AgentHarnessToolInvocation,
  type AgentTool,
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  type ExecutionToolContext,
} from '@earendil-works/pi-agent-core'
import { BACKGROUND_CONTEXT, withAbortSignal } from '@earendil-works/pi-agent-core/harness/context'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import type { TSchema } from 'typebox'

/** What the plugin needs: the workspace the conversation works in. */
export interface WorkspaceToolsPorts {
  workspacePath: string
}

/**
 * One invocation identity for the four tools. They never read it — a workspace tool is a single
 * effect with no durable replay of its own — so the stub is an honest answer rather than a cast.
 */
const NO_INVOCATION: AgentHarnessToolInvocation = {
  invocationId: '',
  operationId: '',
  turnId: '',
  getMemo: async () => undefined,
  setMemo: async () => {},
}

/**
 * The environment every tool runs in: the process's own, floored with a `PATH`. A shell without
 * one cannot run anything — or anything the agent runs for itself — and "the tool failed" is a
 * poor way to find that out, so Alpha's own environment is the floor rather than nothing.
 */
function toolContext(workspacePath: string): ExecutionToolContext {
  return { env: new NodeExecutionEnv({ cwd: workspacePath, shellEnv: withPathFloor(process.env) }) }
}

/** The person's `PATH` when the environment did not hand one over (the rule the child env had). */
function withPathFloor(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (env.PATH !== undefined && env.PATH !== '') return env
  return { PATH: process.env.PATH ?? '', ...env }
}

/** Harness tool → the `AgentTool` the assembled Agent takes: same tool, filled-in arguments. */
function asAgentTool<TParameters extends TSchema, TDetails>(
  tool: AgentHarnessTool<ExecutionToolContext, TParameters, TDetails>,
  toolContext: ExecutionToolContext,
): AgentTool<TParameters, TDetails> {
  return {
    ...tool,
    execute: (toolCallId, params, signal, onUpdate) =>
      tool.execute(
        toolCallId,
        params,
        onUpdate ?? (() => {}),
        toolContext,
        NO_INVOCATION,
        signal === undefined ? BACKGROUND_CONTEXT : withAbortSignal(signal, BACKGROUND_CONTEXT),
      ),
  }
}

/** A plugin that carries one face: what the base needs to hang it on the agent. */
export interface WorkspaceToolsPlugin {
  name: string
  tools: () => AgentTool[]
}

/** The plugin: the four tools in the order the old agent offered them. */
export function createWorkspaceToolsPlugin(ports: WorkspaceToolsPorts): WorkspaceToolsPlugin {
  const context = toolContext(ports.workspacePath)
  return {
    name: 'workspace-tools',
    tools: () => [
      asAgentTool(createReadTool(), context),
      asAgentTool(createBashTool(), context),
      asAgentTool(createEditTool(), context),
      asAgentTool(createWriteTool(), context),
    ],
  }
}
