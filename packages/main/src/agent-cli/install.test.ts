import { describe, expect, it } from 'vitest'
import { commandParts, runInstall } from './install.ts'

describe('[agent] installing it', () => {
  it('runs exactly the command Alpha tells people to run', () => {
    const parts = commandParts('npm install -g --ignore-scripts @earendil-works/pi-coding-agent')

    expect(parts.file).toBe('npm')
    expect(parts.args).toEqual(['install', '-g', '--ignore-scripts', '@earendil-works/pi-coding-agent'])
  })

  it('streams what the command prints while it prints it, and answers with how it ended', async () => {
    const printed: string[] = []

    const result = await runInstall('node --version', (chunk) => printed.push(chunk))

    expect(result.ok).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.output.trim()).toMatch(/^v\d+/)
    expect(printed.join('')).toContain(result.output.trim())
  })

  it('reports a command that failed as a failure, with what it said', async () => {
    // No shell is involved, so arguments are split on spaces only — which is all the install
    // command needs. A command that wanted quoting would need a different bridge, not this one.
    const result = await runInstall('node --no-such-flag-at-all', () => undefined)

    expect(result.ok).toBe(false)
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('bad option')
  })

  it('answers a command that does not exist rather than throwing', async () => {
    const result = await runInstall('alpha-no-such-command-xyz', () => undefined)

    expect(result.ok).toBe(false)
    expect(result.output).not.toBe('')
  })
})
