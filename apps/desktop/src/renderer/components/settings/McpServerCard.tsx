import type { McpServerView } from '@alpha/contract'
import type { Undef } from '@alpha/domain'
import { createSignal, Show } from 'solid-js'
import { draftOf, inputOf, type McpDraft } from '../../lib/mcp-draft.ts'
import { mcpActions } from '../../stores/mcp.ts'
import { useText } from '../../stores/shell.ts'
import { DESTRUCTIVE_ACTION, NOTICE, OUTLINED_ACTION, PRIMARY_ACTION } from '../controls.ts'
import { McpServerFields } from './McpServerFields.tsx'

/** How it went, in the panel's own words: what it offers, that it is being reached, or that it is not. */
function Reached(props: { server: McpServerView }) {
  const t = useText()
  const state = () => props.server.reached
  const tone = () =>
    state().state === 'connected' ? 'text-success' : state().state === 'unreachable' ? 'text-danger' : 'text-faint'
  const said = () => {
    const now = state()
    if (now.state === 'connected') {
      return now.tools === 1 ? t('settings.mcpToolsOne') : t('settings.mcpTools', { count: now.tools })
    }
    return now.state === 'unreachable' ? t('settings.mcpUnreachable') : t('settings.mcpStarting')
  }
  return <span class={`shrink-0 font-mono text-label ${tone()}`}>{said()}</span>
}

/**
 * One configured server: what it is, how it went, and the boxes to correct it. A save is an edit of
 * this row rather than a delete and an add — the name is the identity and is not edited here — and
 * it is reached at the moment it is saved, because a save writes the file *and* hands the list to
 * the hub, which is what makes the change live rather than next-launch.
 */
export function McpServerCard(props: { server: McpServerView }) {
  const t = useText()
  const [draft, setDraft] = createSignal<Undef<McpDraft>>(undefined)
  const [error, setError] = createSignal('')
  const current = () => draft() ?? draftOf(props.server)
  const dirty = () => draft() !== undefined
  const unreachable = () => (props.server.reached.state === 'unreachable' ? props.server.reached : undefined)

  const save = async () => {
    setError('')
    try {
      await mcpActions.save(inputOf(current()))
      setDraft(undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  // Reaching one again can be refused — a name that is no longer configured, a workbench that cannot
  // write — and a control that swallows its refusal looks like one that did nothing.
  const reconnect = async () => {
    setError('')
    try {
      await mcpActions.reconnect(props.server.name)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return (
    <li class="rounded-lg border border-line bg-surface-0 p-4" data-server={props.server.name}>
      <div class="flex items-baseline justify-between gap-3">
        {/* The name is an id the machine measures by — mono, set plain (C5.3) — and the prefix of
            every tool name the model is offered. */}
        <p class="min-w-0 truncate font-mono text-name text-foreground">{props.server.name}</p>
        <Reached server={props.server} />
      </div>

      <Show when={unreachable()}>
        {(problem) => (
          // A notice is a line: the danger bar of a failure down its left edge (C5.4). The reason is
          // whatever refused, in its own words — this panel does not know more than the machine does.
          <p class={`mt-2 max-w-measure font-text text-name leading-relaxed text-danger ${NOTICE} border-danger`}>
            {problem().problem}
          </p>
        )}
      </Show>

      <McpServerFields draft={current()} onChange={setDraft} />

      <div class="mt-3 flex items-center justify-end gap-3 border-t border-line pt-3">
        <Show when={error() !== ''}>
          <span class="min-w-0 flex-1 truncate font-text text-name text-danger">{error()}</span>
        </Show>
        <Show when={dirty()}>
          <button type="button" onClick={() => setDraft(undefined)} class={OUTLINED_ACTION}>
            {t('settings.reset')}
          </button>
        </Show>
        {/* Offered only where pressing it does something: a server that answered is already reached. */}
        <Show when={unreachable() !== undefined}>
          <button type="button" onClick={() => void reconnect()} class={OUTLINED_ACTION}>
            {t('settings.mcpReconnect')}
          </button>
        </Show>
        <button
          type="button"
          aria-label={t('settings.mcpRemoveNamed', { name: props.server.name })}
          onClick={() => void mcpActions.remove(props.server.name)}
          class={DESTRUCTIVE_ACTION}
        >
          {t('settings.mcpRemove')}
        </button>
        <button type="button" disabled={!dirty()} onClick={() => void save()} class={PRIMARY_ACTION}>
          {t('settings.mcpSave')}
        </button>
      </div>
    </li>
  )
}
