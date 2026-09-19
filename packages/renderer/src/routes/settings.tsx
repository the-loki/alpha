import type { TextKey } from '@alpha/core'
import { createFileRoute, Link, type SearchSchemaInput } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ArrowLeftIcon, BranchIcon, GlobeIcon, PaletteIcon, ShieldIcon, SlidersIcon } from '../components/icons.tsx'
import { AppearanceSection } from '../components/settings/AppearanceSection.tsx'
import { BrowserAccessSection } from '../components/settings/BrowserAccessSection.tsx'
import { ModelsSection } from '../components/settings/ModelsSection.tsx'
import { PermissionSection } from '../components/settings/PermissionSection.tsx'
import { ProvidersSection } from '../components/settings/ProvidersSection.tsx'
import { RememberedRules } from '../components/settings/RememberedRules.tsx'
import { useText } from '../stores/shell.ts'

/**
 * Settings is a menu, not a scroll: one panel at a time, and each panel has an address of its own
 * so a link to "the browser access page" means something.
 */
const SETTING_TABS = ['providers', 'models', 'permissions', 'appearance', 'browser-access'] as const

type SettingTab = (typeof SETTING_TABS)[number]

const TAB_LABELS: Record<SettingTab, TextKey> = {
  providers: 'settings.tabProviders',
  models: 'settings.tabModels',
  permissions: 'settings.tabPermissions',
  appearance: 'settings.tabAppearance',
  'browser-access': 'settings.tabBrowserAccess',
}

const TAB_ICONS: Record<SettingTab, ReactNode> = {
  providers: <SlidersIcon />,
  models: <BranchIcon />,
  permissions: <ShieldIcon />,
  appearance: <PaletteIcon />,
  'browser-access': <GlobeIcon />,
}

/** The menu, grouped the way the reference groups it: what the agent may do, then how it looks. */
const TAB_GROUPS: { label: TextKey; tabs: SettingTab[] }[] = [
  { label: 'settings.groupAgent', tabs: ['providers', 'models', 'permissions'] },
  { label: 'settings.groupApp', tabs: ['appearance', 'browser-access'] },
]

/** What each panel is about, said once at the top of it rather than inferred from its controls. */
const TAB_NOTES: Record<SettingTab, TextKey> = {
  providers: 'settings.providersNote',
  models: 'settings.modelsNote',
  permissions: 'settings.permissionsNote',
  appearance: 'settings.appearanceNote',
  'browser-access': 'settings.browserAccessNote',
}

/** What each panel holds. Providers is first because it is what a person comes here to change. */
const PANELS: Record<SettingTab, ReactNode> = {
  providers: <ProvidersSection />,
  models: <ModelsSection />,
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
    // The same shape as the window: a ruled column of places to go, and the page beside it. The
    // menu is chrome and the panel is the document, which is the split every other screen uses.
    <div className="flex h-full">
      <nav
        aria-label={t('settings.sections')}
        className="w-60 shrink-0 overflow-y-auto border-r border-line bg-ink-800 px-2 pt-2 pb-6"
      >
        {/* Settings is a place you go and come back from, so the way back is the first thing in it. */}
        <Link
          to="/"
          className="flex items-center gap-2 border-l-2 border-l-transparent px-2 py-1.5 text-ui text-parchment-faint transition-colors hover:bg-ink-600 hover:text-parchment"
        >
          <ArrowLeftIcon /> {t('settings.back')}
        </Link>

        <h1 className="mt-5 px-2 text-lg font-semibold text-parchment">{t('settings.title')}</h1>

        {TAB_GROUPS.map((group) => (
          <section key={group.label} className="mt-5 border-t border-line pt-3">
            <h2 className="px-2 pb-1 font-mono text-micro tracking-widest text-parchment-faint uppercase">
              {t(group.label)}
            </h2>
            <ul>
              {group.tabs.map((candidate) => (
                <li key={candidate}>
                  <Link
                    to="/settings"
                    search={{ tab: candidate }}
                    aria-current={candidate === tab ? 'page' : undefined}
                    // The panel you are on is marked by the accent at the column's own edge, the
                    // same mark the rail puts on the conversation you are in.
                    className={`flex items-center gap-2.5 border-l-2 px-2 py-1.5 text-ui transition-colors ${
                      candidate === tab
                        ? 'border-l-accent font-medium text-parchment'
                        : 'border-l-transparent text-parchment-dim hover:bg-ink-600 hover:text-parchment'
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

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-ink-700">
        {/* One rule between one panel section and the next, drawn by the container so a section
            cannot forget it and two of them cannot draw it twice. The heading has none of its
            own: it is the rule's first subject, not a section under it. */}
        <div className="mx-auto max-w-3xl divide-y divide-line px-8 py-6 [&>*]:pt-8">
          <header className="pb-4">
            <h1 className="text-lg font-semibold text-parchment">{t(TAB_LABELS[tab])}</h1>
            <p className="mt-1 text-xs text-parchment-dim">{t(TAB_NOTES[tab])}</p>
          </header>
          {PANELS[tab]}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/settings')({ validateSearch, component: Settings })
