import { useEffect } from 'react'
import { useProviders } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'
import { AddProvider } from './AddProvider.tsx'
import { ProviderCard } from './ProviderCard.tsx'

export function ProvidersSection() {
  const t = useText()
  const snapshot = useProviders((state) => state.snapshot)
  const load = useProviders((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section aria-labelledby="settings-providers">
      <h2 id="settings-providers" className="text-body font-medium text-parchment">
        {t('settings.providers')}
      </h2>
      <p className="mt-1 text-xs text-parchment-dim">{t('settings.providersBody')}</p>

      {snapshot.protection === 'plaintext' && (
        <p className="mt-2 rounded-card border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
          {t('settings.noKeychain')}
        </p>
      )}

      {snapshot.providers.length === 0 ? (
        <p className="mt-3 text-code text-parchment-faint">{t('settings.noProviders')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {snapshot.providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </ul>
      )}

      <AddProvider />
    </section>
  )
}
