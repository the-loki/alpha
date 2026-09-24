import type { TextKey } from '@alpha/i18n'
import { useSearchParams } from '@solidjs/router'
import { For, type JSX, Show } from 'solid-js'
import { RailToggle, WindowControls } from '../components/chrome/TitleBar.tsx'
import { GROUP_LABEL, LIVE_SPINE, PAGE_TITLE, RAIL_ROW, ROW_LIVE } from '../components/controls.ts'
import { ArrowLeftIcon, GlobeIcon, PaletteIcon, ServerIcon, ShieldIcon, SlidersIcon } from '../components/icons.tsx'
import { AppearanceSection } from '../components/settings/AppearanceSection.tsx'
import { BrowserAccessSection } from '../components/settings/BrowserAccessSection.tsx'
import { McpSection } from '../components/settings/McpSection.tsx'
import { PermissionSection } from '../components/settings/PermissionSection.tsx'
import { ProvidersSection } from '../components/settings/ProvidersSection.tsx'
import { RememberedRules } from '../components/settings/RememberedRules.tsx'
import { BESIDE_SCROLLS, FORM_COLUMN, PAGE, PANEL_GROUPS, SCROLLS, VIEW_HEAD } from '../lib/ledger.ts'
import { foldActions, narrow } from '../stores/fold.ts'
import { useText } from '../stores/shell.ts'

/**
 * Everything the places that mention a panel need to know about it. The id's type is `string` and
 * not the union of the ids on purpose: that union is read off the records below, and a type cannot
 * be named before the array it is derived from exists.
 */
interface PanelSpec {
  /** What its address says, and what the page is on. */
  id: string
  /** The heading the menu stands it under. */
  heading: TextKey
  /** What the menu calls it, and what the page is titled. */
  label: TextKey
  /** What the page says it is about, said once above its sections. */
  note: TextKey
  /** The mark beside its name in the menu. */
  icon: () => JSX.Element
  /** What it draws. */
  render: () => JSX.Element
}

/** The permission panel is two sections: the ladder itself, and the rules a person has remembered. */
const PermissionsPanel = (): JSX.Element => (
  <>
    <PermissionSection />
    <RememberedRules />
  </>
)

/**
 * Settings is a menu, not a scroll: one panel at a time, and each panel has an address of its own
 * so a link to "the browser access page" means something.
 *
 * One list holds the panels, in the order the menu lists them, and everything else is drawn from
 * it: the ids the page is addressed by, the headings the menu groups them under, the page's own
 * title, the sentence under it, and the panel itself. That replaces six structures that had to
 * agree by hand — and two of the ways they could disagree were silent: a panel named in the ids but
 * left out of the menu was openable by its address alone, with no row anywhere that reached it, and
 * one missing from the panel switch drew the providers panel under its own title. Neither is
 * sayable here: these records are the ids, and a panel that is not one of them is not a page.
 */
const SETTING_PANELS = [
  {
    id: 'providers',
    heading: 'settings.groupAgent',
    label: 'settings.tabProviders',
    note: 'settings.providersNote',
    // Providers is the connection the workbench runs over — the closest thing to an engine panel,
    // which is why it shares its icon with nothing else here. It stands first because it is what a
    // person comes here to change.
    icon: () => <SlidersIcon />,
    render: () => <ProvidersSection />,
  },
  {
    id: 'mcp',
    heading: 'settings.groupAgent',
    label: 'settings.tabMcp',
    note: 'settings.mcpNote',
    icon: () => <ServerIcon />,
    render: () => <McpSection />,
  },
  {
    id: 'permissions',
    heading: 'settings.groupAgent',
    label: 'settings.tabPermissions',
    note: 'settings.permissionsNote',
    icon: () => <ShieldIcon />,
    render: () => <PermissionsPanel />,
  },
  {
    id: 'appearance',
    heading: 'settings.groupApp',
    label: 'settings.tabAppearance',
    note: 'settings.appearanceNote',
    icon: () => <PaletteIcon />,
    render: () => <AppearanceSection />,
  },
  {
    id: 'browser-access',
    heading: 'settings.groupApp',
    label: 'settings.tabBrowserAccess',
    note: 'settings.browserAccessNote',
    icon: () => <GlobeIcon />,
    render: () => <BrowserAccessSection />,
  },
] as const satisfies readonly PanelSpec[]

type SettingTab = (typeof SETTING_PANELS)[number]['id']

/**
 * The menu's headings with the panels under each, folded out of the list above: the records that
 * name a heading stand next to each other, so one pass keeping the last heading is the whole fold —
 * what the menu shows is the list's own order. Two records naming the same heading apart from each
 * other would draw that heading twice; the list is read in order for that reason.
 */
function menuByGroup(): { heading: TextKey; panels: PanelSpec[] }[] {
  const groups: { heading: TextKey; panels: PanelSpec[] }[] = []
  for (const panel of SETTING_PANELS) {
    const last = groups.at(-1)
    if (last !== undefined && last.heading === panel.heading) last.panels.push(panel)
    else groups.push({ heading: panel.heading, panels: [panel] })
  }
  return groups
}

/** The menu's groups, worked out once: the list above is the order, and this is that order folded. */
const TAB_GROUPS = menuByGroup()

function isSettingTab(value: unknown): value is SettingTab {
  return typeof value === 'string' && SETTING_PANELS.some((panel) => panel.id === value)
}

/**
 * The panel an address names. Every id a page can be on is one of the records above, so this cannot
 * come up empty — and it says so out loud rather than drawing a panel nobody asked for, which is
 * what a `switch` with a default did.
 */
function panelOf(tab: SettingTab): PanelSpec {
  const panel = SETTING_PANELS.find((candidate) => candidate.id === tab)
  if (panel === undefined) throw new Error(`no settings panel is named ${tab}`)
  return panel
}

/**
 * The tab the page is on. It is a value by the time a screen reads it — the URL keeps whatever was
 * typed, and what the page draws is always one of the panels.
 */
function useSettingTab(): () => SettingTab {
  const [search] = useSearchParams()
  return () => (isSettingTab(search.tab) ? search.tab : 'providers')
}

export function Settings() {
  const t = useText()
  const tab = useSettingTab()
  const panel = () => panelOf(tab())

  return (
    <div class="flex h-full min-h-0 flex-col">
      {/* The view head: what this panel is — the same head, height and padding the conversation
          and the tasks page wear, so the title stands on the same x wherever you are, and the
          window's three keep the same y on every page. Settings replaces the rail, so on a window
          there is no rail to fold here and no toggle in this head: the column beside it is this
          panel's own menu (C5.4). A phone is where that column is the screen, and then this head is
          what calls the menu back, wearing the same toggle with the menu's own name. One hairline
          under the head and nothing raised. */}
      <header class={`${VIEW_HEAD} ${BESIDE_SCROLLS}`}>
        <Show when={narrow()}>
          <span class="no-drag absolute top-1/2 left-0 -translate-y-1/2">
            <RailToggle menu />
          </span>
        </Show>
        <h1 class={`min-w-0 flex-1 truncate ${PAGE_TITLE} text-foreground`}>{t(panel().label)}</h1>
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
          <p class="max-w-measure font-text text-body text-muted">{t(panel().note)}</p>
          <div class={`mt-5 ${PANEL_GROUPS}`} data-groups="panel">
            {panel().render()}
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
            <h3 class={`px-2 pb-1 ${GROUP_LABEL}`}>{t(group.heading)}</h3>
            <ul>
              <For each={group.panels}>
                {(panel) => (
                  <li>
                    <a
                      href={`#/settings?tab=${panel.id}`}
                      // Picking a panel is what leaves the menu on a phone; the row that asks for
                      // settings does not fold it, because the menu is that same column (C5.4).
                      onClick={foldActions.foldAway}
                      aria-current={panel.id === tab() ? 'page' : undefined}
                      // The panel you are on carries the accent's margin tick, the same mark the
                      // rail puts on the conversation you are in (C5.5).
                      class={`relative flex items-center py-1.5 transition-colors ${RAIL_ROW} ${
                        panel.id === tab()
                          ? `${ROW_LIVE} text-foreground`
                          : 'text-muted hover:bg-surface-2 hover:text-foreground'
                      }`}
                    >
                      <Show when={panel.id === tab()}>
                        <span class={LIVE_SPINE} aria-hidden="true" />
                      </Show>
                      {panel.icon()}
                      <span class="min-w-0 flex-1 truncate font-text text-name">{t(panel.label)}</span>
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
