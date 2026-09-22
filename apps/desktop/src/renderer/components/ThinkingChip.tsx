import { THINKING_LEVELS, type ThinkingLevel, thinkingKey } from '@alpha/core'
import { For, Show } from 'solid-js'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { CHIP_QUIET, CHIP as CHIP_SHAPE } from './controls.ts'

/**
 * How hard the next turn thinks, at the model chip's right hand (C5.4): the effort is a decision
 * about the model's room, so it is made where the model is chosen. Off is one of the levels — the
 * question is the same one at every step. It speaks the apparatus voice: it is a measurement.
 */
export function ThinkingChip() {
  const t = useText()
  return (
    <Show when={conversations.transcript.summary}>
      {(summary) => (
        <select
          aria-label={t('composer.thinking')}
          title={t('composer.thinking')}
          value={summary().thinkingLevel}
          onInput={(event) => void conversationActions.setThinkingLevel(event.currentTarget.value as ThinkingLevel)}
          class={`${CHIP_SHAPE} max-w-32 ${CHIP_QUIET}`}
        >
          <For each={THINKING_LEVELS}>{(level) => <option value={level}>{t(thinkingKey(level))}</option>}</For>
        </select>
      )}
    </Show>
  )
}
