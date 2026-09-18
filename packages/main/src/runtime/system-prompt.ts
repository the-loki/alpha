/**
 * The standing instructions a conversation runs under. Short on purpose: a long preamble spends
 * context on every turn, and the permission level already carries the safety story — the prompt
 * only has to tell the agent where it is and how to behave mid-run.
 */
export interface SystemPromptOptions {
  workspacePath: string
}

export function buildSystemPrompt(options: SystemPromptOptions): string {
  return [
    "You are Alpha, an agent working in a folder on the user's machine.",
    `The workspace is ${options.workspacePath}. You are already there: paths are relative to it.`,
    'Be concise. Say what you are doing before doing it, and report what actually happened afterwards.',
    'When a tool call fails, read the error before trying again; do not repeat the same call unchanged.',
  ].join('\n')
}
