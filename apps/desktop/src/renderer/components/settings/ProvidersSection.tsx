import { For, onMount, Show } from 'solid-js'
import { providerActions, providers } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'
import { NOTICE } from '../controls.ts'
import { DefaultModel } from './DefaultModel.tsx'
import { ProviderCard } from './ProviderCard.tsx'
import { ProviderForm } from './ProviderForm.tsx'

/** The connections the workbench may talk to, with each one's models in its card. */
export function ProvidersSection() {
  const t = useText()

  onMount(() => {
    void providerActions.load()
  })

  // No heading of its own and no wrapper either: the panel's name is in the band above, and what
  // this panel holds is a *list of groups* — what protects the keys, the model a new conversation
  // starts on, the providers, the form that adds one. They are siblings, so the container's rhythm
  // (one rule and one lead-in between groups) reaches every one of them; a group wrapped away inside
  // a section of its own is a group the rhythm cannot space, which is how the keychain notice came to
  // sit with its last line on the sentence of the group beneath it.
  return (
    <>
      <Show when={providers.snapshot.protection === 'plaintext'}>
        {/* A notice is a line: the warning bar down its left edge and a surface-1 fill (C5.4). */}
        <p class={`max-w-measure font-text text-name leading-relaxed text-warning ${NOTICE} border-warning`}>
          {t('settings.noKeychain')}
        </p>
      </Show>

      {/* The one model choice that is not a provider's own: what a new conversation starts on.
          It is a choice among every provider's models, so it sits above the cards, not in one —
          and only once there is a card to choose from. */}
      <Show when={providers.snapshot.providers.length > 0}>
        <DefaultModel />
      </Show>

      <Show
        when={providers.snapshot.providers.length === 0}
        fallback={
          <ul class="space-y-3">
            <For each={providers.snapshot.providers}>{(provider) => <ProviderCard provider={provider} />}</For>
          </ul>
        }
      >
        {/* The empty state is a sentence in the panel's own voice, not a bare line: it says what
            the list is empty of and points at the form under it, which is the next action. */}
        <p class="rounded-md border border-dashed border-line px-3 py-3 font-text text-name leading-relaxed text-faint">
          {t('settings.noProviders')}
        </p>
      </Show>

      <ProviderForm />
    </>
  )
}
