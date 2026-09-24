import type { WorkspaceChange, WorkspaceChangeSet } from '@alpha/domain'
import type { TextKey } from '@alpha/i18n'
import { For, Show } from 'solid-js'
import { languageOf, shell, useText } from '../../stores/shell.ts'
import { ChevronDownIcon } from '../icons.tsx'

const KIND_KEY: Record<WorkspaceChange['kind'], TextKey> = {
  added: 'changes.added',
  modified: 'changes.modified',
  deleted: 'changes.deleted',
}

const KIND_TONE: Record<WorkspaceChange['kind'], string> = {
  added: 'text-success',
  modified: 'text-info',
  deleted: 'text-danger',
}

function TextPreview(props: { label: string; text?: string }) {
  const t = useText()
  return (
    <div class="min-w-0">
      <p class="mb-1 font-mono text-label text-faint">{props.label}</p>
      <Show
        when={props.text !== undefined}
        fallback={<p class="font-text text-body text-faint">{t('changes.noPreview')}</p>}
      >
        <pre class="max-h-96 overflow-auto rounded-md border border-line bg-surface-1 px-3 py-2 whitespace-pre-wrap break-all font-mono text-code text-foreground">
          {props.text}
        </pre>
      </Show>
    </div>
  )
}

function FileChange(props: { change: WorkspaceChange }) {
  const t = useText()
  return (
    <li data-change-kind={props.change.kind} class="border-t border-line">
      <details class="group">
        <summary class="flex min-h-10 cursor-pointer list-none items-center gap-3 py-2 text-left hover:bg-surface-1 [&::-webkit-details-marker]:hidden">
          <span class={`w-16 shrink-0 font-mono text-label ${KIND_TONE[props.change.kind]}`}>
            {t(KIND_KEY[props.change.kind])}
          </span>
          <span class="min-w-0 flex-1 break-all font-mono text-code text-foreground">{props.change.path}</span>
          <ChevronDownIcon class="text-faint transition-transform group-open:rotate-180" />
        </summary>
        <div class="grid gap-3 pb-4 pl-0 sm:pl-[4.75rem] md:grid-cols-2">
          <Show when={props.change.kind !== 'added'}>
            <TextPreview label={t('changes.before')} text={props.change.beforeText} />
          </Show>
          <Show when={props.change.kind !== 'deleted'}>
            <TextPreview label={t('changes.after')} text={props.change.afterText} />
          </Show>
        </div>
      </details>
    </li>
  )
}

function ChangeSet(props: { changeSet: WorkspaceChangeSet }) {
  const t = useText()
  const when = () =>
    new Intl.DateTimeFormat(languageOf(shell.language) === 'zh' ? 'zh-CN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(props.changeSet.startedAt))

  return (
    <section class="border-b border-line pb-6" data-role="workspace-change-set">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="font-text text-name text-foreground">{when()}</h2>
        <span class="font-mono text-label text-faint">
          {props.changeSet.files.length === 1
            ? t('changes.oneFile')
            : t('changes.files', { count: props.changeSet.files.length })}
        </span>
        <Show when={props.changeSet.recovered}>
          <span class="font-mono text-label text-warning">{t('changes.recovered')}</span>
        </Show>
      </div>
      <Show when={props.changeSet.incomplete}>
        <p class="mt-2 border-l-2 border-warning bg-surface-1 px-3 py-2 font-text text-body text-muted">
          {t('changes.incomplete')}
        </p>
      </Show>
      <Show
        when={props.changeSet.files.length > 0}
        fallback={<p class="mt-3 font-text text-body text-faint">{t('changes.noFiles')}</p>}
      >
        <ul class="mt-3">
          <For each={props.changeSet.files}>{(change) => <FileChange change={change} />}</For>
        </ul>
      </Show>
    </section>
  )
}

/** Final filesystem observations live beside the transcript, one review per agent run. */
export function WorkspaceChangesView(props: { changeSets: WorkspaceChangeSet[] }) {
  const t = useText()
  return (
    <section role="tabpanel" id="workspace-changes-view" aria-labelledby="workspace-changes-tab" class="space-y-6 pb-6">
      <Show
        when={props.changeSets.length > 0}
        fallback={<p class="font-text text-body text-faint">{t('changes.none')}</p>}
      >
        <For each={props.changeSets}>{(changeSet) => <ChangeSet changeSet={changeSet} />}</For>
      </Show>
    </section>
  )
}
