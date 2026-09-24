import type { Undef } from '@alpha/domain'
import { createSignal, For, Show } from 'solid-js'
import { composerFolderOf, shell, shellActions, useText } from '../../stores/shell.ts'
import { GROUP_LABEL, MENU_ROW_CURRENT, MENU_ROW_HOVER, MENU_SURFACE, useDismissed } from '../controls.ts'
import { CheckIcon, ChevronDownIcon, FolderIcon, PlusIcon } from '../icons.tsx'

/**
 * Which folder the message being written will start a conversation in, said on the box itself and
 * changeable there (C5.4). It is a line rather than a chip: it stands inside the writing card,
 * above the caret, and a second frame in there would box a box — so it lights under the hand the way
 * a rail row does, and says the rest with the chevron (C5.6).
 *
 * Switching is `selectWorkspace` — the rail's own way of pointing the composer at a folder, without
 * the `navigate('/')` that row adds, because the box this stands on is already the page it goes to.
 * One folder is current at a time, and it is the one the next conversation is created in.
 */
export function FolderLine() {
  const t = useText()
  const [open, setOpen] = createSignal(false)
  let container: Undef<HTMLDivElement>
  const current = () => composerFolderOf(shell)

  useDismissed(
    open,
    () => setOpen(false),
    () => container,
  )

  const choose = async (path: string) => {
    setOpen(false)
    await shellActions.selectWorkspace(path)
  }

  // A browser has no folder picker to open, so it is offered the folders the workbench remembers and
  // told what it cannot do — rather than a row that would refuse when pressed.
  const pick = async () => {
    setOpen(false)
    await shellActions.pickWorkspace()
  }

  return (
    <Show when={current()}>
      {(folder) => (
        <div ref={container} class="relative mb-1.5 flex no-drag">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open()}
            aria-label={t('composer.folderSwitch', { folder: folder().name })}
            title={folder().path}
            onClick={() => setOpen((value) => !value)}
            class="-ml-1 flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 font-mono text-label text-muted transition-colors duration-normal hover:bg-surface-2 hover:text-foreground"
          >
            <FolderIcon />
            <span class="min-w-0 truncate">{folder().name}</span>
            <ChevronDownIcon />
          </button>

          <Show when={open()}>
            <div role="menu" aria-label={t('composer.folders')} class={`top-full mt-2 w-64 ${MENU_SURFACE}`}>
              {/* What the list is, said once above it: the same name the menu carries to a reader. */}
              <p class={`px-3 pt-2 pb-1 ${GROUP_LABEL}`}>{t('composer.folders')}</p>
              <For each={shell.recents}>
                {(recent) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={recent.path === folder().path}
                    onClick={() => void choose(recent.path)}
                    class={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-text text-name text-foreground transition-colors duration-normal ${
                      recent.path === folder().path ? MENU_ROW_CURRENT : MENU_ROW_HOVER
                    }`}
                  >
                    <CheckIcon class={recent.path === folder().path ? 'text-accent' : 'invisible'} />
                    <span class="min-w-0 flex-1 truncate">{recent.name}</span>
                  </button>
                )}
              </For>

              <div class="mt-1 border-t border-line pt-1">
                <Show
                  when={shell.host === 'desktop'}
                  fallback={
                    <p class="max-w-measure px-3 py-2 font-text text-name leading-relaxed text-faint">
                      {t('sidebar.browserNoPicker')}
                    </p>
                  }
                >
                  <button
                    type="button"
                    onClick={() => void pick()}
                    class={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-text text-name text-muted transition-colors duration-normal hover:text-foreground ${MENU_ROW_HOVER}`}
                  >
                    <PlusIcon />
                    <span class="min-w-0 flex-1 truncate">{t('composer.chooseFolder')}</span>
                  </button>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      )}
    </Show>
  )
}
