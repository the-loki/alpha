import type { ProviderApi, ProviderView, TextKey, Undef } from '@alpha/core'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { type ProviderTestOutcome, useProviders } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'
import { DESTRUCTIVE_ACTION, OUTLINED_ACTION, PRIMARY_ACTION } from '../controls.ts'

const API_NAMES: Record<ProviderApi, TextKey> = {
  'openai-completions': 'settings.apiOpenai',
  'anthropic-messages': 'settings.apiAnthropic',
  'google-generative-ai': 'settings.apiGoogle',
}

/**
 * One connection: where it is, what it speaks, whether a key is stored, and the three things a
 * user does to it — replace the key, prove it works, delete it. Which models it serves belongs to
 * the models panel, so this card counts them and points there rather than editing them here.
 */
export function ProviderCard({ provider }: { provider: ProviderView }) {
  const t = useText()
  const setCredential = useProviders((state) => state.setCredential)
  const remove = useProviders((state) => state.remove)
  const test = useProviders((state) => state.test)
  const [secret, setSecret] = useState('')
  const [outcome, setOutcome] = useState<Undef<ProviderTestOutcome>>(undefined)
  const firstModel = provider.models[0]?.id ?? ''

  return (
    <li className="rounded-card border border-line bg-ink-800 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-ui font-medium text-parchment">{provider.name}</p>
          <p className="truncate font-mono text-micro text-parchment-faint">{provider.baseUrl}</p>
        </div>
        <span className={`shrink-0 text-micro ${provider.hasCredential ? 'text-jade' : 'text-amber'}`}>
          {t(provider.hasCredential ? 'settings.keyStored' : 'settings.noKey')}
        </span>
      </div>

      <p className="mt-1.5 flex items-center gap-2 text-micro text-parchment-faint">
        <span>{t(API_NAMES[provider.api])}</span>
        <span aria-hidden="true">·</span>
        <Link to="/settings" search={{ tab: 'models' }} className="text-parchment-dim hover:text-parchment">
          {provider.models.length === 1
            ? t('settings.oneModel')
            : t('settings.models', { count: provider.models.length })}
        </Link>
      </p>

      <div className="mt-2.5 flex gap-2">
        <input
          type="password"
          value={secret}
          aria-label={t('settings.apiKeyFor', { provider: provider.name })}
          placeholder={t('settings.pasteKey')}
          onChange={(event) => setSecret(event.target.value)}
          className="min-w-0 flex-1 rounded-control border border-line bg-ink-700 px-2 py-1 font-mono text-xs text-parchment focus:border-line-strong focus:outline-none"
        />
        <button
          type="button"
          disabled={secret.trim() === ''}
          onClick={() => void setCredential(provider.id, secret).then(() => setSecret(''))}
          className={PRIMARY_ACTION}
        >
          {t('settings.saveKey')}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={!provider.hasCredential || firstModel === ''}
          onClick={() => void test(provider.id, firstModel).then(setOutcome)}
          className={OUTLINED_ACTION}
        >
          {t('settings.test')}
        </button>
        <button type="button" onClick={() => void remove(provider.id)} className={DESTRUCTIVE_ACTION}>
          {t('settings.removeProvider')}
        </button>
        {outcome !== undefined && (
          <span className={`min-w-0 flex-1 truncate text-xs ${outcome.ok ? 'text-jade' : 'text-danger'}`}>
            {outcome.message}
          </span>
        )}
      </div>
    </li>
  )
}
