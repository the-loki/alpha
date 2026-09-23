/**
 * The subagent policy, without an agent: what the workbench ships, whom a name means, which tools a
 * subagent may reach for, how many turns it gets, and the two sentences the model reads — what it
 * may hand over, and what it hears when it names something that is not there.
 *
 * The registry is code rather than a file, because there is no panel that would edit one yet; the
 * face that runs a subagent is the plugin in `@alpha/internal-plugins`, which is where the agent
 * library is allowed (C2.0). Nothing here names pi: a name, a subset and a budget are policy.
 */

import { describe, expect, it } from 'vitest'
import { allowsTool, delegatingTo, SUBAGENTS, subagentFor, unknownSubagent, withinBudget } from './registry.ts'

const named = (name: string) => {
  const definition = subagentFor(SUBAGENTS, name)
  if (definition === undefined) throw new Error(`no subagent ${name}`)
  return definition
}

describe('[subagents] the registry', () => {
  it('ships a read-only one and one that may change the workspace', () => {
    expect(SUBAGENTS.map((definition) => definition.name)).toEqual(['explore', 'builder'])
    expect(named('explore').tools).toEqual(['read'])
    expect(named('builder').tools).toEqual(['read', 'write', 'edit', 'bash'])
    for (const definition of SUBAGENTS) {
      expect(definition.description).not.toBe('')
      expect(definition.prompt).not.toBe('')
      expect(definition.maxTurns).toBeGreaterThan(0)
    }
  })

  it('answers with the definition a name means, and with nothing when there is none', () => {
    expect(named('builder').name).toBe('builder')
    expect(subagentFor(SUBAGENTS, 'fast')).toBeUndefined()
    expect(subagentFor(SUBAGENTS, '')).toBeUndefined()
  })

  it('gives a subagent the tools it was listed with, and no others', () => {
    const explore = named('explore')
    const builder = named('builder')

    expect(allowsTool(explore, 'read')).toBe(true)
    expect(allowsTool(explore, 'bash')).toBe(false)
    expect(allowsTool(builder, 'bash')).toBe(true)
    // Nothing can hand work to a subagent that hands work to a subagent.
    expect(allowsTool(builder, 'task')).toBe(false)
  })

  it('counts turns, and the budget is the number of turns the subagent may take', () => {
    const explore = named('explore')
    expect(withinBudget(explore, explore.maxTurns - 1)).toBe(true)
    expect(withinBudget(explore, explore.maxTurns)).toBe(false)
  })

  it('says what may be handed over, naming each subagent and what it is for', () => {
    const said = delegatingTo(SUBAGENTS)

    expect(said).toContain('explore')
    expect(said).toContain(named('explore').description)
    expect(said).toContain('builder')
    expect(said).toContain(named('builder').description)
  })

  it('says what a name that is not there was, and what there is', () => {
    const said = unknownSubagent(SUBAGENTS, 'fast')

    expect(said).toContain('fast')
    expect(said).toContain('explore')
    expect(said).toContain('builder')
  })
})
