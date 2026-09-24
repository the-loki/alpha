import { Show } from 'solid-js'
import type { McpDraft } from '../../lib/mcp-draft.ts'
import { useText } from '../../stores/shell.ts'
import { FIELD_FRAME, GROUP_LABEL } from '../controls.ts'
import { FIELD } from './Fields.tsx'

/**
 * A box for more than one line — the arguments, and the environment or headers. Its height is its
 * own, because a field's height is what one line needs, and this is the one control on the panel
 * that is not `CONTROL_HEIGHT` (C5.4).
 */
const AREA = `w-full resize-y px-2 py-1.5 font-mono text-code ${FIELD_FRAME}`

function Area(props: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label class="block">
      <span class={`mb-1 block ${GROUP_LABEL}`}>{props.label}</span>
      <textarea
        aria-label={props.label}
        rows={2}
        value={props.value}
        placeholder={props.placeholder}
        onInput={(event) => props.onChange(event.target.value)}
        class={AREA}
      />
    </label>
  )
}

/** How a server is reached. The choice decides which of the two fields below is asked for. */
function KindField(props: { kind: McpDraft['kind']; onChange: (kind: McpDraft['kind']) => void }) {
  const t = useText()
  return (
    <label class="block">
      <span class={`mb-1 block ${GROUP_LABEL}`}>{t('settings.mcpKind')}</span>
      <select
        aria-label={t('settings.mcpKind')}
        value={props.kind}
        onInput={(event) => props.onChange(event.target.value as McpDraft['kind'])}
        class={FIELD}
      >
        <option value="command">{t('settings.mcpKindCommand')}</option>
        <option value="url">{t('settings.mcpKindUrl')}</option>
      </select>
    </label>
  )
}

/**
 * The boxes one server is described in, whatever is being done with it — a card correcting one, or
 * the form adding one. The name is not among them: it is the server's identity, and a row that can
 * be renamed is a row whose tools can be taken out from under a conversation (a provider's id is
 * fixed for the same reason).
 */
export function McpServerFields(props: { draft: McpDraft; onChange: (next: McpDraft) => void }) {
  const t = useText()
  const edit = (patch: Partial<McpDraft>) => props.onChange({ ...props.draft, ...patch })
  const command = () => props.draft.kind === 'command'

  return (
    <div class="mt-3 grid grid-cols-2 gap-3">
      <KindField kind={props.draft.kind} onChange={(kind) => edit({ kind })} />
      <label class="block">
        <span class={`mb-1 block ${GROUP_LABEL}`}>{t(command() ? 'settings.mcpCommand' : 'settings.mcpUrl')}</span>
        <input
          aria-label={t(command() ? 'settings.mcpCommand' : 'settings.mcpUrl')}
          value={props.draft.target}
          placeholder={t(command() ? 'settings.mcpCommandPlaceholder' : 'settings.mcpUrlPlaceholder')}
          onInput={(event) => edit({ target: event.target.value })}
          class={FIELD}
        />
      </label>
      {/* One of the two belongs to each kind: a url has no arguments, and a command has no headers.
          They stand in the same place so switching the kind does not move the row. */}
      <Show when={command()}>
        <Area
          label={t('settings.mcpArgs')}
          value={props.draft.args}
          placeholder={t('settings.mcpArgsPlaceholder')}
          onChange={(args) => edit({ args })}
        />
      </Show>
      <Area
        label={t(command() ? 'settings.mcpEnv' : 'settings.mcpHeaders')}
        value={props.draft.pairs}
        placeholder={t('settings.mcpPairsPlaceholder')}
        onChange={(pairs) => edit({ pairs })}
      />
    </div>
  )
}

/** What these boxes hold when they hold more than one thing, said once behind both of them. */
export function McpPairsNote() {
  const t = useText()
  return <p class="mt-2 max-w-measure font-text text-name leading-relaxed text-faint">{t('settings.mcpPairsNote')}</p>
}
