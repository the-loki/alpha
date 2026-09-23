/**
 * The coding tools plugin (ADR-0025): pi-agent-core's four coding tools — read, bash, edit, write — over a
 * `NodeExecutionEnv` rooted at the conversation's workspace, so a relative path lands there and a
 * command runs there. The tools are harness-shaped; the adapter hands the assembled Agent the
 * shape it takes, which is the same tool with one difference in the `execute` arguments: the
 * agent's abort signal sits where the harness tool takes its context, so the adapter drops the
 * signal (the loop carries cancellation through the chord context) and fills the rest itself.
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
import { BACKGROUND_CONTEXT } from '@earendil-works/pi-agent-core/harness/context'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import type { TSchema } from 'typebox'
import type { AlphaPlugin } from './plugin-contract.ts'

/** What the plugin needs: the workspace the conversation works in. */
export interface CodingToolsPorts {
  workspacePath: string
}

/**
 * One invocation identity for the four tools. They never read it — a coding tool is a single
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
    execute: (toolCallId, params, _signal, onUpdate) =>
      tool.execute(toolCallId, params, onUpdate ?? (() => {}), toolContext, NO_INVOCATION, BACKGROUND_CONTEXT),
  }
}

/** The plugin: the four tools in the order the old agent offered them. */
export function createCodingToolsPlugin(ports: CodingToolsPorts): AlphaPlugin {
  const context = toolContext(ports.workspacePath)
  return {
    name: 'coding-tools',
    tools: () => [
      asAgentTool(createReadTool(), context),
      asAgentTool(createBashTool(), context),
      asAgentTool(createEditTool(), context),
      asAgentTool(createWriteTool(), context),
    ],
  }
}
