/**
 * The tools a conversation can reach for: read, write, edit, and the shell, all rooted at the
 * workspace through one execution environment. Registration is a list, so adding a tool is one
 * entry and a risk class in core rather than a change in three files.
 */
import {
  type AgentHarnessTool,
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  type ExecutionToolContext,
} from '@earendil-works/pi-agent-core'

export type WorkspaceTool = AgentHarnessTool<ExecutionToolContext>

export function createWorkspaceTools(): WorkspaceTool[] {
  return [
    createReadTool<ExecutionToolContext>(),
    createWriteTool<ExecutionToolContext>(),
    createEditTool<ExecutionToolContext>(),
    createBashTool<ExecutionToolContext>(),
  ]
}

export function workspaceToolNames(): string[] {
  return createWorkspaceTools().map((tool) => tool.name)
}
