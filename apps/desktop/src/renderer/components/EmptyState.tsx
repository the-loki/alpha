import { Show } from 'solid-js'
import { composerFolderOf, shell, shellActions, useText } from '../stores/shell.ts'
import { PRIMARY_ACTION } from './controls.ts'
import { WindowCorner } from './TitleBar.tsx'

/**
 * What is on the page before anything has been asked. With a folder open that is the page itself,
 * with its first question still unasked: the column is empty, and the sentence says what would fill
 * it. With no folder there is no page to show — so that one state is centred, because it is about
 * the window rather than about a document.
 *
 * It draws no scroll and no column of its own: it stands where the messages will stand, on the
 * page's one column (C5.4).
 */
export function EmptyState() {
  const t = useText()
  const composerFolder = () => composerFolderOf(shell)

  return (
    <Show
      when={composerFolder()}
      fallback={
        <div class="relative flex h-full flex-col items-center justify-center text-center">
          {/* The one screen about the window itself is signed: the mark at its speaking size. */}
          <span
            class="mb-6 grid h-10 w-10 place-items-center rounded-card bg-gradient-to-br from-accent to-accent-bright font-mono text-lg font-medium text-accent-ink shadow-glow"
            aria-hidden="true"
          >
            A
          </span>
          {/* The screen has no band, but the window still has a corner. */}
          <WindowCorner />
          <h1 class="font-display text-2xl font-semibold tracking-tight text-parchment">{t('empty.noFolder.title')}</h1>
          <p class="mt-2 max-w-measure text-ui leading-relaxed text-parchment-dim">{t('empty.noFolder.body')}</p>
          <Show
            when={shell.host === 'browser'}
            fallback={
              <button type="button" onClick={() => void shellActions.pickWorkspace()} class={`mt-6 ${PRIMARY_ACTION}`}>
                {t('empty.chooseFolder')}
              </button>
            }
          >
            <p class="mt-6 text-ui text-parchment-dim">{t('sidebar.browserNoPicker')}</p>
          </Show>
        </div>
      }
    >
      {(folder) => (
        // The title page: the name of the work tightened like print, its address under it, and the
        // sentence below — what this page is, before its first question is asked. The heading is
        // here because the page's one title belongs in the page's one main landmark. This page has
        // no band either — a document says its name once, on the page, not twice in a strip — so
        // the window's corner is drawn here too. Nothing between here and the pane is positioned,
        // so the corner lands on the pane's own top edge, the same y every band keeps.
        <div class="py-10">
          <WindowCorner />
          <h1 class="font-display text-3xl leading-tight font-semibold tracking-tight text-parchment">
            {folder().name}
          </h1>
          <p class="mt-1.5 break-all font-mono text-micro text-parchment-faint">{folder().path}</p>
          <p class="mt-10 max-w-measure font-display text-lg leading-relaxed text-parchment-dim">
            {t('empty.folder.body')}
          </p>
        </div>
      )}
    </Show>
  )
}
