import { composerFolderOf, useShell, useText } from '../stores/shell.ts'

/**
 * One sentence and one action. Which sentence depends on how far the user has got: no folder at
 * all, or folders and nowhere in particular to be — in which case it names the one the next
 * message lands in, because the sidebar is showing several at once.
 */
export function EmptyState() {
  const composerFolder = useShell(composerFolderOf)
  const t = useText()
  const host = useShell((state) => state.host)
  const pickWorkspace = useShell((state) => state.pickWorkspace)

  if (composerFolder === undefined) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <h1 className="text-xl font-medium text-parchment">{t('empty.noFolder.title')}</h1>
        <p className="mt-2 max-w-md text-ui leading-relaxed text-parchment-dim">{t('empty.noFolder.body')}</p>
        {host === 'browser' ? (
          <p className="mt-5 text-ui text-parchment-dim">{t('sidebar.browserNoPicker')}</p>
        ) : (
          <button
            type="button"
            onClick={() => void pickWorkspace()}
            className="mt-5 rounded-control bg-accent px-4 py-2 text-ui font-medium text-accent-ink transition-colors hover:bg-accent-bright"
          >
            {t('empty.chooseFolder')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <h1 className="text-xl font-medium text-parchment">{composerFolder.name}</h1>
      <p className="mt-2 max-w-md font-mono text-xs text-parchment-faint">{composerFolder.path}</p>
      <p className="mt-4 max-w-md text-ui leading-relaxed text-parchment-dim">{t('empty.folder.body')}</p>
    </div>
  )
}
