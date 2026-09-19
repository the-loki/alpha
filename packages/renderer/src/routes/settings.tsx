import { createFileRoute, Link, type SearchSchemaInput } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ArrowLeftIcon, GlobeIcon, PaletteIcon, ShieldIcon, SlidersIcon } from '../components/icons.tsx'
import { AppearanceSection } from '../components/settings/AppearanceSection.tsx'
import { BrowserAccessSection } from '../components/settings/BrowserAccessSection.tsx'
import { PermissionSection } from '../components/settings/PermissionSection.tsx'
import { ProvidersSection } from '../components/settings/ProvidersSection.tsx'
import { RememberedRules } from '../components/settings/RememberedRules.tsx'

/**
 * Settings is a menu, not a scroll: one panel at a time, and each panel has an address of its own
 * so a link to "the browser access page" means something.
 */
const SETTING_TABS = ['providers', 'permissions', 'appearance', 'browser-access'] as const

type SettingTab = (typeof SETTING_TABS)[number]

const TAB_LABELS: Record<SettingTab, string> = {
  providers: 'Providers',
  permissions: 'Permissions',
  appearance: 'Appearance',
  'browser-access': 'Browser access',
}

const TAB_ICONS: Record<SettingTab, ReactNode> = {
  providers: <SlidersIcon />,
  permissions: <ShieldIcon />,
  appearance: <PaletteIcon />,
  'browser-access': <GlobeIcon />,
}

/** The menu, grouped the way the reference groups it: what the agent may do, then how it looks. */
const TAB_GROUPS: { label: string; tabs: SettingTab[] }[] = [
  { label: 'The agent', tabs: ['providers', 'permissions'] },
  { label: 'This app', tabs: ['appearance', 'browser-access'] },
]

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
  const { tab } = Route.useSearch()

  return (
    <div className="flex h-full bg-ink-800">
      <nav aria-label="Settings sections" className="w-60 shrink-0 overflow-y-auto px-3 pt-3 pb-6">
        {/* Settings is a place you go and come back from, so the way back is the first thing in it. */}
        <Link
          to="/"
          className="flex items-center gap-2 rounded-control px-2 py-1.5 text-ui text-parchment-faint transition-colors hover:bg-ink-600 hover:text-parchment"
        >
          <ArrowLeftIcon /> Back to the workbench
        </Link>

        <h1 className="mt-5 px-2 text-xl font-semibold text-parchment">Settings</h1>

        {TAB_GROUPS.map((group) => (
          <section key={group.label} className="mt-5">
            <h2 className="px-2 pb-1 text-micro font-medium tracking-wide text-parchment-faint">{group.label}</h2>
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
                        : 'text-parchment-dim hover:bg-ink-600/60 hover:text-parchment'
                    }`}
                  >
                    {TAB_ICONS[candidate]}
                    {TAB_LABELS[candidate]}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden py-2 pr-2">
        <div className="min-h-0 flex-1 overflow-y-auto rounded-card border border-line bg-ink-700 px-8 py-7">
          <div className="mx-auto max-w-2xl space-y-8">{PANELS[tab]}</div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/settings')({ validateSearch, component: Settings })
