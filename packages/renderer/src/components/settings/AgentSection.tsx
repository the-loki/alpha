import { agentStatusKey, PI_MINIMUM_VERSION, type Undef } from '@alpha/core'
import { useEffect, useState } from 'react'
import { bridge } from '../../lib/bridge.ts'
import { agentReady, useAgent } from '../../stores/agent.ts'
import { useText } from '../../stores/shell.ts'

/**
 * The agent Alpha runs: none of its own, so this panel is the whole relationship with pi until a
 * conversation is opened. It says what Alpha found (or did not), takes a path from anyone whose pi
 * is somewhere unusual, offers the install command — to run here, or to copy and run yourself —
 * and shows what the install printed while it prints it.
 */
export function AgentSection() {
  const t = useText()
  const snapshot = useAgent((state) => state.snapshot)
  const apply = useAgent((state) => state.apply)
  const refresh = useAgent((state) => state.refresh)
  const setPath = useAgent((state) => state.setPath)
  const install = useAgent((state) => state.install)
  const [typed, setTyped] = useState<Undef<string>>(undefined)
  const [copied, setCopied] = useState(false)

  // The panel opens on the truth rather than on an assumption, and follows what main pushes:
  // an install started from another client is watched here too.
  useEffect(() => {
    void refresh()
    return bridge().onAgentChanged(apply)
  }, [apply, refresh])

  if (snapshot === undefined) return null

  const { status } = snapshot
  // Whatever the sentence needs: the search's answer already carries it.
  const values: Record<string, string | number> = {
    path: 'path' in status ? status.path : '',
    version: 'version' in status ? status.version : '',
    needed: PI_MINIMUM_VERSION,
    reason: status.kind === 'unusable' ? status.reason : '',
  }

  return (
    <section aria-label={t('settings.tabAgent')}>
      <div className="mt-3 space-y-3 rounded-card border border-line bg-ink-800 p-4">
        <p className="text-ui text-parchment">{t(agentStatusKey(status), values)}</p>

        <div className="space-y-1">
          <label className="block text-xs text-parchment-dim" htmlFor="agent-path">
            {t('agent.path')}
          </label>
          <input
            id="agent-path"
            value={typed ?? snapshot.path}
            placeholder="pi"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
            onBlur={() => {
              void setPath(typed ?? snapshot.path)
              setTyped(undefined)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              void setPath(typed ?? snapshot.path)
              setTyped(undefined)
            }}
            className="w-full rounded-control border border-line bg-ink-700 px-3 py-1.5 font-mono text-xs text-parchment"
          />
          <p className="text-xs text-parchment-faint">{t('agent.pathHint')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={snapshot.installing}
            onClick={() => void install()}
            className="rounded-control border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs text-accent disabled:opacity-50"
          >
            {snapshot.installing ? t('agent.installing') : t('agent.install')}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-control border border-line px-3 py-1.5 text-xs text-parchment-dim hover:bg-ink-700"
          >
            {t('agent.recheck')}
          </button>
        </div>

        <div className="space-y-1">
          <span className="block text-xs text-parchment-dim">{t('agent.command')}</span>
          <div className="flex items-center gap-2">
            <code className="grow truncate rounded-control border border-line bg-ink-700 px-2 py-1 font-mono text-xs text-parchment-faint">
              {snapshot.command}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(snapshot.command)
                setCopied(true)
              }}
              className="rounded-control border border-line px-3 py-1.5 text-xs text-parchment-dim hover:bg-ink-700"
            >
              {copied ? t('agent.copied') : t('agent.copy')}
            </button>
          </div>
        </div>

        {snapshot.output !== '' && (
          <div className="space-y-1">
            <span className="block text-xs text-parchment-dim">{t('agent.output')}</span>
            <pre className="max-h-48 overflow-auto rounded-control border border-line bg-ink-900 p-2 font-mono text-xs text-parchment-faint">
              {snapshot.output}
            </pre>
            {!snapshot.installing && !agentReady(snapshot) && (
              <p className="text-xs text-ember-300">{t('agent.failed')}</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
