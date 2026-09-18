import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { useShell } from '../stores/shell.ts'

/**
 * The composer sends; everything about whether it *may* send is stated in the hint under it
 * rather than left to a disabled button with no explanation.
 */
export function Composer() {
  const [text, setText] = useState('')
  const workspace = useShell((state) => state.workspace)
  const model = useShell((state) => state.model)
  const status = useConversations((state) => state.transcript.status)
  const sendOrCreate = useConversations((state) => state.sendOrCreate)
  const navigate = useNavigate()

  const hasWorkspace = workspace.kind === 'selected'
  const running = status === 'running'
  const canSend = hasWorkspace && model.configured && !running && text.trim() !== ''

  const send = async () => {
    if (!canSend || workspace.kind !== 'selected') return
    const message = text
    setText('')
    const id = await sendOrCreate(workspace.workspace.path, message)
    void navigate({ to: '/c/$conversationId', params: { conversationId: id } })
  }

  const hint = () => {
    if (!hasWorkspace) return 'A workspace is the folder the agent works in.'
    if (!model.configured) return `No model configured yet: ${model.description}`
    if (running) return 'The agent is working. Stop and queueing arrive with turn control.'
    return 'Enter sends, Shift+Enter starts a new line.'
  }

  return (
    <div className="shrink-0 border-t border-line bg-ink-900 px-6 pb-5 pt-4">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-card border border-line bg-ink-700 px-3 py-2.5 focus-within:border-line-strong">
          <textarea
            rows={2}
            aria-label="Message the agent"
            value={text}
            placeholder={hasWorkspace ? 'Ask the agent to change something…' : 'Open a folder first'}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            className="block w-full resize-none bg-transparent text-[15px] leading-relaxed text-parchment placeholder:text-parchment-faint focus:outline-none"
          />
          <div className="mt-1 flex items-center justify-between gap-4">
            <span className="text-[11px] text-parchment-faint">{hint()}</span>
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              className="rounded-control bg-ember px-3 py-1 text-[12px] font-medium text-ember-ink transition-colors hover:bg-ember-bright disabled:cursor-not-allowed disabled:bg-ember/25 disabled:text-ember-ink/60"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
