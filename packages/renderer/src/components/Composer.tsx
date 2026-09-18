import { useShell } from '../stores/shell.ts'

/**
 * Present, focused and honest about why it cannot send yet. Sending arrives with the runtime;
 * until then the hint names the missing piece rather than letting the button fail silently.
 */
export function Composer() {
  const workspace = useShell((state) => state.workspace)
  const hasWorkspace = workspace.kind === 'selected'

  return (
    <div className="shrink-0 border-t border-line bg-ink-900 px-6 pb-5 pt-4">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-card border border-line bg-ink-700 px-3 py-2.5 focus-within:border-line-strong">
          <textarea
            rows={2}
            aria-label="Message the agent"
            placeholder={hasWorkspace ? 'Ask the agent to change something…' : 'Open a folder first'}
            className="block w-full resize-none bg-transparent text-[15px] leading-relaxed text-parchment placeholder:text-parchment-faint focus:outline-none"
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[11px] text-parchment-faint">
              {hasWorkspace
                ? 'Sending arrives with the agent runtime.'
                : 'A workspace is the folder the agent works in.'}
            </span>
            <button
              type="button"
              disabled
              className="rounded-control bg-ember/30 px-3 py-1 text-[12px] font-medium text-ember-ink/70 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
