import {
  type ChatBlockAttachment,
  type ChatBlockCompaction,
  type ChatBlockThinking,
  type ChatMessage,
  formatDuration,
  type TextKey,
  type TextParams,
} from '@alpha/core'
import { memo, useState } from 'react'
import { copyText, markdownOf } from '../lib/clipboard.ts'
import { useConversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { TEXT_ACTION } from './controls.ts'
import { Markdown } from './Markdown.tsx'
import { ToolRow } from './ToolRow.tsx'

/**
 * A picture the message carried. It is shown rather than named, because it is what the model was
 * handed: a reader scrolling back sees the same thing the answer was about.
 */
function AttachmentThumb({ block }: { block: ChatBlockAttachment }) {
  const t = useText()
  return (
    <img
      src={`data:${block.mimeType};base64,${block.data}`}
      alt={t('message.attachment')}
      className="max-h-48 w-auto rounded-card border border-line object-contain"
    />
  )
}

function ThinkingBlock({ block }: { block: ChatBlockThinking }) {
  const t = useText()
  const elapsed = formatDuration(block.startedAt, block.endedAt)
  return (
    <details className="mb-3 rounded-card border border-line bg-ink-800/60 px-3 py-2">
      <summary className="cursor-pointer list-none font-mono text-micro uppercase tracking-wider text-parchment-faint">
        {t('message.thinking')}
        {elapsed === '' ? '' : ` · ${elapsed}`}
      </summary>
      <p className="mt-2 whitespace-pre-wrap font-mono text-code leading-[1.6] text-parchment-dim">{block.text}</p>
    </details>
  )
}

/** Where the runtime summarised the history, with the summary readable rather than folded away. */
function CompactionMarker({ block }: { block: ChatBlockCompaction }) {
  const t = useText()
  return (
    <details className="mb-3 rounded-card border border-dashed border-line bg-ink-800/50 px-3 py-2">
      <summary className="cursor-pointer list-none font-mono text-micro uppercase tracking-wider text-parchment-faint">
        {t(block.replaced === undefined ? 'message.compacted' : 'message.compactedCount', {
          count: block.replaced ?? 0,
        })}
      </summary>
      <p className="mt-2 whitespace-pre-wrap text-code leading-[1.6] text-parchment-dim">{block.summary}</p>
    </details>
  )
}

/**
 * Editing a message that has already been answered is a decision about the transcript, so both
 * outcomes are named here rather than one of them being the silent default.
 */
function EditBox({ message, index }: { message: ChatMessage; index: number }) {
  const t = useText()
  const editMessage = useConversations((state) => state.editMessage)
  const [text, setText] = useState(message.blocks.map((block) => (block.kind === 'text' ? block.text : '')).join('\n'))

  return (
    <div className="w-3/4 border border-amber/40 bg-ink-900/60 p-3">
      <textarea
        rows={3}
        value={text}
        aria-label={t('message.editLabel')}
        onChange={(event) => setText(event.target.value)}
        className="block w-full resize-none border border-line bg-ink-700 px-2.5 py-2 text-sm leading-relaxed text-parchment focus:border-line-strong focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void editMessage(index, text, 'replace')}
          className="bg-accent px-3 py-1 text-xs font-medium text-accent-ink transition-colors hover:bg-accent-bright"
        >
          {t('message.resend')}
        </button>
        <button
          type="button"
          onClick={() => void editMessage(index, text, 'fork')}
          className="border border-line px-3 py-1 text-xs text-parchment transition-colors hover:bg-ink-700"
        >
          {t('message.fork')}
        </button>
      </div>
      <p className="mt-1.5 text-micro text-parchment-faint">{t('message.editNote')}</p>
    </div>
  )
}

function StatusNote({ message }: { message: ChatMessage }) {
  const t = useText()
  if (message.status === 'interrupted') {
    return <p className="mt-2 font-mono text-micro uppercase tracking-wider text-amber">{t('message.stopped')}</p>
  }
  if (message.status === 'failed') {
    return (
      <p className="mt-2 rounded-card border border-danger/40 bg-danger/10 px-3 py-2 text-code text-danger">
        {message.error ?? t('message.failed')}
      </p>
    )
  }
  return null
}

export const MessageView = memo(function MessageView({
  message,
  index,
  last = false,
}: {
  message: ChatMessage
  index: number
  /** The last message in the transcript, which is the only one with anything to regenerate. */
  last?: boolean
}) {
  const t = useText()
  const regenerate = useConversations((state) => state.regenerate)
  const running = useConversations((state) => state.transcript.status === 'running')
  const [editing, setEditing] = useState(false)
  const words = message.blocks.map((block) => (block.kind === 'text' ? block.text : '')).join('\n')

  if (message.role === 'user') {
    return (
      <article className="group flex flex-col" data-role="user">
        {editing ? (
          <EditBox message={message} index={index} />
        ) : (
          <>
            {/* The pictures sit above the words they came with, which is the order they were
                attached in and the order the model read them. */}
            <div className="flex flex-col items-start gap-2">
              {message.blocks
                .filter((block): block is ChatBlockAttachment => block.kind === 'attachment')
                .map((block, index) => {
                  // Blocks are append-only, so a picture's position among them is its identity.
                  const key = `${message.id}-shot-${index}`
                  return <AttachmentThumb key={key} block={block} />
                })}
              {words !== '' && (
                // The question is set in the display voice, a size above the answer: it is the
                // heading of everything that follows it, and the one place the manuscript's
                // voice is heard in the body of the page.
                <p className="max-w-measure font-display text-lg leading-[1.5] whitespace-pre-wrap">{words}</p>
              )}
            </div>
            {/* One row of actions, revealed over the entry rather than printed in it: an entry at
                rest is its number, its words and the rule under them, and the answer below is
                what has to be readable. The answer's own row stays visible — that is the thing
                a reader copies. */}
            <div className="mt-1 flex items-center gap-3">
              <CopyButton
                what="message.copyMessage"
                label="message.copy"
                text={markdownOf(message.blocks)}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
              />
              {!running && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className={`opacity-0 group-hover:opacity-100 focus:opacity-100 ${TEXT_ACTION}`}
                >
                  {t('message.edit')}
                </button>
              )}
            </div>
            {/* The entry's own rule, drawn under everything that belongs to it — the words and the
                two things you can do to them — and before the work that answers it. */}
            <span className="mt-2 h-px w-full bg-line" aria-hidden="true" />
          </>
        )}
      </article>
    )
  }

  const streaming = message.status === 'streaming'
  const firstTool = message.blocks.findIndex((block) => block.kind === 'tool')
  // Nothing to copy until something has been said: an action row under an empty streaming
  // answer is a control for a thing that is not there yet.
  const spoken = message.blocks.some((block) => block.kind === 'text' && block.text !== '')
  return (
    <article className="flex flex-col" data-role="assistant">
      {message.blocks.map((block, index) => {
        const isLast = index === message.blocks.length - 1
        // Blocks are append-only within a message, so the position is the identity: two text
        // blocks with the same text are still two blocks.
        const key = `${message.id}-${index}`
        if (block.kind === 'thinking') return <ThinkingBlock key={key} block={block} />
        // A ledger that opens the answer hangs directly under the entry's own rule, so its first
        // row is the one that does not draw a second rule beside it.
        if (block.kind === 'tool') {
          return <ToolRow key={block.callId} block={block} first={index === firstTool} />
        }
        if (block.kind === 'compaction') return <CompactionMarker key={key} block={block} />
        if (block.kind === 'attachment') return <AttachmentThumb key={key} block={block} />
        return (
          <div key={key} className="relative">
            <Markdown text={block.text} caret={streaming && isLast} />
          </div>
        )
      })}
      {streaming && message.blocks.length === 0 && <span className="caret" aria-hidden="true" />}
      <StatusNote message={message} />
      {spoken && (
        <div className="mt-1.5 flex items-center gap-3">
          <CopyButton what="message.copyAnswer" label="message.copy" text={markdownOf(message.blocks)} />
          {/* Only the last answer can be regenerated: it re-runs the last question, so offering
              it under every answer would replace a different one than the reader is pointing at. */}
          {last && !streaming && !running && (
            <button type="button" onClick={() => void regenerate()} className={TEXT_ACTION}>
              {t('message.regenerate')}
            </button>
          )}
        </div>
      )}
    </article>
  )
})

/**
 * Copies what is on screen: a message as markdown, a tool row as its output. Its words are keys,
 * not strings: this button is used in three places and the three say different things.
 */
export function CopyButton({
  what,
  text,
  label,
  params,
  className = '',
}: {
  /** What the accessible name says it copies. */
  what: TextKey
  text: string
  /** What the button itself says. */
  label: TextKey
  params?: TextParams
  className?: string
}) {
  const t = useText()
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')

  return (
    <button
      type="button"
      aria-label={t(what, params)}
      onClick={() => {
        void copyText(text).then((ok) => setState(ok ? 'done' : 'failed'))
      }}
      className={`${TEXT_ACTION} ${state === 'done' ? 'text-jade' : ''} ${state === 'failed' ? 'text-danger' : ''} ${className}`}
    >
      {t(state === 'done' ? 'message.copied' : state === 'failed' ? 'message.copyFailed' : label, params)}
    </button>
  )
}
