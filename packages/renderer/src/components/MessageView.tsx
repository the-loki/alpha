import { type ChatBlockCompaction, type ChatBlockThinking, type ChatMessage, formatDuration } from '@alpha/core'
import { memo, useState } from 'react'
import { copyText, markdownOf } from '../lib/clipboard.ts'
import { useConversations } from '../stores/conversations.ts'
import { Markdown } from './Markdown.tsx'
import { ToolRow } from './ToolRow.tsx'

function ThinkingBlock({ block }: { block: ChatBlockThinking }) {
  const elapsed = formatDuration(block.startedAt, block.endedAt)
  return (
    <details className="mb-3 rounded-card border border-line bg-ink-800/60 px-3 py-2">
      <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-wider text-parchment-faint">
        Thinking{elapsed === '' ? '' : ` · ${elapsed}`}
      </summary>
      <p className="mt-2 whitespace-pre-wrap font-mono text-[12.5px] leading-[1.6] text-parchment-dim">{block.text}</p>
    </details>
  )
}

/** Where the runtime summarised the history, with the summary readable rather than folded away. */
function CompactionMarker({ block }: { block: ChatBlockCompaction }) {
  return (
    <details className="mb-3 rounded-card border border-dashed border-line bg-ink-800/50 px-3 py-2">
      <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-wider text-parchment-faint">
        History summarised here
        {block.replaced === undefined ? '' : ` · ${block.replaced} messages`}
      </summary>
      <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-[1.6] text-parchment-dim">{block.summary}</p>
    </details>
  )
}

/**
 * Editing a message that has already been answered is a decision about the transcript, so both
 * outcomes are named here rather than one of them being the silent default.
 */
function EditBox({ message, index }: { message: ChatMessage; index: number }) {
  const editMessage = useConversations((state) => state.editMessage)
  const [text, setText] = useState(message.blocks.map((block) => (block.kind === 'text' ? block.text : '')).join('\n'))

  return (
    <div className="w-[75%] rounded-card border border-amber/40 bg-ink-800 p-3">
      <textarea
        rows={3}
        value={text}
        aria-label="Edit the message"
        onChange={(event) => setText(event.target.value)}
        className="block w-full resize-none rounded-control border border-line bg-ink-900 px-2.5 py-2 text-[14px] leading-relaxed text-parchment focus:border-line-strong focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void editMessage(index, text, 'replace')}
          className="rounded-control bg-ember px-3 py-1 text-[12px] font-medium text-ember-ink transition-colors hover:bg-ember-bright"
        >
          Resend, replacing what followed
        </button>
        <button
          type="button"
          onClick={() => void editMessage(index, text, 'fork')}
          className="rounded-control border border-line px-3 py-1 text-[12px] text-parchment transition-colors hover:bg-ink-700"
        >
          Fork into a new conversation
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-parchment-faint">
        Replacing drops the messages after this one. Forking copies them to a new conversation and leaves this one
        alone.
      </p>
    </div>
  )
}

function StatusNote({ message }: { message: ChatMessage }) {
  if (message.status === 'interrupted') {
    return (
      <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-amber">
        Stopped — what arrived before the stop is kept
      </p>
    )
  }
  if (message.status === 'failed') {
    return (
      <p className="mt-2 rounded-card border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
        {message.error ?? 'The turn failed.'}
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
  const regenerate = useConversations((state) => state.regenerate)
  const running = useConversations((state) => state.transcript.status === 'running')
  const [editing, setEditing] = useState(false)

  if (message.role === 'user') {
    return (
      <article className="group flex flex-col items-end gap-1.5" data-role="user">
        {editing ? (
          <EditBox message={message} index={index} />
        ) : (
          <div className="max-w-[68ch] rounded-card border border-line bg-ink-700 px-3.5 py-2.5 text-[15px] leading-[1.6] whitespace-pre-wrap text-parchment">
            {message.blocks.map((block) => (block.kind === 'text' ? block.text : '')).join('\n')}
          </div>
        )}
        {!editing && (
          <CopyButton what="message" text={markdownOf(message.blocks)} className="group-hover:opacity-100" />
        )}
        {!editing && !running && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-mono text-[11px] text-parchment-faint opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          >
            Edit
          </button>
        )}
      </article>
    )
  }

  const streaming = message.status === 'streaming'
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
        if (block.kind === 'tool') return <ToolRow key={block.callId} block={block} />
        if (block.kind === 'compaction') return <CompactionMarker key={key} block={block} />
        return (
          <div key={key} className="relative">
            <Markdown text={block.text} />
            {streaming && isLast && <span className="ember-cursor ml-0.5" aria-hidden="true" />}
          </div>
        )
      })}
      {streaming && message.blocks.length === 0 && <span className="ember-cursor" aria-hidden="true" />}
      <StatusNote message={message} />
      {spoken && (
        <div className="mt-1.5 flex items-center gap-3">
          <CopyButton what="answer" text={markdownOf(message.blocks)} />
          {/* Only the last answer can be regenerated: it re-runs the last question, so offering
              it under every answer would replace a different one than the reader is pointing at. */}
          {last && !streaming && !running && (
            <button
              type="button"
              onClick={() => void regenerate()}
              className="font-mono text-[11px] text-parchment-faint transition-colors hover:text-parchment"
            >
              Regenerate
            </button>
          )}
        </div>
      )}
    </article>
  )
})

/** Copies what is on screen: a message as markdown, a tool row as its output. */
export function CopyButton({ what, text, className = '' }: { what: string; text: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')

  return (
    <button
      type="button"
      aria-label={`Copy ${what}`}
      onClick={() => {
        void copyText(text).then((ok) => setState(ok ? 'done' : 'failed'))
      }}
      className={`font-mono text-[11px] text-parchment-faint transition-opacity transition-colors hover:text-parchment ${
        state === 'done' ? 'text-jade' : ''
      } ${state === 'failed' ? 'text-danger' : ''} ${className}`}
    >
      {state === 'done' ? 'copied' : state === 'failed' ? 'copy failed' : 'copy'}
    </button>
  )
}
