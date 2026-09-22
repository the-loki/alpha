import { archivedConversations, folderTasks, folderTree, withoutRuns } from '@alpha/core'
import { useNavigate } from '@solidjs/router'
import { For, type JSX, Show } from 'solid-js'
import { conversations } from '../stores/conversations.ts'
import { composerFolderOf, shell, shellActions, useText } from '../stores/shell.ts'
import { tasks } from '../stores/tasks.ts'
import { CONTROL_HEIGHT, GROUP_LABEL, ICON_ACTION, RAIL_ROW } from './controls.ts'
import { ArchivedSection, FolderSection } from './FolderTree.tsx'
import { ClockIcon, PlusIcon, SearchIcon, TuneIcon } from './icons.tsx'
import { SCROLLS } from './ledger.ts'

/**
 * A control that is only its glyph: an action that belongs beside the thing it acts on rather than
 * in a list of its own. Its name is on it for a reader and for the tooltip, since nothing on screen
 * says what a `+` next to a heading does.
 */
function IconAction(props: { icon: JSX.Element; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={props.label} title={props.label} onClick={props.onClick} class={ICON_ACTION}>
      {props.icon}
    </button>
  )
}

/**
 * One row of the spine's places: a glyph, a name, and — for the two that answer the keyboard — the
 * shortcut they answer to, in the measuring voice. The rows that *go* somewhere are the same height
 * as every control with a body (C5.4); the hairlines above and below the group are what say these
 * are places rather than contents.
 */
function PlaceRow(props: { icon: JSX.Element; label: string; onClick: () => void; shortcut?: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class={`flex ${CONTROL_HEIGHT} w-full items-center rounded-control text-ui text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment ${RAIL_ROW}`}
    >
      {props.icon}
      <span class="min-w-0 flex-1 truncate text-left">{props.label}</span>
      <Show when={props.shortcut !== undefined}>
        <span class="font-mono text-micro text-parchment-faint">{props.shortcut}</span>
      </Show>
    </button>
  )
}

/**
 * The spine is the workbench's whole left side: the window's mark and its own controls in the head,
 * the places one can go beneath them, then the index — the folders, their conversations, their
 * tasks, and what was put away — with settings pinned at the foot. There is no strip above the
 * window: what one *does* and where one *goes* are one column, and the page keeps the height the
 * strip used to spend (C5.4).
 */
export function Sidebar(props: { onSearch: () => void }) {
  const t = useText()
  const navigate = useNavigate()
  const composerFolder = () => composerFolderOf(shell)
  const modifier = () => (shell.platform === 'darwin' ? '⌘' : 'Ctrl+')
  // A run is a conversation, but it is shown under its task rather than in the folder's own list.
  const folders = () => folderTree(shell.recents, withoutRuns(conversations.list, tasks.runs))

  return (
    // The spine's contents, under the head the panel holds: the places, the index, and the door
    // to settings at the foot. The complementary landmark is the rail itself — the workbench's
    // index and nothing else (C5.4).
    <aside class="flex min-h-0 flex-1 flex-col px-2 pb-2">
      {/* The places, under one hairline and above another: the one row that *starts* something,
          then the rows that *go* somewhere. */}
      <nav aria-label={t('sidebar.places')} class="shrink-0 pt-2">
        <div class="space-y-0.5">
          <PlaceRow
            icon={<PlusIcon />}
            label={t('sidebar.newConversation')}
            shortcut={`${modifier()}N`}
            onClick={() => navigate('/')}
          />
          <PlaceRow
            icon={<SearchIcon />}
            label={t('sidebar.search')}
            shortcut={`${modifier()}K`}
            onClick={props.onSearch}
          />
          <PlaceRow icon={<ClockIcon />} label={t('sidebar.tasks')} onClick={() => navigate('/tasks')} />
        </div>
        <div class="mt-2 border-t border-line" />
      </nav>

      <div class={`min-h-0 flex-1 flex-col pt-2 ${SCROLLS}`}>
        {/* The index's own row: what it holds, how much of it, and the one action that belongs to
            the index itself — adding another folder to it. */}
        <div class="flex items-center gap-1 px-2 pb-1">
          <h2 class={`min-w-0 flex-1 truncate ${GROUP_LABEL}`}>{t('sidebar.folders')}</h2>
          <span class="font-mono text-micro text-parchment-faint">{folders().length}</span>
          <Show when={shell.host !== 'browser'}>
            <IconAction
              icon={<PlusIcon />}
              label={t('sidebar.addFolder')}
              onClick={() => void shellActions.pickWorkspace()}
            />
          </Show>
        </div>

        <Show when={shell.host === 'browser'}>
          <p class="px-2 pb-1 text-micro leading-relaxed text-parchment-faint">{t('sidebar.browserNoPicker')}</p>
        </Show>

        {folders().length === 0 ? (
          // One line, and only once the list has been read: before that, "nothing here" would be a
          // claim about a file nobody has opened yet.
          <Show when={conversations.listed}>
            <p class="mt-2 px-2 text-xs text-parchment-faint">{t('sidebar.noFolders')}</p>
          </Show>
        ) : (
          <For each={folders()}>
            {(folder, index) => (
              <FolderSection
                folder={folder}
                current={folder.path === composerFolder()?.path}
                tasks={folderTasks(tasks.tasks, tasks.runs, conversations.list, folder.path)}
                divided={index() > 0}
              />
            )}
          </For>
        )}

        <ArchivedSection conversations={archivedConversations(conversations.list)} />
      </div>

      {/* Settings is a place, and it is the last place: pinned at the foot of the spine, under its
          own hairline, where a window's door goes. It is a rail row like the places above it — the
          same padding, so it stands on the same x — and the hairline is not given padding of its own
          that the panel already has, or the door would stand one step in from every other row. */}
      <div class="shrink-0 border-t border-line pt-2">
        <a
          href="#/settings"
          class={`flex ${CONTROL_HEIGHT} w-full items-center rounded-control text-ui text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment ${RAIL_ROW}`}
        >
          <TuneIcon />
          <span class="min-w-0 flex-1 truncate">{t('settings.open')}</span>
        </a>
      </div>
    </aside>
  )
}
