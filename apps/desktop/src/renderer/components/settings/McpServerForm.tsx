import { createSignal, Show } from 'solid-js'
import { inputOf, type McpDraft } from '../../lib/mcp-draft.ts'
import { mcp, mcpActions } from '../../stores/mcp.ts'
import { useText } from '../../stores/shell.ts'
import { GROUP_LABEL, NOTICE, PRIMARY_ACTION } from '../controls.ts'
import { FIELD } from './Fields.tsx'
import { McpPairsNote, McpServerFields } from './McpServerFields.tsx'

/** The empty draft, as a fresh form shows it: a command to run, and nothing typed in it yet. */
const emptyDraft = (): McpDraft => ({ name: '', kind: 'command', target: '', args: '', pairs: '' })

/**
 * Adding a server. Its name is chosen here and never changed afterwards, so this is the one place a
 * name is typed — and a name already in the list is refused here rather than saved over the server
 * that has it, because the name is what the file and the hub both key a server by.
 */
export function McpServerForm() {
  const t = useText()
  const [draft, setDraft] = createSignal<McpDraft>(emptyDraft())
  const [error, setError] = createSignal('')

  const taken = () => mcp.snapshot.servers.some((server) => server.name === draft().name.trim())

  const add = async () => {
    setError('')
    try {
      await mcpActions.save(inputOf(draft()))
      setDraft(emptyDraft())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return (
    // A section of the panel, not a box with a legend on its border: the label is a heading, the
    // fields sit under it in the panel's own grid, and the one primary action is in the footer the
    // section ends with — where every form in the workbench ends (C5.4).
    <section aria-label={t('settings.addMcpServer')} class="rounded-lg border border-line bg-surface-0 p-4">
      <h3 class={GROUP_LABEL}>{t('settings.addMcpServer')}</h3>

      <label class="mt-3 block">
        <span class={`mb-1 block ${GROUP_LABEL}`}>{t('settings.mcpName')}</span>
        <input
          aria-label={t('settings.mcpName')}
          value={draft().name}
          placeholder={t('settings.mcpNamePlaceholder')}
          onInput={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          class={`${FIELD} max-w-64`}
        />
      </label>
      <p class="mt-1 max-w-measure font-text text-name leading-relaxed text-faint">{t('settings.mcpNameNote')}</p>

      <McpServerFields draft={draft()} onChange={setDraft} />
      <McpPairsNote />

      <Show when={taken() || error() !== ''}>
        {/* A notice is a line: the danger bar of a failure down its left edge and a surface-1 fill
            (C5.4). */}
        <p class={`mt-3 max-w-measure font-text text-name leading-relaxed text-danger ${NOTICE} border-danger`}>
          {taken() ? t('settings.mcpNameTaken') : error()}
        </p>
      </Show>

      <div class="mt-4 flex items-center justify-end gap-3 border-t border-line pt-3">
        <button type="button" disabled={taken()} onClick={() => void add()} class={PRIMARY_ACTION}>
          {t('settings.addMcpServer')}
        </button>
      </div>
    </section>
  )
}
