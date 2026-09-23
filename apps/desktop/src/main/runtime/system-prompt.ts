/**
 * Alpha's system prompt: who the agent is, the workspace it works in, and the workspace's own
 * instructions when it carries them — AGENTS.md, with CLAUDE.md as the fallback. The file system
 * is injected as a reader, so the prompt stays a pure function of the workspace.
 */

import { join } from 'node:path'
import type { Undef } from '@alpha/domain'

/** Reads one file's text, answering nothing when it does not exist. */
export type ReadTextFile = (path: string) => Promise<Undef<string>>

const IDENTITY = 'You are a coding agent working inside a workspace on this machine.'

/** The workspace's instruction file: AGENTS.md, with CLAUDE.md when there is no AGENTS.md. */
async function instructionsFor(workspacePath: string, readFile: ReadTextFile): Promise<Undef<string>> {
  const agents = await readFile(join(workspacePath, 'AGENTS.md'))
  if (agents !== undefined) return agents
  return readFile(join(workspacePath, 'CLAUDE.md'))
}

/** Builds the prompt for one workspace: identity, the path, its instructions when present. */
export async function systemPromptFor(workspacePath: string, readFile: ReadTextFile): Promise<string> {
  const lines = [IDENTITY, `Workspace: ${workspacePath}`]
  const instructions = await instructionsFor(workspacePath, readFile)
  if (instructions !== undefined) lines.push('', instructions)
  return lines.join('\n')
}
