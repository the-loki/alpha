/**
 * Running the install command for the person, on their behalf but not behind their back: Alpha
 * shows the command before it runs it, streams what the command says while it says it, and answers
 * with how it ended. No shell profile is edited, nothing is run as another user, and the command
 * is the one pi's own documentation gives.
 */

import { spawn } from 'node:child_process'

export interface InstallResult {
  ok: boolean
  exitCode: number
  /** Everything the command printed, for the moment the window stops watching it. */
  output: string
}

/** The documented command, split into the program and its arguments. */
export function commandParts(command: string): { file: string; args: string[] } {
  const [file = '', ...args] = command.trim().split(/\s+/)
  return { file, args }
}

/**
 * Runs the command and streams it. A command that fails is a result, not an exception: a failed
 * install is a sentence in the window, and the window has to survive it either way.
 */
export function runInstall(command: string, onOutput: (chunk: string) => void): Promise<InstallResult> {
  const { file, args } = commandParts(command)
  return new Promise((settle) => {
    const child = spawn(file, args, {
      // `npm` is a shell script on Windows, where the shell is the only way to run it.
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let output = ''
    const collect = (chunk: Buffer): void => {
      const text = chunk.toString()
      output += text
      onOutput(text)
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.on('error', (error) => settle({ ok: false, exitCode: 127, output: `${output}${error.message}` }))
    child.on('close', (code) => settle({ ok: code === 0, exitCode: code ?? 1, output }))
  })
}
