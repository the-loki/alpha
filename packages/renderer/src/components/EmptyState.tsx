import { useShell } from '../stores/shell.ts'

/**
 * One sentence and one action. Which sentence depends on how far the user has got: no folder,
 * or a folder with nothing asked of it yet.
 */
export function EmptyState() {
  const workspace = useShell((state) => state.workspace)
  const pickWorkspace = useShell((state) => state.pickWorkspace)

  if (workspace.kind === 'none') {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <h1 className="text-xl font-medium text-parchment">Open a folder to begin</h1>
        <p className="mt-2 max-w-md text-ui leading-relaxed text-parchment-dim">
          A workspace is the folder the agent reads and edits. Everything you ask for happens inside it, and nothing
          happens outside it without your say-so.
        </p>
        <button
          type="button"
          onClick={() => void pickWorkspace()}
          className="mt-5 rounded-control bg-ember px-4 py-2 text-ui font-medium text-ember-ink transition-colors hover:bg-ember-bright"
        >
          Open folder
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <h1 className="text-xl font-medium text-parchment">{workspace.workspace.name}</h1>
      <p className="mt-2 max-w-md font-mono text-xs text-parchment-faint">{workspace.workspace.path}</p>
      <p className="mt-4 max-w-md text-ui leading-relaxed text-parchment-dim">
        Ask for something to change in this folder. The agent reads before it writes, and every tool it reaches for is
        gated by the permission level in the header.
      </p>
    </div>
  )
}
