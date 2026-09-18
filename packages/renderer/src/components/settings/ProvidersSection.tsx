import { useEffect } from 'react'
import { useProviders } from '../../stores/providers.ts'
import { AddProvider } from './AddProvider.tsx'
import { ProviderCard } from './ProviderCard.tsx'

export function ProvidersSection() {
  const snapshot = useProviders((state) => state.snapshot)
  const load = useProviders((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-medium text-parchment">Model providers</h2>
      <p className="mt-1 text-[12px] text-parchment-dim">
        Alpha ships no keys. A provider you add here is the only thing it can talk to, and its key is stored on this
        machine alone.
      </p>

      {snapshot.protection === 'plaintext' && (
        <p className="mt-2 rounded-card border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] text-amber">
          This system offers no keychain, so keys are stored in plain text in the app data folder.
        </p>
      )}

      {snapshot.providers.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-parchment-faint">No providers yet.</p>
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
