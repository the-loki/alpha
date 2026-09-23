import { archivedConversations, folderTasks, folderTree, withoutRuns } from '@alpha/domain'
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
 * One row of the rail's front matter: a place one can go — or the one row that *starts* something.
 * A place measures nothing, so the name takes the room and the shortcut it answers to stands at the
 * row's end in the apparatus voice (C5.5).
 */
function PlaceRow(props: { icon: JSX.Element; label: string; onClick: () => void; shortcut?: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class={`flex w-full items-center text-muted transition-colors hover:bg-surface-2 hover:text-foreground ${CONTROL_HEIGHT} ${RAIL_ROW}`}
    >
      {props.icon}
      <span class="min-w-0 flex-1 truncate text-left font-text text-name">{props.label}</span>
      <Show when={props.shortcut !== undefined}>
        <span class="shrink-0 font-mono text-label text-faint">{props.shortcut}</span>
      </Show>
    </button>
  )
}

/**
 * The rail's whole content on the workbench, in the three partitions C5.4 gives it: the places one
 * can go at the top, then one collapsible section per folder with its conversations flat beneath —
 * a sans name and a mono measure right-aligned at the row's end, joined by nothing — and the door
 * to settings pinned at its foot. The column itself folds away completely (see `stores/fold.ts`).
 */
export function Sidebar(props: { onSearch: () => void }) {
  const t = useText()
  const navigate = useNavigate()
  const composerFolder = () => composerFolderOf(shell)
  const modifier = () => (shell.platform === 'darwin' ? '⌘' : 'Ctrl+')
  // A run is a conversation, but it is shown under its task rather than in the folder's own list.
  const folders = () => folderTree(shell.recents, withoutRuns(conversations.list, tasks.runs))

  return (
    // The complementary landmark is the rail itself — the workbench's own contents and nothing else.
    <aside class="flex min-h-0 flex-1 flex-col px-2 pb-2">
      {/* The places, under one hairline and above another. */}
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
        {/* The sections' own row: what the rail holds, how much of it, and the one action that
            belongs to the rail itself — adding another folder to it. */}
        <div class="flex items-center gap-1 px-2 pb-1">
          <h2 class={`min-w-0 flex-1 truncate ${GROUP_LABEL}`}>{t('sidebar.folders')}</h2>
          <span class="font-mono text-label text-faint">{folders().length}</span>
          <Show when={shell.host !== 'browser'}>
            <IconAction
              icon={<PlusIcon />}
              label={t('sidebar.addFolder')}
              onClick={() => void shellActions.pickWorkspace()}
            />
          </Show>
        </div>

        <Show when={shell.host === 'browser'}>
          <p class="max-w-measure px-2 pb-1 font-text text-name leading-relaxed text-faint">
            {t('sidebar.browserNoPicker')}
          </p>
        </Show>

        {folders().length === 0 ? (
          // One line, and only once the list has been read: before that, "nothing here" would be a
          // claim about a file nobody has opened yet.
          <Show when={conversations.listed}>
            <p class="mt-2 px-2 font-text text-name text-faint">{t('sidebar.noFolders')}</p>
          </Show>
        ) : (
          <For each={folders()}>
            {(folder) => (
              <FolderSection
                folder={folder}
                current={folder.path === composerFolder()?.path}
                tasks={folderTasks(tasks.tasks, tasks.runs, conversations.list, folder.path)}
              />
            )}
          </For>
        )}

        <ArchivedSection conversations={archivedConversations(conversations.list)} />
      </div>

      {/* Settings is a place, and it is the last place: pinned at the foot of the rail, under its
          own hairline, where a window's door goes. */}
      <div class="shrink-0 border-t border-line pt-2">
        <a
          href="#/settings"
          class={`flex w-full items-center text-muted transition-colors hover:bg-surface-2 hover:text-foreground ${CONTROL_HEIGHT} ${RAIL_ROW}`}
        >
          <TuneIcon />
          <span class="min-w-0 flex-1 truncate font-text text-name">{t('settings.open')}</span>
        </a>
      </div>
    </aside>
  )
}
