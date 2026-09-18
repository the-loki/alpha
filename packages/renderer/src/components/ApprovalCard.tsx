import { type ApprovalRequest, levelLabel, type RuleScope, riskLabel } from '@alpha/core'
import { useEffect, useRef, useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { DiffView } from './DiffView.tsx'

/**
 * The gate, in the transcript. It says what is about to run and where, and waits: nothing happens
 * until one of the three answers is given. The keyboard is the fast path — Enter allows once,
 * Escape denies — because a card that needs a mouse is a card that gets clicked without reading.
 */
export function ApprovalCard({ request }: { request: ApprovalRequest }) {
  const answer = useConversations((state) => state.answerApproval)
  const [reason, setReason] = useState('')
  const [scope, setScope] = useState<RuleScope>('conversation')
  const field = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    field.current?.focus()
  }, [])

  const settle = async (input: Parameters<typeof answer>[0]) => {
    if (busy) return
    setBusy(true)
    await answer(input)
  }

  const allowOnce = () => void settle({ requestId: request.requestId, decision: 'once' })
  const allowAlways = () => void settle({ requestId: request.requestId, decision: 'always', scope })
  const deny = () => void settle({ requestId: request.requestId, decision: 'deny', reason: reason.trim() })

  return (
    <section
      aria-label="Waiting for your decision"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          allowOnce()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          deny()
        }
      }}
      className="overflow-hidden rounded-card border border-line border-l-2 border-l-amber bg-ink-800/80"
    >
      <header className="flex items-baseline gap-2 px-3.5 pb-1 pt-2.5">
        <span className="font-mono text-micro uppercase tracking-wider text-amber">
          {request.risk === 'execute' ? 'Wants to run a command' : 'Wants to change a file'}
        </span>
        <span className="text-micro text-parchment-faint">· {levelLabel(request.level)}</span>
      </header>

      <div className="px-3.5 pb-1">
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-ui leading-relaxed text-parchment">
          {request.detail === '' ? riskLabel(request.risk) : request.detail}
        </pre>
        <p className="mt-0.5 font-mono text-micro text-parchment-faint">in {request.cwd}</p>
        {request.diff !== undefined && <DiffView diff={request.diff} />}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line px-3.5 py-2.5">
        <button
          type="button"
          onClick={allowOnce}
          disabled={busy}
          className="rounded-control bg-ember px-3 py-1 text-xs font-medium text-ember-ink transition-colors hover:bg-ember-bright disabled:opacity-60"
        >
          Allow once
        </button>

        <div className="flex items-center rounded-control border border-line bg-ink-700">
          <button
            type="button"
            onClick={allowAlways}
            disabled={busy}
            className="px-3 py-1 text-xs text-parchment transition-colors hover:text-parchment disabled:opacity-60"
          >
            Always allow
          </button>
          <select
            aria-label="Remember this for"
            value={scope}
            onChange={(event) => setScope(event.target.value as RuleScope)}
            className="border-l border-line bg-transparent px-1.5 py-1 text-micro text-parchment-dim focus:outline-none"
          >
            <option value="conversation">this conversation</option>
            <option value="workspace">this workspace</option>
          </select>
        </div>

        <input
          ref={field}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-label="Reason for denying"
          placeholder="Reason (optional)"
          className="min-w-40 flex-1 rounded-control border border-line bg-ink-900 px-2.5 py-1 font-mono text-xs text-parchment placeholder:text-parchment-faint focus:border-line-strong focus:outline-none"
        />

        <button
          type="button"
          onClick={deny}
          disabled={busy}
          className="rounded-control border border-danger/40 px-3 py-1 text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
        >
          Deny
        </button>
      </div>
    </section>
  )
}
