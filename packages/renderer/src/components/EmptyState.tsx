import { composerFolderOf, useShell, useText } from '../stores/shell.ts'
import { BLOCK, entryNumber, MARK_COLUMN, PAGE } from './ledger.ts'

/**
 * What is on the page before anything has been asked. With a folder open that is the page itself,
 * with its first entry still unwritten: the number is in the margin, the rule is down the side,
 * and the sentence says what would fill it. With no folder there is no page to show — so that one
 * state is centred, because it is about the window rather than about a document.
 */
export function EmptyState() {
  const composerFolder = useShell(composerFolderOf)
  const t = useText()
  const host = useShell((state) => state.host)
  const pickWorkspace = useShell((state) => state.pickWorkspace)

  if (composerFolder === undefined) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <h1 className="text-xl font-semibold text-parchment">{t('empty.noFolder.title')}</h1>
        <p className="mt-2 max-w-md text-ui leading-relaxed text-parchment-dim">{t('empty.noFolder.body')}</p>
        {host === 'browser' ? (
          <p className="mt-5 text-ui text-parchment-dim">{t('sidebar.browserNoPicker')}</p>
        ) : (
          <button
            type="button"
            onClick={() => void pickWorkspace()}
            className="mt-5 rounded-control bg-accent px-4 py-2 text-ui font-medium text-accent-ink shadow-soft transition-colors hover:bg-accent-bright"
          >
            {t('empty.chooseFolder')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* The title page: the folio number set large, the name of the work in the display voice with
          its address under it, and the sentence in the display italic — what this page is, before
          its first entry is written. The heading is here because the page's one title belongs in
          the page's one main landmark. */}
      <div className={`py-12 ${PAGE}`}>
        <div className={BLOCK}>
          <span className={`${MARK_COLUMN} pt-2 text-2xl`} aria-hidden="true">
            {entryNumber(0)}
          </span>
          <div>
            <h1 className="font-display text-3xl leading-tight text-parchment">{composerFolder.name}</h1>
            <p className="mt-1.5 font-mono text-micro text-parchment-faint">{composerFolder.path}</p>
            <p className="mt-8 max-w-measure font-display text-lg leading-relaxed text-parchment-dim italic">
              {t('empty.folder.body')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
