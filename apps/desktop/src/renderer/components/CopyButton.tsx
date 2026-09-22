import type { TextKey, TextParams } from '@alpha/core'
import { createSignal } from 'solid-js'
import { copyText } from '../lib/clipboard.ts'
import { useText } from '../stores/shell.ts'
import { TEXT_ACTION } from './controls.ts'

/**
 * Copies what is on screen: a message as markdown, a tool row as its output. Its words are keys,
 * not strings: this button is used in three places and the three say different things.
 */
export function CopyButton(props: {
  /** What the accessible name says it copies. */
  what: TextKey
  text: string
  /** What the button itself says. */
  label: TextKey
  params?: TextParams
  class?: string
}) {
  const t = useText()
  const [state, setState] = createSignal<'idle' | 'done' | 'failed'>('idle')

  return (
    <button
      type="button"
      aria-label={t(props.what, props.params)}
      onClick={() => {
        void copyText(props.text).then((ok) => setState(ok ? 'done' : 'failed'))
      }}
      class={`${TEXT_ACTION} ${state() === 'done' ? 'text-success' : ''} ${state() === 'failed' ? 'text-danger' : ''} ${props.class ?? ''}`}
    >
      {t(
        state() === 'done' ? 'message.copied' : state() === 'failed' ? 'message.copyFailed' : props.label,
        props.params,
      )}
    </button>
  )
}
