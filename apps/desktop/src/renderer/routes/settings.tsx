import type { TextKey } from '@alpha/i18n'
import { useSearchParams } from '@solidjs/router'
import { For, type JSX, Show } from 'solid-js'
import { RailToggle, WindowControls } from '../components/chrome/TitleBar.tsx'
import { GROUP_LABEL, LIVE_SPINE, PAGE_TITLE, RAIL_ROW, ROW_LIVE } from '../components/controls.ts'
import { ArrowLeftIcon, GlobeIcon, PaletteIcon, ShieldIcon, SlidersIcon } from '../components/icons.tsx'
import { AppearanceSection } from '../components/settings/AppearanceSection.tsx'
import { BrowserAccessSection } from '../components/settings/BrowserAccessSection.tsx'
import { PermissionSection } from '../components/settings/PermissionSection.tsx'
import { ProvidersSection } from '../components/settings/ProvidersSection.tsx'
import { RememberedRules } from '../components/settings/RememberedRules.tsx'
import { BAND, BESIDE_SCROLLS, FORM_COLUMN, PAGE, PANEL_GROUPS, SCROLLS } from '../lib/ledger.ts'
import { foldActions, narrow } from '../stores/fold.ts'
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

const TAB_ICONS: Record<SettingTab, () => JSX.Element> = {
  // Providers is the connection the workbench runs over — the closest thing to an engine panel,
  // which is why it shares its icon with nothing else here.
  providers: () => <SlidersIcon />,
  permissions: () => <ShieldIcon />,
  appearance: () => <PaletteIcon />,
  'browser-access': () => <GlobeIcon />,
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

function isSettingTab(value: unknown): value is SettingTab {
  return typeof value === 'string' && (SETTING_TABS as readonly string[]).includes(value)
}

/** What a panel holds. Providers is first because it is what a person comes here to change. */
function panelOf(tab: SettingTab): JSX.Element {
  switch (tab) {
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

/**
 * The tab the page is on. It is a value by the time a screen reads it — the URL keeps whatever was
 * typed, and what the page draws is always one of the four.
 */
function useSettingTab(): () => SettingTab {
  const [search] = useSearchParams()
  return () => (isSettingTab(search.tab) ? search.tab : 'providers')
}

export function Settings() {
  const t = useText()
  const tab = useSettingTab()

  return (
    <div class="flex h-full min-h-0 flex-col">
      {/* The view head: what this panel is — the same head, height and padding the conversation
          and the tasks page wear, so the title stands on the same x wherever you are, and the
          window's three keep the same y on every page. Settings replaces the rail, so on a window
          there is no rail to fold here and no toggle in this head: the column beside it is this
          panel's own menu (C5.4). A phone is where that column is the screen, and then this head is
          what calls the menu back, wearing the same toggle with the menu's own name. One hairline
          under the head and nothing raised. */}
      <header class={`${BAND} ${BESIDE_SCROLLS}`}>
        <Show when={narrow()}>
          <span class="no-drag absolute top-1/2 left-0 -translate-y-1/2">
            <RailToggle menu />
          </span>
        </Show>
        <h1 class={`min-w-0 flex-1 truncate ${PAGE_TITLE} text-foreground`}>{t(TAB_LABELS[tab()])}</h1>
        {/* What acts on the window is not one of the panel's concerns: at the corner itself. */}
        <span class="no-drag -mr-8 flex shrink-0 items-center">
          <WindowControls />
        </span>
      </header>

      {/* One rule between one panel section and the next, drawn by the container so a section
          cannot forget it and two of them cannot draw it twice. The view head has none of its own:
          it is the first rule's subject, not a section under one. The sentence that says what the
          panel is about is above the rules, because it is not a section of the panel — it is the
          panel, said once, and it keeps the reading measure: it is a label and not content. The
          panel itself fills the page, one padding in, on the same edges its view head's title
          stands on (C5.3, C5.4). */}
      <div class={`min-h-0 flex-1 py-6 ${PAGE} ${SCROLLS}`}>
        <div class={FORM_COLUMN} data-column="form">
          <p class="max-w-measure font-text text-body text-muted">{t(TAB_NOTES[tab()])}</p>
          <div class={`mt-5 ${PANEL_GROUPS}`} data-groups="panel">
            {panelOf(tab())}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The settings menu, filling the column the workbench's rail fills: the same box, the same width,
 * the same padding, under the same head, because the two screens are the same window twice and a
 * menu that is a panel *inside* the page gives the window a third surface it does not have (C5.4).
 * It replaces the rail rather than joining it: settings is a place, not a mode, so it carries no
 * rail toggle — the column beside it is this menu, and it is never folded away.
 */
export function SettingsNav() {
  const t = useText()
  const tab = useSettingTab()

  return (
    <nav aria-label={t('settings.sections')} class={`min-h-0 flex-1 flex-col px-2 pb-6 ${SCROLLS}`}>
      {/* Settings is a place you go and come back from, so the way back is the first thing in it. */}
      <a
        href="#/"
        class={`mt-2 flex items-center py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground ${RAIL_ROW}`}
      >
        <ArrowLeftIcon /> <span class="min-w-0 flex-1 truncate font-text text-name">{t('settings.back')}</span>
      </a>

      <h2 class={`mt-5 px-2 ${PAGE_TITLE} text-foreground`}>{t('settings.title')}</h2>

      <For each={TAB_GROUPS}>
        {(group) => (
          <section class="mt-5 pt-2">
            <h3 class={`px-2 pb-1 ${GROUP_LABEL}`}>{t(group.label)}</h3>
            <ul>
              <For each={group.tabs}>
                {(candidate) => (
                  <li>
                    <a
                      href={`#/settings?tab=${candidate}`}
                      // Picking a panel is what leaves the menu on a phone; the row that asks for
                      // settings does not fold it, because the menu is that same column (C5.4).
                      onClick={foldActions.foldAway}
                      aria-current={candidate === tab() ? 'page' : undefined}
                      // The panel you are on carries the accent's margin tick, the same mark the
                      // rail puts on the conversation you are in (C5.5).
                      class={`relative flex items-center py-1.5 transition-colors ${RAIL_ROW} ${
                        candidate === tab()
                          ? `${ROW_LIVE} text-foreground`
                          : 'text-muted hover:bg-surface-2 hover:text-foreground'
                      }`}
                    >
                      <Show when={candidate === tab()}>
                        <span class={LIVE_SPINE} aria-hidden="true" />
                      </Show>
                      {TAB_ICONS[candidate]()}
                      <span class="min-w-0 flex-1 truncate font-text text-name">{t(TAB_LABELS[candidate])}</span>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </For>
    </nav>
  )
}
