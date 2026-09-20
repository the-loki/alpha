/**
 * Where a conversation's agent runs, and with what. One place knows the answers, because all of
 * them are about the same thing: a person's `pi`, given a workspace to work in, a session to keep,
 * and Alpha's own directory for everything it would otherwise put in `~/.pi`.
 *
 * The session directory is the one earlier Alphas wrote, deliberately: pi names a session's folder
 * after the workspace (`--workspace-path--`), so pointing the agent at the same folder is what lets
 * a conversation that already exists be opened rather than started again.
 */

import type { AgentStatus, ConversationModel, Undef } from '@alpha/core'
import { rpcArgs, rpcEnv } from '../agent-cli/rpc.ts'
import { importLegacySessionIn } from './legacy-sessions.ts'

export interface AgentLocation {
  /** Where the agent is, and whether it is one Alpha can run. */
  status: AgentStatus
  /** Alpha's own directory for the agent: its config, its extensions, its models. */
  directory: string
  /** The session folder for a workspace, under Alpha's sessions root. */
  sessionDirectory: (workspacePath: string) => string
}

/** The agent as the runtime needs it: a program, an environment, and a session to write into. */
export interface AgentProcess {
  file: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

/** pi's own rule for naming a workspace's session folder: what an earlier Alpha already wrote. */
export function sessionDirectoryFor(sessionsRoot: string, workspacePath: string): string {
  const slug = workspacePath.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')
  return `${sessionsRoot}/--${slug}--`
}

/**
 * The command line for one conversation. The name is the conversation's title, so a session opened
 * by the person in pi itself is recognisable there too.
 */
export function agentProcessFor(options: {
  agentPath: string
  agentDirectory: string
  env: NodeJS.ProcessEnv
  workspacePath: string
  sessionsRoot: string
  conversationId: string
  /** The session the conversation is on, or nothing when it is still its own first one. */
  sessionId?: string
  name: string
  /** The model the conversation runs on, when it has one Alpha can still serve (#114). */
  model?: ConversationModel
  /** The credential for that model's provider, as the environment variable it travels in. */
  credential?: NodeJS.ProcessEnv
}): Undef<AgentProcess> {
  if (options.agentPath === '') return undefined
  return {
    file: options.agentPath,
    args: [...sessionArgs(options), ...modelArgs(options.model)],
    cwd: options.workspacePath,
    env: { ...agentEnv(options.env, options.agentDirectory), ...options.credential },
  }
}

/**
 * The environment every agent is started in: the person's own, plus Alpha's settings, plus a `PATH`
 * — a child without one cannot run the agent at all, or anything the agent runs for itself.
 */
export function agentEnv(env: NodeJS.ProcessEnv, agentDirectory: string): NodeJS.ProcessEnv {
  return rpcEnv(withPath(env), agentDirectory)
}

/**
 * The person's `PATH` when they did not hand one over. A child without it cannot run the agent at
 * all — or anything the agent runs for itself — and "the agent is gone" is a poor way to find that
 * out, so the environment Alpha was started in is the floor rather than nothing.
 */
function withPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (env.PATH !== undefined && env.PATH !== '') return env
  return { PATH: process.env.PATH ?? '', ...env }
}

/**
 * Which session to run. The first one is named by Alpha, so the file is the conversation's; a
 * session that came out of a fork is the agent's own and is found by the id it was given.
 */
function sessionArgs(options: {
  sessionsRoot: string
  workspacePath: string
  conversationId: string
  sessionId?: string
  name: string
}): string[] {
  const forked =
    options.sessionId !== undefined && options.sessionId !== '' && options.sessionId !== options.conversationId
  const directory = sessionDirectoryFor(options.sessionsRoot, options.workspacePath)
  // A conversation of the previous Alpha's exists only in a format the agent refuses, so it is
  // copied into one the agent opens — under the conversation's own id — before the agent runs.
  if (!forked) importLegacySessionIn(directory, options.conversationId)
  return rpcArgs({
    sessionsDirectory: directory,
    sessionId: forked ? (options.sessionId ?? '') : options.conversationId,
    name: options.name,
    existing: forked,
  })
}

/** Which model to run, told to the agent rather than looked up by it. */
function modelArgs(model: Undef<ConversationModel>): string[] {
  if (model === undefined || model.modelId === '') return []
  return ['--provider', model.providerId, '--model', model.modelId]
}
