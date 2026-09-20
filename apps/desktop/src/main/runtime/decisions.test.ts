import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DecisionLog } from './decisions.ts'

const fresh = () => new DecisionLog(mkdtempSync(join(tmpdir(), 'alpha-decisions-')))

describe('[runtime] DecisionLog', () => {
  it('opens holding what was decided before, and nothing for a conversation it never saw', () => {
    const log = fresh()
    expect(log.opened('c1').get('call-1')).toBeUndefined()

    log.opened('c1').note('call-1', { kind: 'auto', level: 'full-access' })
    expect(log.opened('c1').get('call-1')).toEqual({ kind: 'auto', level: 'full-access' })
    // Another conversation's decisions are its own.
    expect(log.opened('c2').get('call-1')).toBeUndefined()
  })

  it('writes each note through as it is made, so a relaunch keeps it', () => {
    // The gate notes a decision mid-call and the process may die a second later; the file is the
    // only thing that survives it, and the ledger is what keeps the two in step.
    const directory = mkdtempSync(join(tmpdir(), 'alpha-decisions-'))
    const log = new DecisionLog(directory)
    const ledger = log.opened('c1')
    ledger.note('call-1', { kind: 'denied', level: 'plan', reason: 'no' })

    const onDisk = JSON.parse(readFileSync(join(directory, 'decisions', 'c1.json'), 'utf-8'))
    expect(onDisk.decisions['call-1']).toEqual({ kind: 'denied', level: 'plan', reason: 'no' })
    expect(ledger.get('call-1')).toEqual({ kind: 'denied', level: 'plan', reason: 'no' })
  })

  it('drops the records it cannot read rather than the whole file', () => {
    // Hand-write a file with one good entry and two that are not decisions.
    const directory = mkdtempSync(join(tmpdir(), 'alpha-decisions-'))
    const log = new DecisionLog(directory)
    log.opened('c1').note('good', { kind: 'denied', level: 'plan', reason: 'no' })
    const path = join(directory, 'decisions', 'c1.json')
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    parsed.decisions.bad = { kind: 'whatever', level: 'ask' }
    parsed.decisions.worse = { kind: 'once', level: 'not-a-level' }
    writeFileSync(path, JSON.stringify(parsed))

    const ledger = log.opened('c1')
    const good = ledger.get('good')
    expect(good).toEqual({ kind: 'denied', level: 'plan', reason: 'no' })
    expect(ledger.get('bad')).toBeUndefined()
    expect(ledger.get('worse')).toBeUndefined()
  })

  it('forgets a conversation, and survives being asked to forget one twice', () => {
    const directory = mkdtempSync(join(tmpdir(), 'alpha-decisions-'))
    const log = new DecisionLog(directory)
    log.opened('c1').note('call-1', { kind: 'auto', level: 'accept-edits' })
    expect(existsSync(join(directory, 'decisions', 'c1.json'))).toBe(true)

    log.forget('c1')
    log.forget('c1')
    expect(existsSync(join(directory, 'decisions', 'c1.json'))).toBe(false)
    expect(log.opened('c1').get('call-1')).toBeUndefined()
  })

  it('does not throw when the note cannot be written', () => {
    // A directory path that is actually a file: mkdir fails, and the gate is mid-call.
    const blocked = mkdtempSync(join(tmpdir(), 'alpha-decisions-'))
    writeFileSync(join(blocked, 'decisions'), 'not a directory')
    const log = new DecisionLog(blocked)

    expect(() => log.opened('c1').note('call-1', { kind: 'auto', level: 'ask' })).not.toThrow()
    expect(log.opened('c1').get('call-1')).toBeUndefined()
  })

  it('never writes outside its own directory, whatever it is handed as an id', () => {
    const directory = mkdtempSync(join(tmpdir(), 'alpha-decisions-'))
    const log = new DecisionLog(directory)
    log.opened('../../escape').note('call-1', { kind: 'auto', level: 'ask' })
    expect(existsSync(join(directory, 'decisions', 'unknown.json'))).toBe(true)
  })
})
