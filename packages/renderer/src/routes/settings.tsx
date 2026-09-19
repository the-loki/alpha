import type { TextKey } from '@alpha/core'
import { createFileRoute, Link, type SearchSchemaInput } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ArrowLeftIcon, GlobeIcon, PaletteIcon, ShieldIcon, SlidersIcon } from '../components/icons.tsx'
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
const SETTING_TABS = ['providers', 'permissions', 'appearance', 'browser-access'] as const

type SettingTab = (typeof SETTING_TABS)[number]

const TAB_LABELS: Record<SettingTab, TextKey> = {
  providers: 'settings.tabProviders',
  permissions: 'settings.tabPermissions',
  appearance: 'settings.tabAppearance',
  'browser-access': 'settings.tabBrowserAccess',
}

const TAB_ICONS: Record<SettingTab, ReactNode> = {
  providers: <SlidersIcon />,
  permissions: <ShieldIcon />,
  appearance: <PaletteIcon />,
  'browser-access': <GlobeIcon />,
}

/** The menu, grouped the way the reference groups it: what the agent may do, then how it looks. */
const TAB_GROUPS: { label: TextKey; tabs: SettingTab[] }[] = [
  { label: 'settings.groupAgent', tabs: ['providers', 'permissions'] },
  { label: 'settings.groupApp', tabs: ['appearance', 'browser-access'] },
]

/** What each panel is about, said once at the top of it rather than inferred from its controls. */
const TAB_NOTES: Record<SettingTab, TextKey> = {
  providers: 'settings.providersNote',
  permissions: 'settings.permissionsNote',
  appearance: 'settings.appearanceNote',
  'browser-access': 'settings.browserAccessNote',
}

/** What each panel holds. Providers is first because it is what a person comes here to change. */
const PANELS: Record<SettingTab, ReactNode> = {
  providers: <ProvidersSection />,
  permissions: (
    <>
      <PermissionSection />
      <RememberedRules />
    </>
  ),
  appearance: <AppearanceSection />,
  'browser-access': <BrowserAccessSection />,
}

function isSettingTab(value: unknown): value is SettingTab {
  return typeof value === 'string' && (SETTING_TABS as readonly string[]).includes(value)
}

/**
 * A tab in the URL, defaulted rather than optional: the panel is a complete value by the time a
 * screen reads it, so nothing downstream narrows a union. The `SearchSchemaInput` label is what
 * keeps the write side honest — without it every `Link` in the app would have to be handed a
 * `search`, including the ones with nothing to do with settings.
 */
const validateSearch = (input: { tab?: unknown } & SearchSchemaInput): { tab: SettingTab } => ({
  tab: isSettingTab(input.tab) ? input.tab : 'providers',
})

function Settings() {
  const t = useText()
  const { tab } = Route.useSearch()

  return (
    <div className="flex h-full bg-ink-800">
      <nav aria-label={t('settings.sections')} className="w-60 shrink-0 overflow-y-auto px-3 pt-3 pb-6">
        {/* Settings is a place you go and come back from, so the way back is the first thing in it. */}
        <Link
          to="/"
          className="flex items-center gap-2 rounded-control px-2 py-1.5 text-ui text-parchment-faint transition-colors hover:bg-ink-600 hover:text-parchment"
        >
          <ArrowLeftIcon /> {t('settings.back')}
        </Link>

        <h1 className="mt-5 px-2 text-xl font-semibold text-parchment">{t('settings.title')}</h1>

        {TAB_GROUPS.map((group) => (
          <section key={group.label} className="mt-5">
            <h2 className="px-2 pb-1 text-micro font-medium tracking-wide text-parchment-faint">{t(group.label)}</h2>
            <ul className="space-y-0.5">
              {group.tabs.map((candidate) => (
                <li key={candidate}>
                  <Link
                    to="/settings"
                    search={{ tab: candidate }}
                    aria-current={candidate === tab ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-control px-2 py-1.5 text-ui transition-colors ${
                      candidate === tab
                        ? 'bg-ink-600 font-medium text-parchment'
                        : 'text-parchment-dim hover:bg-ink-600 hover:text-parchment'
                    }`}
                  >
                    {TAB_ICONS[candidate]}
                    {t(TAB_LABELS[candidate])}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden py-2 pr-2">
        <div className="min-h-0 flex-1 overflow-y-auto rounded-overlay border border-line bg-ink-700 px-8 py-7 shadow-card">
          <div className="mx-auto max-w-3xl space-y-8">
            {/* The panel says what it is before it says anything else: the menu on the left names it
                too, but a heading you had to click to reach is not a heading. */}
            <header className="border-b border-line pb-4">
              <h1 className="text-lg font-semibold text-parchment">{t(TAB_LABELS[tab])}</h1>
              <p className="mt-1 text-xs text-parchment-dim">{t(TAB_NOTES[tab])}</p>
            </header>
            {PANELS[tab]}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/settings')({ validateSearch, component: Settings })
