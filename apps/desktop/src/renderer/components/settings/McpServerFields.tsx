import { Show } from 'solid-js'
import type { McpDraft } from '../../lib/mcp-draft.ts'
import { useText } from '../../stores/shell.ts'
import { FIELD_FRAME, GROUP_LABEL } from '../controls.ts'
import { FIELD } from './Fields.tsx'

/**
 * A box for more than one line — the arguments, and the environment or headers. It grows with what
 * is in it (`field-sizing-content`, the same way the writing box in a conversation does) up to a
 * ceiling, because a list of paths in a two-row box is a scrollbar drawn through the middle of one:
 * a server's arguments are as long as its command needs, and a box that cuts them is a box that
 * cannot be read from.
 */
const AREA = `field-sizing-content max-h-40 min-h-8 w-full resize-none overflow-y-auto px-2 py-1.5 font-mono text-code ${FIELD_FRAME}`

function Area(props: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label class="block">
      <span class={`mb-1 block ${GROUP_LABEL}`}>{props.label}</span>
      <textarea
        aria-label={props.label}
        rows={1}
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
    // One field per row, as the providers panel asks for a connection: what a server is reached by is
    // a path, a url or a list, and two columns of those are two boxes of clamped mono text.
    <div class="mt-3 flex flex-col gap-2.5">
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
          They stand in the same place, so switching the kind does not move the field under the hand. */}
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
