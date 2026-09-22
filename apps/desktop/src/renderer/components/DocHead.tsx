import { formatCost, formatTokens, THINKING_LEVELS, type ThinkingLevel, thinkingKey, totalUsage } from '@alpha/core'
import { createSignal, For, Show } from 'solid-js'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { CONTROL_HEIGHT, DESTRUCTIVE_ACTION, FIELD_FRAME, TEXT_ACTION } from './controls.ts'
import { BAND, PAGE } from './ledger.ts'
import { WindowControls } from './TitleBar.tsx'

/**
 * The head's own control: the same body as every other control in the window — one height, one
 * radius, one hairline — because it stands in a row beside actions that are words.
 */
const SELECT_CLASS = `${CONTROL_HEIGHT} px-2 text-xs text-parchment-dim transition-colors hover:text-parchment ${FIELD_FRAME}`

/** What the session has spent. Cost is shown only when the model's own cost data is non-zero. */
function UsageReadout() {
  const t = useText()
  const totals = () => totalUsage(conversations.transcript)

  return (
    <Show when={totals().totalTokens !== 0}>
      <span class="shrink-0 font-mono text-micro text-parchment-faint" title={t('header.tokens')}>
        {formatTokens(totals().totalTokens)} tokens
        {formatCost(totals().cost) === '' ? '' : ` · ${formatCost(totals().cost)}`}
      </span>
    </Show>
  )
}

/** Exporting and deleting are things you do to a conversation, so they live with its title. */
function ConversationActions() {
  const t = useText()
  const [written, setWritten] = createSignal('')

  return (
    <span class="flex shrink-0 items-center gap-3">
      <Show when={written() !== ''}>
        <span class="font-mono text-micro text-jade">{t('header.exportedTo', { path: written() })}</span>
      </Show>
      <button
        type="button"
        onClick={() => void conversationActions.exportMarkdown(conversations.activeId).then(setWritten)}
        class={TEXT_ACTION}
      >
        {t('header.export')}
      </button>
      <button
        type="button"
        onClick={() => void conversationActions.remove(conversations.activeId)}
        class={DESTRUCTIVE_ACTION}
      >
        {t('header.delete')}
      </button>
    </span>
  )
}

/**
 * The title of the page. It is what the band is for, so it takes the room that is left, keeps a
 * floor of its own, and truncates past it: a band that keeps its controls by squeezing its own title
 * to nothing has stopped saying what the page is.
 *
 * The quiet facts a conversation also has — which folder it is in, when it was last touched — are
 * not here. They are true of the row in the rail, which is where a conversation is chosen from, and
 * repeating them in the band costs the title the room it needs to say what the page is.
 */
function ConversationTitle() {
  return (
    <Show when={conversations.transcript.summary}>
      {(summary) => (
        <h1 class="min-w-24 flex-1 truncate font-display text-xl font-semibold tracking-tight text-parchment">
          {summary().title}
        </h1>
      )}
    </Show>
  )
}

/**
 * The head of the page, at the top of it: what this document is, and nothing else. With a
 * conversation open that is its title and what it has spent; with none it is the folder the next
 * message will land in, because a page about to be written still says what it is about.
 *
 * It is the first thing in the page's own scroll and pinned to its top, so it scrolls away with the
 * page and comes back to stay the moment the reader scrolls back — the glass under it is the page
 * colour, blurred, so the transcript passes behind it rather than under a second surface. Its
 * content stands on the page's column, the same edges the messages stand on (C5.4).
 *
 * A div rather than a `<header>`: the window has one banner — the head of the spine, with the
 * app's mark and the window's own controls — and a second element with that role would make "the
 * header" ambiguous, to a reader and to a test. The heading inside is what carries the meaning.
 */
export function DocHead() {
  const t = useText()

  // The head is the page's own mist, not a shelf of chrome: the transcript slides under a pane of
  // what it is written on, so the glass is the page colour, blurred, rather than the rail's.
  const band = `sticky top-0 z-20 bg-ink-700/80 backdrop-blur-xl ${BAND}`

  // A page that has not been asked anything yet has no head band: its name is set on the page
  // itself, large, where a title page puts it — and a document says its name once (ADR-0019).
  return (
    <Show when={conversations.transcript.summary}>
      {(summary) => (
        <div class={band}>
          {/* A page's band is chrome, and chrome does not move when the window does: the title stands
              on the page's own padding here exactly as it does on the tasks page and on every
              settings panel, at every width — and on the same x the page writes everything else on,
              so nothing in the page stands on a second edge. This band needs the page's padding and
              no more: it lives inside the transcript's own scroll, whose wheel room is already
              outside the box it is drawn in. */}
          <div class={`flex w-full items-center gap-4 ${PAGE}`}>
            <ConversationTitle />
            <div class="no-drag flex shrink-0 items-center gap-3">
              {/* The quiet facts are the first to give way: on a pane too small for them, the
                  tokens step out of the row before anything that acts does. */}
              <span class="hidden shrink-0 items-center @min-[40rem]/conversation:flex">
                <UsageReadout />
              </span>
              <ConversationActions />
              {/* What this conversation is, and how hard it should think: told apart by a rule rather
                  than by a row of controls of equal weight. Which model it runs on is chosen at the foot
                  of the composer, next to the message that will use it. */}
              <span class="h-4 w-px bg-line" aria-hidden="true" />
              <select
                aria-label={t('header.thinking')}
                value={summary().thinkingLevel}
                onInput={(event) =>
                  void conversationActions.setThinkingLevel(event.currentTarget.value as ThinkingLevel)
                }
                class={SELECT_CLASS}
              >
                <For each={THINKING_LEVELS}>{(level) => <option value={level}>{t(thinkingKey(level))}</option>}</For>
              </select>
            </div>
            {/* What acts on the window is not one of the page's concerns: past a rule, at the corner. */}
            <span class="no-drag flex shrink-0 items-center gap-4">
              <span class="h-4 w-px bg-line" aria-hidden="true" />
              <WindowControls />
            </span>
          </div>
        </div>
      )}
    </Show>
  )
}
