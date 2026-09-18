import { useShell } from '../stores/shell.ts'

export function EmptyState() {
  const workspace = useShell((state) => state.workspace)
  const pickWorkspace = useShell((state) => state.pickWorkspace)

  if (workspace.kind === 'none') {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <h1 className="text-[20px] font-medium text-parchment">Open a folder to begin</h1>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-parchment-dim">
          A workspace is the folder the agent reads and edits. Everything you ask for happens inside it, and nothing
          happens outside it without your say-so.
        </p>
        <button
          type="button"
          onClick={() => void pickWorkspace()}
          className="mt-5 rounded-control bg-ember px-4 py-2 text-[13px] font-medium text-ember-ink transition-colors hover:bg-ember-bright"
        >
          Open folder
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <h1 className="text-[20px] font-medium text-parchment">{workspace.workspace.name}</h1>
      <p className="mt-2 max-w-md font-mono text-[12px] text-parchment-faint">{workspace.workspace.path}</p>
      <p className="mt-4 max-w-md text-[13px] leading-relaxed text-parchment-dim">
        The agent is pointed at this folder. Add a model provider in settings, then start a conversation.
      </p>
    </div>
  )
}
