import { createFileRoute, Link, type SearchSchemaInput } from '@tanstack/react-router'
import type { ReactNode } from 'react'
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
    <div className="flex h-full">
      <nav aria-label="Settings sections" className="w-56 shrink-0 overflow-y-auto border-r border-line px-3 py-8">
        <h1 className="px-2 text-xl font-medium text-parchment">Settings</h1>
        <ul className="mt-5 space-y-0.5">
          {SETTING_TABS.map((candidate) => (
            <li key={candidate}>
              <Link
                to="/settings"
                search={{ tab: candidate }}
                aria-current={candidate === tab ? 'page' : undefined}
                className={`block rounded-control px-2 py-1.5 text-ui transition-colors ${
                  candidate === tab
                    ? 'bg-ink-700 text-parchment'
                    : 'text-parchment-dim hover:bg-ink-700 hover:text-parchment'
                }`}
              >
                {TAB_LABELS[candidate]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-2xl space-y-8">{PANELS[tab]}</div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/settings')({ validateSearch, component: Settings })
