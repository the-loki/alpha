import { EN } from '@alpha/i18n'
import { describe, expect, it } from 'vitest'
import { isToolRisk, riskKey, TOOL_RISKS, toolRiskOf } from './tools.ts'

describe('[domain] toolRiskOf', () => {
  it('classifies reading a file as a read', () => {
    expect(toolRiskOf('read')).toBe('read')
  })

  it('classifies both writing tools as writes', () => {
    expect(toolRiskOf('write')).toBe('write')
    expect(toolRiskOf('edit')).toBe('write')
  })

  it('classifies the shell as an execution', () => {
    expect(toolRiskOf('bash')).toBe('execute')
  })

  it('treats an unclassified tool as an execution, so an unknown tool cannot slip through as safe', () => {
    expect(toolRiskOf('deploy_to_production')).toBe('execute')
    expect(toolRiskOf('')).toBe('execute')
  })
})

describe('[domain] isToolRisk', () => {
  it('accepts every class and rejects anything else', () => {
    expect(TOOL_RISKS.every((risk) => isToolRisk(risk))).toBe(true)
    expect(isToolRisk('harmless')).toBe(false)
  })
})

describe('[domain] riskKey', () => {
  it('says what each class does, so the colour is not the only cue', () => {
    expect(TOOL_RISKS.map((risk) => EN[riskKey(risk)])).toEqual(['Reads', 'Writes', 'Runs commands'])
  })
})
