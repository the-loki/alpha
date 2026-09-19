import { levelKey } from '@alpha/core'
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
  // A folder's own default wins over the workbench's, exactly as it does when the conversation is
  // created — the sentence has to be true, not approximately true.
  const workbenchLevel = useShell((state) => state.permissionLevel)
  const folderLevels = useShell((state) => state.workspaceLevels)
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
      {/* The one moment the folder's default level is worth saying: before the conversation exists,
          there is no level chip in the header to show it (ticket #87). */}
      <p className="mt-2 text-ui text-parchment-faint">
        {t('empty.startsAt', {
          level: t(levelKey(folderLevels[composerFolder.path] ?? workbenchLevel)),
        })}
      </p>
    </div>
  )
}
