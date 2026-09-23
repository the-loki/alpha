/**
 * The stdio frame: a child process speaking newline-delimited JSON-RPC on its standard input and
 * output, which is how an MCP server runs on this machine. Its environment is the workbench's with
 * the configured variables on top, so a server that needs a `PATH` gets Alpha's and one that was
 * handed a variable does not lose everything else.
 *
 * What the child said on standard error is kept: a server that dies at startup usually explains
 * itself there, and "the server exited" on its own is a poor way to find out why.
 */

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { FrameHandlers, McpFrame } from './session.ts'

export interface StdioServer {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export function stdioFrame(server: StdioServer, handlers: FrameHandlers): McpFrame {
  const child = spawn(server.command, server.args ?? [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...(server.env ?? {}) },
  })
  let said = ''
  createInterface({ input: child.stdout }).on('line', (line) => {
    if (line.trim() !== '') handlers.message(line)
  })
  createInterface({ input: child.stderr }).on('line', (line) => {
    said = line.trim() === '' ? said : line.trim()
  })
  const gone = (why: string): void => handlers.closed(said === '' ? why : `${why}: ${said}`)
  child.on('error', (error) => gone(`the MCP server could not start (${error.message})`))
  child.on('exit', (code, signal) =>
    gone(signal === null ? `the MCP server exited (code ${code})` : `the MCP server was killed (${signal})`),
  )

  return {
    send: (text) =>
      new Promise<void>((resolve, reject) => {
        child.stdin.write(`${text}\n`, (error) => {
          if (error === null || error === undefined) resolve()
          else reject(error)
        })
      }),
    close: () => {
      child.stdin.end()
      child.kill()
    },
  }
}
