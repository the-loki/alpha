import type { TextKey } from '@alpha/core'
import { useSearchParams } from '@solidjs/router'
import { For, type JSX } from 'solid-js'
import { ArrowLeftIcon, GlobeIcon, PaletteIcon, ShieldIcon, SlidersIcon } from '../components/icons.tsx'
import { AgentSection } from '../components/settings/AgentSection.tsx'
import { AppearanceSection } from '../components/settings/AppearanceSection.tsx'
import { BrowserAccessSection } from '../components/settings/BrowserAccessSection.tsx'
import { PermissionSection } from '../components/settings/PermissionSection.tsx'
import { ProvidersSection } from '../components/settings/ProvidersSection.tsx'
import { RememberedRules } from '../components/settings/RememberedRules.tsx'
import { useText } from '../stores/shell.ts'

/**
 * Settings is a menu, not a scroll: one panel at a time, and each panel has an address of its own
 * so a link to "the browser access page" means something.
 */
const SETTING_TABS = ['agent', 'providers', 'permissions', 'appearance', 'browser-access'] as const

type SettingTab = (typeof SETTING_TABS)[number]

const TAB_LABELS: Record<SettingTab, TextKey> = {
  agent: 'settings.tabAgent',
  providers: 'settings.tabProviders',
  permissions: 'settings.tabPermissions',
  appearance: 'settings.tabAppearance',
  'browser-access': 'settings.tabBrowserAccess',
}

const TAB_ICONS: Record<SettingTab, () => JSX.Element> = {
  // The agent is the workbench's engine, so it is where the sliders would be if it had a panel of
  // its own; providers is the connection it runs over.
  agent: () => <SlidersIcon />,
  providers: () => <SlidersIcon />,
  permissions: () => <ShieldIcon />,
  appearance: () => <PaletteIcon />,
  'browser-access': () => <GlobeIcon />,
}

/** The menu, grouped the way the reference groups it: what the agent may do, then how it looks. */
const TAB_GROUPS: { label: TextKey; tabs: SettingTab[] }[] = [
  { label: 'settings.groupAgent', tabs: ['agent', 'providers', 'permissions'] },
  { label: 'settings.groupApp', tabs: ['appearance', 'browser-access'] },
]

/** What each panel is about, said once at the top of it rather than inferred from its controls. */
const TAB_NOTES: Record<SettingTab, TextKey> = {
  agent: 'settings.agentNote',
  providers: 'settings.providersNote',
  permissions: 'settings.permissionsNote',
  appearance: 'settings.appearanceNote',
  'browser-access': 'settings.browserAccessNote',
}

function isSettingTab(value: unknown): value is SettingTab {
  return typeof value === 'string' && (SETTING_TABS as readonly string[]).includes(value)
}

/** What a panel holds. Providers is first because it is what a person comes here to change. */
function panelOf(tab: SettingTab): JSX.Element {
  switch (tab) {
    case 'agent':
      return <AgentSection />
    case 'permissions':
      return (
        <>
          <PermissionSection />
          <RememberedRules />
        </>
      )
    case 'appearance':
      return <AppearanceSection />
    case 'browser-access':
      return <BrowserAccessSection />
    default:
      return <ProvidersSection />
  }
}

export function Settings() {
  const t = useText()
  // The tab is a value by the time a screen reads it — the URL keeps whatever was typed, and what
  // the page draws is always one of the five.
  const [search] = useSearchParams()
  const tab = (): SettingTab => (isSettingTab(search.tab) ? search.tab : 'providers')

  return (
    // The same shape as the window: a soft menu panel and the page beside it, which is the split
    // every other screen uses.
    <div class="flex h-full gap-2 p-2">
      <nav
        aria-label={t('settings.sections')}
        class="w-60 shrink-0 overflow-y-auto rounded-card bg-ink-800 px-2 pt-2 pb-6"
      >
        {/* Settings is a place you go and come back from, so the way back is the first thing in it. */}
        <a
          href="#/"
          class="flex items-center gap-2 rounded-control px-2 py-1.5 text-ui text-parchment-faint transition-colors hover:bg-ink-700/60 hover:text-parchment"
        >
          <ArrowLeftIcon /> {t('settings.back')}
        </a>

        <h1 class="mt-5 px-2 font-display text-xl font-medium text-parchment">{t('settings.title')}</h1>

        <For each={TAB_GROUPS}>
          {(group) => (
            <section class="mt-5 pt-2">
              <h2 class="px-2 pb-1 font-mono text-micro tracking-widest text-parchment-faint uppercase">
                {t(group.label)}
              </h2>
              <ul>
                <For each={group.tabs}>
                  {(candidate) => (
                    <li>
                      <a
                        href={`#/settings?tab=${candidate}`}
                        aria-current={candidate === tab() ? 'page' : undefined}
                        // The panel you are on is a lifted row, the same mark the rail puts on the
                        // conversation you are in.
                        class={`flex items-center gap-2.5 rounded-control px-2 py-1.5 text-ui transition-colors ${
                          candidate === tab()
                            ? 'bg-ink-700 font-medium text-parchment shadow-soft'
                            : 'text-parchment-dim hover:bg-ink-700/60 hover:text-parchment'
                        }`}
                      >
                        {TAB_ICONS[candidate]()}
                        {t(TAB_LABELS[candidate])}
                      </a>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>
      </nav>

      <div class="min-h-0 min-w-0 flex-1 overflow-y-auto rounded-card border border-line bg-ink-700">
        {/* One rule between one panel section and the next, drawn by the container so a section
            cannot forget it and two of them cannot draw it twice. The heading has none of its
            own: it is the rule's first subject, not a section under it. */}
        <div class="mx-auto max-w-3xl divide-y divide-line px-8 py-6 [&>*]:pt-8">
          <header class="pb-4">
            <h1 class="font-display text-xl font-medium text-parchment">{t(TAB_LABELS[tab()])}</h1>
            <p class="mt-1 text-xs text-parchment-dim">{t(TAB_NOTES[tab()])}</p>
          </header>
          {panelOf(tab())}
        </div>
      </div>
    </div>
  )
}
