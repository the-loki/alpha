import { archivedConversations, folderTasks, folderTree, withoutRuns } from '@alpha/core'
import { For, type JSX, Show } from 'solid-js'
import { conversations } from '../stores/conversations.ts'
import { composerFolderOf, shell, shellActions, useText } from '../stores/shell.ts'
import { tasks } from '../stores/tasks.ts'
import { ArchivedSection, FolderSection } from './FolderTree.tsx'
import { PlusIcon } from './icons.tsx'

/**
 * A control that is only its glyph: an action that belongs beside the thing it acts on rather than
 * in a list of its own. Its name is on it for a reader and for the tooltip, since nothing on screen
 * says what a `+` next to a heading does.
 */
function IconAction(props: { icon: JSX.Element; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      class="grid h-5 w-5 shrink-0 place-items-center rounded-control text-parchment-faint transition-colors hover:bg-ink-700/60 hover:text-parchment"
    >
      {props.icon}
    </button>
  )
}

/**
 * The rail is the workbench's index and nothing else: the folders, their conversations, their
 * tasks, and what was put away. The commands that act from anywhere live in the strip above the
 * window, and adding a folder lives in the index's own heading row — so everything here is
 * *contents*, and the heading's count and `+` are its only chrome.
 */
export function Sidebar() {
  const t = useText()
  const composerFolder = () => composerFolderOf(shell)
  // A run is a conversation, but it is shown under its task rather than in the folder's own list.
  const folders = () => folderTree(shell.recents, withoutRuns(conversations.list, tasks.runs))

  return (
    // A soft panel beside the page: the workbench's contents, floating the same distance off the
    // window's edges as the page does (C5.4).
    <aside class="flex w-64 shrink-0 flex-col rounded-card bg-ink-800 px-2 pb-2">
      <div class="mt-1.5 flex min-h-0 flex-1 flex-col overflow-y-auto pt-2">
        {/* The index's own row: what it holds, how much of it, and the one action that belongs to
            the index itself — adding another folder to it. */}
        <div class="flex items-center gap-1 px-2 pb-1">
          <h2 class="min-w-0 flex-1 truncate font-mono text-micro tracking-widest text-parchment-faint uppercase">
            {t('sidebar.folders')}
          </h2>
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
    </aside>
  )
}
