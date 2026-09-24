import { For, onMount, Show } from 'solid-js'
import { mcp, mcpActions } from '../../stores/mcp.ts'
import { useText } from '../../stores/shell.ts'
import { McpServerCard } from './McpServerCard.tsx'
import { McpServerForm } from './McpServerForm.tsx'

/**
 * The MCP servers this workbench reaches the agent's extra tools through. Each one is what it is
 * reached by — a command, or a url — and how that went; the form under the list adds one.
 *
 * A server is configured here rather than in a file by hand, and a change made here is in force
 * when the answer arrives: a save reaches the server, so an open conversation's next request
 * already knows the tools (ADR-0028).
 */
export function McpSection() {
  const t = useText()

  onMount(() => {
    void mcpActions.load()
  })

  return (
    <>
      <Show
        when={mcp.snapshot.servers.length === 0}
        fallback={
          <ul class="space-y-3">
            <For each={mcp.snapshot.servers}>{(server) => <McpServerCard server={server} />}</For>
          </ul>
        }
      >
        {/* The empty state is a sentence in the panel's own voice and points at the form under it,
            which is the next action. */}
        <p class="rounded-md border border-dashed border-line px-3 py-3 font-text text-name leading-relaxed text-faint">
          {t('settings.mcpEmpty')}
        </p>
      </Show>

      <McpServerForm />
    </>
  )
}
