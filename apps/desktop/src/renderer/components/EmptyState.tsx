import { Show } from 'solid-js'
import { composerFolderOf, shell, shellActions, useText } from '../stores/shell.ts'
import { PRIMARY_ACTION } from './controls.ts'
import { WindowCorner } from './TitleBar.tsx'

/**
 * What is on the page before anything has been asked. With a folder open that is the title page:
 * the name of the work set large in the text voice, its address under it in mono, and the sentence
 * below — what this page is, before its first question is asked. With no folder there is no page,
 * so that one state is about the window itself and says so in the largest voice it has.
 *
 * It draws no scroll and no column of its own: it stands where the messages will stand, on the
 * page's one pair of edges (C5.4).
 */
export function EmptyState() {
  const t = useText()
  const composerFolder = () => composerFolderOf(shell)

  return (
    <Show
      when={composerFolder()}
      fallback={
        <div class="relative flex h-full flex-col items-center justify-center text-center">
          {/* This screen has no view head, but the window still has a corner — and the left end of
              that same row is where a folded rail is brought back (C5.4). */}
          <WindowCorner />
          <h1 class="font-text text-display text-foreground">{t('empty.noFolder.title')}</h1>
          <p class="mt-2 max-w-measure font-text text-name leading-relaxed text-muted">{t('empty.noFolder.body')}</p>
          <Show
            when={shell.host === 'browser'}
            fallback={
              <button type="button" onClick={() => void shellActions.pickWorkspace()} class={`mt-6 ${PRIMARY_ACTION}`}>
                {t('empty.chooseFolder')}
              </button>
            }
          >
            <p class="mt-6 font-text text-name text-muted">{t('sidebar.browserNoPicker')}</p>
          </Show>
        </div>
      }
    >
      {(folder) => (
        // The title page: the name of the work in the text voice at its title size, its path under
        // it in the measuring voice. This page wears no view head — a document says its name once,
        // on the page — so the window's corner is drawn here too.
        <div class="py-10">
          <WindowCorner />
          <h1 class="font-text text-title font-semibold tracking-tight text-foreground">{folder().name}</h1>
          <p class="mt-1.5 break-all font-mono text-label text-faint">{folder().path}</p>
          <p class="mt-10 max-w-measure font-text text-body text-muted">{t('empty.folder.body')}</p>
        </div>
      )}
    </Show>
  )
}
