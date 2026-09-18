import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DecisionLog } from './decisions.ts'

const fresh = () => new DecisionLog(mkdtempSync(join(tmpdir(), 'alpha-decisions-')))

describe('[runtime] DecisionLog', () => {
  it('reads back what it wrote, and nothing for a conversation it never saw', () => {
    const log = fresh()
    expect(log.read('c1').size).toBe(0)

    log.write('c1', new Map([['call-1', { kind: 'auto', level: 'full-access' }]]))
    expect(log.read('c1').get('call-1')).toEqual({ kind: 'auto', level: 'full-access' })
    // Another conversation's decisions are its own.
    expect(log.read('c2').size).toBe(0)
  })

  it('drops the records it cannot read rather than the whole file', () => {
    // Hand-write a file with one good entry and two that are not decisions.
    const directory = mkdtempSync(join(tmpdir(), 'alpha-decisions-'))
    const log = new DecisionLog(directory)
    log.write('c1', new Map([['good', { kind: 'denied', level: 'plan', reason: 'no' }]]))
    const path = join(directory, 'decisions', 'c1.json')
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    parsed.decisions.bad = { kind: 'whatever', level: 'ask' }
    parsed.decisions.worse = { kind: 'once', level: 'not-a-level' }
    writeFileSync(path, JSON.stringify(parsed))

    const read = log.read('c1')
    expect([...read.keys()]).toEqual(['good'])
    expect(read.get('good')).toEqual({ kind: 'denied', level: 'plan', reason: 'no' })
  })

  it('forgets a conversation, and survives being asked to forget one twice', () => {
    const directory = mkdtempSync(join(tmpdir(), 'alpha-decisions-'))
    const log = new DecisionLog(directory)
    log.write('c1', new Map([['call-1', { kind: 'auto', level: 'accept-edits' }]]))
    expect(existsSync(join(directory, 'decisions', 'c1.json'))).toBe(true)

    log.forget('c1')
    log.forget('c1')
    expect(existsSync(join(directory, 'decisions', 'c1.json'))).toBe(false)
    expect(log.read('c1').size).toBe(0)
  })

  it('never writes outside its own directory, whatever it is handed as an id', () => {
    const directory = mkdtempSync(join(tmpdir(), 'alpha-decisions-'))
    const log = new DecisionLog(directory)
    log.write('../../escape', new Map([['call-1', { kind: 'auto', level: 'ask' }]]))
    expect(existsSync(join(directory, 'decisions', 'unknown.json'))).toBe(true)
  })
})
