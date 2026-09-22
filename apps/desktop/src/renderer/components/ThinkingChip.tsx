import { THINKING_LEVELS, type ThinkingLevel, thinkingKey } from '@alpha/core'
import { For, Show } from 'solid-js'
import { nextThinking, setNextThinking } from '../stores/next-message.ts'
import { useText } from '../stores/shell.ts'
import { CHIP_QUIET, CHIP as CHIP_SHAPE } from './controls.ts'

/**
 * How hard the next turn thinks, at the model chip's right hand (C5.4): the effort is a decision
 * about the model's room, so it is made where the model is chosen. Off is one of the levels — the
 * question is the same one at every step. It speaks the apparatus voice: it is a measurement. It is
 * a conversation's own setting, so it is drawn only while one is open — the next-message rule says
 * so, not this chip.
 */
export function ThinkingChip() {
  const t = useText()
  return (
    <Show when={nextThinking()}>
      {(level) => (
        <select
          aria-label={t('composer.thinking')}
          title={t('composer.thinking')}
          value={level()}
          onInput={(event) => void setNextThinking(event.currentTarget.value as ThinkingLevel)}
          class={`${CHIP_SHAPE} max-w-32 ${CHIP_QUIET}`}
        >
          <For each={THINKING_LEVELS}>
            {(candidate) => <option value={candidate}>{t(thinkingKey(candidate))}</option>}
          </For>
        </select>
      )}
    </Show>
  )
}
