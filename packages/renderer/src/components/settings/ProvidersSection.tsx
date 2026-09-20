import { useEffect } from 'react'
import { useProviders } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'
import { DefaultModel } from './DefaultModel.tsx'
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

      {/* The one model choice that is not a provider's own: what a new conversation starts on.
          It is a choice among every provider's models, so it sits above the cards, not in one —
          and only once there is a card to choose from. */}
      {snapshot.providers.length > 0 && <DefaultModel />}

      {snapshot.providers.length === 0 ? (
        // The empty state is a sentence in the panel's own voice, not a bare line: it says what
        // the list is empty of and points at the form under it, which is the next action.
        <p className="mt-4 rounded-card border border-dashed border-line px-3 py-3 text-xs leading-relaxed text-parchment-faint">
          {t('settings.noProviders')}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {snapshot.providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </ul>
      )}

      <ProviderForm />
    </section>
  )
}
