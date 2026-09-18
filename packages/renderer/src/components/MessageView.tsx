import type { ChatMessage } from '@alpha/core'
import { memo } from 'react'
import { Markdown } from './Markdown.tsx'

function ThinkingBlock({ text }: { text: string }) {
  return (
    <details className="mb-3 rounded-card border border-line bg-ink-800/60 px-3 py-2">
      <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-wider text-parchment-faint">
        Thinking
      </summary>
      <p className="mt-2 whitespace-pre-wrap font-mono text-[12.5px] leading-[1.6] text-parchment-dim">{text}</p>
    </details>
  )
}

function StatusNote({ message }: { message: ChatMessage }) {
  if (message.status === 'interrupted') {
    return <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-amber">Interrupted</p>
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

export const MessageView = memo(function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <article className="flex justify-end" data-role="user">
        <div className="max-w-[75%] rounded-card border border-line bg-ink-700 px-3.5 py-2.5 text-[15px] leading-[1.6] whitespace-pre-wrap text-parchment">
          {message.blocks.map((block) => block.text).join('\n')}
        </div>
      </article>
    )
  }

  const streaming = message.status === 'streaming'
  return (
    <article className="flex flex-col" data-role="assistant">
      {message.blocks.map((block, index) => {
        const isLast = index === message.blocks.length - 1
        // Blocks are append-only within a message, so the position is the identity: two text
        // blocks with the same text are still two blocks.
        const key = `${message.id}-${index}`
        if (block.kind === 'thinking') return <ThinkingBlock key={key} text={block.text} />
        return (
          <div key={key} className="relative">
            <Markdown text={block.text} />
            {streaming && isLast && <span className="ember-cursor ml-0.5" aria-hidden="true" />}
          </div>
        )
      })}
      {streaming && message.blocks.length === 0 && <span className="ember-cursor" aria-hidden="true" />}
      <StatusNote message={message} />
    </article>
  )
})
