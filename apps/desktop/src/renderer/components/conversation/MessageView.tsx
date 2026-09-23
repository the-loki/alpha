import type { EditEffect } from '@alpha/contract'
import {
  type ChatBlock,
  type ChatBlockAttachment,
  type ChatBlockCompaction,
  type ChatBlockText,
  type ChatBlockThinking,
  type ChatBlockTool,
  type ChatMessage,
  formatDuration,
} from '@alpha/domain'
import { createSignal, For, Index, type JSX, Match, Show, Switch } from 'solid-js'
import { markdownOf } from '../../lib/clipboard.ts'
import { conversationActions, conversations } from '../../stores/conversations.ts'
import { useText } from '../../stores/shell.ts'
import { FIELD_FRAME, GROUP_LABEL, NOTICE, OUTLINED_ACTION, PRIMARY_ACTION, TEXT_ACTION } from '../controls.ts'
import { CopyButton } from './CopyButton.tsx'
import { Markdown } from './Markdown.tsx'
import { ToolRow } from './ToolRow.tsx'

/**
 * A picture the message carried. It is shown rather than named, because it is what the model was
 * handed: a reader scrolling back sees the same thing the answer was about. It is a thumbnail, not
 * a plate — the words it travelled with are the message, and the picture stands beside them.
 */
function AttachmentThumb(props: { block: ChatBlockAttachment }) {
  const t = useText()
  return (
    <img
      src={`data:${props.block.mimeType};base64,${props.block.data}`}
      alt={t('message.attachment')}
      class="h-20 max-w-40 rounded-md border border-line object-cover"
    />
  )
}

/** One fold in a message's own column: the label turns, the content sits under it, nothing is boxed. */
function Fold(props: { label: () => string; children: JSX.Element }) {
  return (
    <details class="group">
      <summary
        class={`inline-flex cursor-pointer list-none items-center gap-1.5 transition-colors duration-normal hover:text-foreground ${GROUP_LABEL}`}
      >
        {props.label()}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          class="h-3.5 w-3.5 shrink-0 transition-transform duration-normal group-open:rotate-90"
        >
          <path d="M6 4l4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </summary>
      {props.children}
    </details>
  )
}

function ThinkingBlock(props: { block: ChatBlockThinking }) {
  const t = useText()
  const elapsed = () => formatDuration(props.block.startedAt, props.block.endedAt)
  return (
    <Fold label={() => `${t('message.thinking')}${elapsed() === '' ? '' : ` · ${elapsed()}`}`}>
      <p class="mt-2 font-text text-body leading-relaxed whitespace-pre-wrap wrap-anywhere text-muted">
        {props.block.text}
      </p>
    </Fold>
  )
}

/** Where the runtime summarised the history, with the summary readable rather than folded away. */
function CompactionMarker(props: { block: ChatBlockCompaction }) {
  const t = useText()
  return (
    <Fold
      label={() =>
        t(props.block.replaced === undefined ? 'message.compacted' : 'message.compactedCount', {
          count: props.block.replaced ?? 0,
        })
      }
    >
      <p class="mt-2 font-text text-body leading-relaxed whitespace-pre-wrap wrap-anywhere text-muted">
        {props.block.summary}
      </p>
    </Fold>
  )
}

/**
 * Editing a message that has already been answered is a decision about the transcript, so both
 * outcomes are named here rather than one of them being the silent default.
 */
function EditBox(props: { message: ChatMessage; index: number; onDone: () => void }) {
  const t = useText()
  const [text, setText] = createSignal(
    props.message.blocks.map((block) => (block.kind === 'text' ? block.text : '')).join('\n'),
  )

  // The box closes on the decision rather than on the answer: the row this message moves to is
  // drawn from the transcript the edit returns, so a box left open would go on showing the old words.
  const submit = (effect: EditEffect) => {
    props.onDone()
    void conversationActions.editMessage(props.index, text(), effect)
  }

  return (
    // Editing is happening now, not a warning: the frame tints accent while the words are being
    // changed, and the field inside keeps its neutral edge (C5.2).
    <div class="w-3/4 rounded-md border border-accent/60 bg-surface-1 p-3">
      <textarea
        rows={3}
        value={text()}
        aria-label={t('message.editLabel')}
        onInput={(event) => setText(event.target.value)}
        class={`block w-full resize-none px-2.5 py-2 font-text text-body leading-relaxed ${FIELD_FRAME}`}
      />
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => submit('replace')} class={PRIMARY_ACTION}>
          {t('message.resend')}
        </button>
        <button type="button" onClick={() => submit('fork')} class={OUTLINED_ACTION}>
          {t('message.fork')}
        </button>
      </div>
      <p class="mt-1.5 max-w-measure font-text text-name text-faint">{t('message.editNote')}</p>
    </div>
  )
}

function StatusNote(props: { message: ChatMessage }) {
  const t = useText()
  return (
    <>
      <Show when={props.message.status === 'interrupted'}>
        <p class={`mt-2 flex items-center ${NOTICE} border-warning font-mono text-label text-warning`}>
          <span aria-hidden="true" class="mr-1.5 h-1.5 w-1.5 bg-warning" />
          {t('message.stopped')}
        </p>
      </Show>
      <Show when={props.message.status === 'failed'}>
        <p class={`mt-2 ${NOTICE} border-danger font-mono text-code text-danger`}>
          <span class="min-w-0 wrap-anywhere">{props.message.error ?? t('message.failed')}</span>
        </p>
      </Show>
    </>
  )
}

/**
 * The reader's own entry: a bordered card on a sunken step, holding the pictures and words they
 * sent, and the two things one does to them (C5.5).
 */
function QuestionView(props: { message: ChatMessage; index: number }) {
  const t = useText()
  const [editing, setEditing] = createSignal(false)
  const running = () => conversations.transcript.status === 'running'
  const pictures = () =>
    props.message.blocks.filter((block): block is ChatBlockAttachment => block.kind === 'attachment')
  const words = () => props.message.blocks.map((block) => (block.kind === 'text' ? block.text : '')).join('\n')

  return (
    <article class="group flex flex-col items-end" data-role="user">
      <Show
        when={editing()}
        fallback={
          <>
            {/* The pictures stand above the card, set to the same edge: they were what was handed
                over, and the card holds what was said about them — the order they arrived in, the
                order the model read them in. */}
            <Show when={pictures().length > 0}>
              <div class="mb-2 flex max-w-full flex-wrap justify-end gap-2">
                <For each={pictures()}>{(block) => <AttachmentThumb block={block} />}</For>
              </div>
            </Show>
            <div class="flex max-w-2xl min-w-0 flex-col items-start rounded-md border border-line bg-surface-1 px-4 py-3">
              <p class="font-text text-body leading-relaxed whitespace-pre-wrap wrap-anywhere text-foreground">
                {words()}
              </p>
            </div>
            {/* One row of actions, revealed under the card rather than shown beside it: a
                message at rest is its words alone, and the answer below is what has to be
                readable. */}
            <div class="mt-1 flex items-center gap-3">
              <CopyButton
                what="message.copyMessage"
                label="message.copy"
                text={markdownOf(props.message.blocks)}
                class="opacity-0 group-hover:opacity-100 focus:opacity-100"
              />
              <Show when={!running()}>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  class={`opacity-0 group-hover:opacity-100 focus:opacity-100 ${TEXT_ACTION}`}
                >
                  {t('message.edit')}
                </button>
              </Show>
            </div>
          </>
        }
      >
        <EditBox message={props.message} index={props.index} onDone={() => setEditing(false)} />
      </Show>
    </article>
  )
}

/** One block of an answer, drawn as what it is: prose, thinking, a tool call, a summary, a picture. */
function BlockView(props: { block: () => ChatBlock; caret: boolean }) {
  const kind = () => props.block().kind
  const text = () => (props.block() as ChatBlockText).text
  const thinking = () => props.block() as ChatBlockThinking
  const tool = () => props.block() as ChatBlockTool
  const compaction = () => props.block() as ChatBlockCompaction
  const attachment = () => props.block() as ChatBlockAttachment

  return (
    <Switch
      fallback={
        <div class="relative">
          <Markdown text={text()} caret={props.caret} />
        </div>
      }
    >
      <Match when={kind() === 'thinking'}>
        <ThinkingBlock block={thinking()} />
      </Match>
      <Match when={kind() === 'tool'}>
        <ToolRow block={tool()} />
      </Match>
      <Match when={kind() === 'compaction'}>
        <CompactionMarker block={compaction()} />
      </Match>
      <Match when={kind() === 'attachment'}>
        <AttachmentThumb block={attachment()} />
      </Match>
    </Switch>
  )
}

/** The work the question produced: thinking, tool calls, the answer, and what it cost. */
function AnswerView(props: { message: ChatMessage; last: boolean }) {
  const t = useText()
  const streaming = () => props.message.status === 'streaming'
  const running = () => conversations.transcript.status === 'running'
  // Nothing to copy until something has been said: an action row under an empty streaming
  // answer is a control for a thing that is not there yet.
  const spoken = () => props.message.blocks.some((block) => block.kind === 'text' && block.text !== '')

  return (
    // The answer is the text of the page itself: written on the page, full width and unboxed.
    // The reader's words are the visitors in it, set apart in their card.
    <article class="group/answer w-full" data-role="assistant">
      <div class="flex flex-col gap-3">
        <Index each={props.message.blocks}>
          {(block, index) => (
            <BlockView block={block} caret={streaming() && index === props.message.blocks.length - 1} />
          )}
        </Index>
      </div>
      {/* An answer that has not said anything yet is still an answer arriving: the accent's caret
          is the only thing on the page that says so (C5.5). */}
      <Show when={streaming() && props.message.blocks.length === 0}>
        <span class="caret" aria-hidden="true" />
      </Show>
      <StatusNote message={props.message} />
      <Show when={spoken()}>
        {/* One row of actions under the answer, revealed to the hand that points at it: at rest
            an answer is its words alone. */}
        <div class="mt-1.5 flex items-center gap-3 opacity-0 transition-opacity duration-normal group-focus-within/answer:opacity-100 group-hover/answer:opacity-100">
          <CopyButton what="message.copyAnswer" label="message.copy" text={markdownOf(props.message.blocks)} />
          {/* Only the last answer can be regenerated: it re-runs the last question, so offering
              it under every answer would replace a different one than the reader is pointing at. */}
          <Show when={props.last && !streaming() && !running()}>
            <button type="button" onClick={() => void conversationActions.regenerate()} class={TEXT_ACTION}>
              {t('message.regenerate')}
            </button>
          </Show>
        </div>
      </Show>
    </article>
  )
}

/** One message: the reader's entry, or the work that answered it. */
export function MessageView(props: { message: ChatMessage; index: number; last?: boolean }) {
  return (
    <Show
      when={props.message.role === 'user'}
      fallback={<AnswerView message={props.message} last={props.last === true} />}
    >
      <QuestionView message={props.message} index={props.index} />
    </Show>
  )
}
