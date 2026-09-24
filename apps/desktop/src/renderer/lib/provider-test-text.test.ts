import { text } from '@alpha/i18n'
import { describe, expect, it } from 'vitest'
import { providerTestText } from './provider-test-text.ts'

const zh = (key: Parameters<typeof text>[1], params?: Parameters<typeof text>[2]): string => text('zh', key, params)

describe('provider test results in the window language', () => {
  it('names timeout, silence, and empty answers in Chinese', () => {
    expect(providerTestText(zh, { ok: false, failure: { kind: 'timeout', seconds: 15 } })).toContain('15 秒')
    expect(providerTestText(zh, { ok: false, failure: { kind: 'request-failed' } })).toBe('供应商没有响应。')
    expect(providerTestText(zh, { ok: false, failure: { kind: 'empty-answer' } })).toBe('供应商返回了空内容。')
  })

  it('quotes the provider or transport words unchanged inside the localized sentence', () => {
    const said = 'invalid_api_key: 原样保留'
    expect(providerTestText(zh, { ok: false, failure: { kind: 'provider-error', said } })).toBe(
      `供应商返回错误：${said}`,
    )
    expect(providerTestText(zh, { ok: false, failure: { kind: 'request-failed', said } })).toBe(
      `供应商没有响应：${said}`,
    )
  })
})
