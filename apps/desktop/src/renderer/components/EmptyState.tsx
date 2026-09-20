import { Show } from 'solid-js'
import { composerFolderOf, shell, shellActions, useText } from '../stores/shell.ts'
import { PRIMARY_ACTION } from './controls.ts'
import { BLOCK, entryNumber, MARK_COLUMN, PAGE, SCROLLS } from './ledger.ts'

/**
 * What is on the page before anything has been asked. With a folder open that is the page itself,
 * with its first entry still unwritten: the number is in the margin, the rule is down the side,
 * and the sentence says what would fill it. With no folder there is no page to show — so that one
 * state is centred, because it is about the window rather than about a document.
 */
export function EmptyState() {
  const t = useText()
  const composerFolder = () => composerFolderOf(shell)

  return (
    <Show
      when={composerFolder()}
      fallback={
        <div class="flex h-full flex-col items-center justify-center px-8 text-center">
          <h1 class="font-display text-2xl font-medium text-parchment">{t('empty.noFolder.title')}</h1>
          <p class="mt-2 max-w-md text-ui leading-relaxed text-parchment-dim">{t('empty.noFolder.body')}</p>
          <Show
            when={shell.host === 'browser'}
            fallback={
              <button type="button" onClick={() => void shellActions.pickWorkspace()} class={`mt-5 ${PRIMARY_ACTION}`}>
                {t('empty.chooseFolder')}
              </button>
            }
          >
            <p class="mt-5 text-ui text-parchment-dim">{t('sidebar.browserNoPicker')}</p>
          </Show>
        </div>
      }
    >
      {(folder) => (
        <div class={`min-h-0 flex-1 ${SCROLLS}`}>
          {/* The title page: the folio number set large, the name of the work in the display voice with
              its address under it, and the sentence in the display italic — what this page is, before
              its first entry is written. The heading is here because the page's one title belongs in
              the page's one main landmark. */}
          <div class={`py-12 ${PAGE}`}>
            <div class={BLOCK}>
              <span class={`${MARK_COLUMN} pt-2 text-2xl`} aria-hidden="true">
                {entryNumber(0)}
              </span>
              <div>
                <h1 class="font-display text-3xl leading-tight text-parchment">{folder().name}</h1>
                <p class="mt-1.5 font-mono text-micro text-parchment-faint">{folder().path}</p>
                <p class="mt-8 max-w-measure font-display text-lg leading-relaxed text-parchment-dim italic">
                  {t('empty.folder.body')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}
