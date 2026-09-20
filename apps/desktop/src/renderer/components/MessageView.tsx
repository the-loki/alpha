import {
  type ChatBlock,
  type ChatBlockAttachment,
  type ChatBlockCompaction,
  type ChatBlockText,
  type ChatBlockThinking,
  type ChatBlockTool,
  type ChatMessage,
  type EditEffect,
  formatDuration,
  type TextKey,
  type TextParams,
} from '@alpha/core'
import { createSignal, For, Index, Match, Show, Switch } from 'solid-js'
import { copyText, markdownOf } from '../lib/clipboard.ts'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { FIELD_FRAME, GROUP_LABEL, OUTLINED_ACTION, PRIMARY_ACTION, TEXT_ACTION } from './controls.ts'
import { Markdown } from './Markdown.tsx'
import { ToolRow } from './ToolRow.tsx'

/**
 * A picture the message carried. It is shown rather than named, because it is what the model was
 * handed: a reader scrolling back sees the same thing the answer was about.
 */
function AttachmentThumb(props: { block: ChatBlockAttachment }) {
  const t = useText()
  return (
    <img
      src={`data:${props.block.mimeType};base64,${props.block.data}`}
      alt={t('message.attachment')}
      class="max-h-48 w-auto rounded-card border border-line object-contain"
    />
  )
}

function ThinkingBlock(props: { block: ChatBlockThinking }) {
  const t = useText()
  const elapsed = () => formatDuration(props.block.startedAt, props.block.endedAt)
  return (
    <details class="mb-3 rounded-card border border-line bg-ink-800/60 px-3 py-2">
      <summary class={`cursor-pointer list-none ${GROUP_LABEL}`}>
        {t('message.thinking')}
        {elapsed() === '' ? '' : ` · ${elapsed()}`}
      </summary>
      <p class="mt-2 whitespace-pre-wrap font-mono text-code leading-[1.6] text-parchment-dim">{props.block.text}</p>
    </details>
  )
}

/** Where the runtime summarised the history, with the summary readable rather than folded away. */
function CompactionMarker(props: { block: ChatBlockCompaction }) {
  const t = useText()
  return (
    <details class="mb-3 rounded-card border border-dashed border-line bg-ink-800/50 px-3 py-2">
      <summary class={`cursor-pointer list-none ${GROUP_LABEL}`}>
        {t(props.block.replaced === undefined ? 'message.compacted' : 'message.compactedCount', {
          count: props.block.replaced ?? 0,
        })}
      </summary>
      <p class="mt-2 whitespace-pre-wrap text-code leading-[1.6] text-parchment-dim">{props.block.summary}</p>
    </details>
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
    <div class="w-3/4 rounded-card border border-amber/40 bg-ink-900/60 p-3">
      <textarea
        rows={3}
        value={text()}
        aria-label={t('message.editLabel')}
        onInput={(event) => setText(event.target.value)}
        class={`block w-full resize-none px-2.5 py-2 text-body leading-relaxed text-parchment ${FIELD_FRAME}`}
      />
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => submit('replace')} class={PRIMARY_ACTION}>
          {t('message.resend')}
        </button>
        <button type="button" onClick={() => submit('fork')} class={OUTLINED_ACTION}>
          {t('message.fork')}
        </button>
      </div>
      <p class="mt-1.5 text-micro text-parchment-faint">{t('message.editNote')}</p>
    </div>
  )
}

function StatusNote(props: { message: ChatMessage }) {
  const t = useText()
  return (
    <>
      <Show when={props.message.status === 'interrupted'}>
        <p class="mt-2 font-mono text-micro uppercase tracking-wider text-amber">{t('message.stopped')}</p>
      </Show>
      <Show when={props.message.status === 'failed'}>
        <p class="mt-2 rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-code text-danger">
          {props.message.error ?? t('message.failed')}
        </p>
      </Show>
    </>
  )
}

/** The reader's own entry: the pictures and words they sent, and the two things one does to them. */
function QuestionView(props: { message: ChatMessage; index: number }) {
  const t = useText()
  const [editing, setEditing] = createSignal(false)
  const running = () => conversations.transcript.status === 'running'
  const pictures = () =>
    props.message.blocks.filter((block): block is ChatBlockAttachment => block.kind === 'attachment')
  const words = () => props.message.blocks.map((block) => (block.kind === 'text' ? block.text : '')).join('\n')

  return (
    <article class="group flex flex-col" data-role="user">
      <Show
        when={editing()}
        fallback={
          <>
            {/* The pictures sit above the words they came with, which is the order they were
                attached in and the order the model read them. */}
            <div class="flex flex-col items-start gap-2">
              <For each={pictures()}>{(block) => <AttachmentThumb block={block} />}</For>
              <Show when={words() !== ''}>
                {/* The question is set in the display voice, a size above the answer: it is the
                    heading of everything that follows it, and the one place the manuscript's
                    voice is heard in the body of the page. */}
                <p class="max-w-measure font-display text-lg leading-[1.5] whitespace-pre-wrap">{words()}</p>
              </Show>
            </div>
            {/* One row of actions, revealed over the entry rather than printed in it: an entry at
                rest is its number, its words and the rule under them, and the answer below is
                what has to be readable. The answer's own row stays visible — that is the thing
                a reader copies. */}
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
            {/* The entry's own rule, drawn under everything that belongs to it — the words and the
                two things you can do to them — and before the work that answers it. */}
            <span class="mt-2 h-px w-full bg-line" aria-hidden="true" />
          </>
        }
      >
        <EditBox message={props.message} index={props.index} onDone={() => setEditing(false)} />
      </Show>
    </article>
  )
}

/** One block of an answer, drawn as what it is: prose, thinking, a ledger row, a summary, a picture. */
function BlockView(props: { block: () => ChatBlock; caret: boolean; first: boolean }) {
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
      {/* A ledger that opens the answer hangs directly under the entry's own rule, so its first
          row is the one that does not draw a second rule beside it. */}
      <Match when={kind() === 'tool'}>
        <ToolRow block={tool()} first={props.first} />
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

/** The work the question produced: thinking, tool rows, the answer, and what it cost. */
function AnswerView(props: { message: ChatMessage; last: boolean }) {
  const t = useText()
  const streaming = () => props.message.status === 'streaming'
  const running = () => conversations.transcript.status === 'running'
  const firstTool = () => props.message.blocks.findIndex((block) => block.kind === 'tool')
  // Nothing to copy until something has been said: an action row under an empty streaming
  // answer is a control for a thing that is not there yet.
  const spoken = () => props.message.blocks.some((block) => block.kind === 'text' && block.text !== '')

  return (
    <article class="flex flex-col" data-role="assistant">
      <Index each={props.message.blocks}>
        {(block, index) => (
          <BlockView
            block={block}
            first={index === firstTool()}
            caret={streaming() && index === props.message.blocks.length - 1}
          />
        )}
      </Index>
      {/* An answer that has not said anything yet is still an answer arriving: the caret is the
          only thing on the page that says so. */}
      <Show when={streaming() && props.message.blocks.length === 0}>
        <span class="caret" aria-hidden="true" />
      </Show>
      <StatusNote message={props.message} />
      <Show when={spoken()}>
        <div class="mt-1.5 flex items-center gap-3">
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
      class={`${TEXT_ACTION} ${state() === 'done' ? 'text-jade' : ''} ${state() === 'failed' ? 'text-danger' : ''} ${props.class ?? ''}`}
    >
      {t(
        state() === 'done' ? 'message.copied' : state() === 'failed' ? 'message.copyFailed' : props.label,
        props.params,
      )}
    </button>
  )
}
