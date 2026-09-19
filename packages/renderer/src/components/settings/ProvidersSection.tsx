import { useEffect } from 'react'
import { useProviders } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'
import { ProviderCard } from './ProviderCard.tsx'
import { ProviderForm } from './ProviderForm.tsx'

/** The connections the workbench may talk to. What each one serves is the models panel's job. */
export function ProvidersSection() {
  const t = useText()
  const snapshot = useProviders((state) => state.snapshot)
  const load = useProviders((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  // No heading of its own: the panel's name is in the band above, and saying it twice is the
  // same sentence in two places. The list and the form are the whole panel.
  return (
    <section aria-label={t('settings.tabProviders')}>
      {snapshot.protection === 'plaintext' && (
        <p className="mt-2 rounded-card border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
          {t('settings.noKeychain')}
        </p>
      )}

      {snapshot.providers.length === 0 ? (
        <p className="text-code text-parchment-faint">{t('settings.noProviders')}</p>
      ) : (
        <ul className="space-y-2">
          {snapshot.providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </ul>
      )}

      <ProviderForm />
    </section>
  )
}
