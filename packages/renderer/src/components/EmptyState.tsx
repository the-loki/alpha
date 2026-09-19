import { composerFolderOf, useShell, useText } from '../stores/shell.ts'
import { MARGIN_MARK, PAGE, PAGE_RULE } from './ledger.ts'

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
            className="mt-5 bg-accent px-4 py-2 text-ui font-medium text-accent-ink transition-colors hover:bg-accent-bright"
          >
            {t('empty.chooseFolder')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* The page, drawn as far as the window goes: the rule is the page's, so an unwritten page
          has one too — the margin is a property of the sheet, not of what is written on it. */}
      <div className={`flex min-h-full flex-col py-6 ${PAGE}`}>
        <div className={`relative flex-1 ${PAGE_RULE}`}>
          <span className={`${MARGIN_MARK} top-0 font-mono text-micro text-parchment-faint`} aria-hidden="true">
            01
          </span>
          <p className="max-w-measure text-body leading-relaxed text-parchment-dim">{t('empty.folder.body')}</p>
        </div>
      </div>
    </div>
  )
}
