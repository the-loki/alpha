import {
  DEFAULT_SCHEDULE,
  levelKey,
  MINIMUM_INTERVAL_MINUTES,
  PERMISSION_LEVELS,
  type PermissionLevel,
  parseDailyTime,
  type ScheduledTask,
  type TaskSchedule,
  type Undef,
} from '@alpha/domain'
import { For, Show } from 'solid-js'
import { PANEL_GROUPS } from '../../lib/ledger.ts'
import { shell, useText } from '../../stores/shell.ts'
import { CONTROL_HEIGHT, FIELD_FRAME, GROUP_LABEL, OUTLINED_ACTION, PRIMARY_ACTION } from '../controls.ts'

/** A name is written, not measured: the text voice, on the field's one height. */
const NAME_FIELD = `w-full px-2 font-text text-name ${CONTROL_HEIGHT} ${FIELD_FRAME}`
/** What the machine runs on — a folder, a time — is measured: the apparatus voice (C5.3). */
const FIELD = `px-2 font-mono text-code ${CONTROL_HEIGHT} ${FIELD_FRAME}`
/** The prompt is written, not typed in: several lines of the same voice the composer speaks in. */
const PROMPT_FIELD = `w-full resize-none px-2 py-2 font-text text-body ${FIELD_FRAME}`
const LABEL = `block ${GROUP_LABEL}`
/** A choice carries a mark, not only a colour (C5.7): the chosen one is tinted, and `aria-pressed`
    says the same to a reader. The control radius is given here because a choice is a body, and
    the apparatus voice is set at its label weight (C5.3, C5.4). */
const CHOICE = `inline-flex ${CONTROL_HEIGHT} items-center gap-2 rounded-md border px-3 font-mono text-label font-medium transition-colors duration-normal`
const CHOSEN = 'border-accent/50 bg-accent/10 text-accent'
const RESTING = 'border-line text-muted hover:bg-surface-1'

/** A schedule, as the form holds it: the two kinds, and the one number or time it needs. */
function ScheduleFields(props: { schedule: TaskSchedule; onChange: (schedule: TaskSchedule) => void }) {
  const t = useText()
  const each = () => props.schedule.kind === 'every'
  return (
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex gap-2">
        <button
          type="button"
          aria-pressed={each()}
          title={t('tasks.minutes')}
          onClick={() => props.onChange({ kind: 'every', minutes: MINIMUM_INTERVAL_MINUTES })}
          class={`${CHOICE} ${each() ? CHOSEN : RESTING}`}
        >
          {t('tasks.kindEvery')}
        </button>
        <button
          type="button"
          aria-pressed={!each()}
          title={t('tasks.time')}
          onClick={() => props.onChange(DEFAULT_SCHEDULE)}
          class={`${CHOICE} ${each() ? RESTING : CHOSEN}`}
        >
          {t('tasks.kindDaily')}
        </button>
      </div>
      {props.schedule.kind === 'every' ? (
        <label class="flex items-center gap-2">
          <span class={LABEL}>{t('tasks.minutes')}</span>
          <input
            type="number"
            min={MINIMUM_INTERVAL_MINUTES}
            value={props.schedule.minutes}
            aria-label={t('tasks.minutes')}
            onInput={(event) => {
              const minutes = Number(event.currentTarget.value)
              props.onChange({ kind: 'every', minutes: Number.isFinite(minutes) ? minutes : MINIMUM_INTERVAL_MINUTES })
            }}
            class={`w-24 ${FIELD}`}
          />
        </label>
      ) : (
        <label class="flex items-center gap-2">
          <span class={LABEL}>{t('tasks.time')}</span>
          <input
            type="time"
            value={props.schedule.at}
            aria-label={t('tasks.time')}
            onInput={(event) =>
              props.onChange({
                kind: 'daily',
                at: parseDailyTime(event.currentTarget.value) === undefined ? '09:00' : event.currentTarget.value,
              })
            }
            class={FIELD}
          />
        </label>
      )}
    </div>
  )
}

/** The choices a scheduled run has, with the consequence of each written where it is chosen. */
function LevelField(props: { level: PermissionLevel; onChange: (level: PermissionLevel) => void }) {
  const t = useText()
  return (
    <fieldset>
      <legend class={LABEL}>{t('tasks.level')}</legend>
      <div class="mt-1.5 flex flex-wrap gap-2">
        <For each={PERMISSION_LEVELS}>
          {(candidate) => (
            <button
              type="button"
              aria-pressed={candidate === props.level}
              onClick={() => props.onChange(candidate)}
              class={`${CHOICE} ${candidate === props.level ? CHOSEN : RESTING}`}
            >
              {t(levelKey(candidate))}
            </button>
          )}
        </For>
      </div>
    </fieldset>
  )
}

/**
 * Making a task or editing one. It is a form on the page rather than a dialog: a task has five
 * fields and one sentence that has to be read, and that is a page's worth of things (ticket #85).
 */
export function TaskForm(props: {
  form: Partial<ScheduledTask>
  note: Undef<string>
  onChange: (changes: Partial<ScheduledTask>) => void
  onSave: () => Promise<void>
  onCancel: () => void
}) {
  const t = useText()
  const folders = () => shell.recents
  const schedule = () => props.form.schedule ?? DEFAULT_SCHEDULE
  const ready = () =>
    (props.form.name ?? '').trim() !== '' && (props.form.prompt ?? '').trim() !== '' && props.form.workspacePath !== ''

  // Three groups, separated by the rules the rest of the workbench separates with: what the task asks,
  // where and at what level it runs, and when. Five fields of the same size in one block read as
  // a list; the rules are what make it a form with a shape (C5.4).
  return (
    <section aria-label={t('tasks.new')} class="mt-5 rounded-lg border border-line bg-surface-0 p-4">
      <div class={PANEL_GROUPS}>
        <div class="grid gap-3">
          <label>
            <span class={LABEL}>{t('tasks.name')}</span>
            <input
              value={props.form.name ?? ''}
              onInput={(event) => props.onChange({ name: event.currentTarget.value })}
              class={`mt-1 ${NAME_FIELD}`}
            />
            <span class="mt-1 block max-w-measure font-text text-name leading-relaxed text-faint">
              {t('tasks.nameHint')}
            </span>
          </label>

          <label>
            <span class={LABEL}>{t('tasks.prompt')}</span>
            <textarea
              rows={3}
              value={props.form.prompt ?? ''}
              onInput={(event) => props.onChange({ prompt: event.currentTarget.value })}
              class={`mt-1 ${PROMPT_FIELD}`}
            />
            <span class="mt-1 block max-w-measure font-text text-name leading-relaxed text-faint">
              {t('tasks.promptHint')}
            </span>
          </label>
        </div>

        <div class="grid gap-3">
          <label>
            <span class={LABEL}>{t('tasks.folder')}</span>
            <select
              value={props.form.workspacePath ?? ''}
              onInput={(event) => props.onChange({ workspacePath: event.currentTarget.value })}
              class={`mt-1 w-full ${FIELD}`}
            >
              <For each={folders()}>{(folder) => <option value={folder.path}>{folder.name}</option>}</For>
            </select>
          </label>

          <LevelField
            level={props.form.permissionLevel ?? 'ask'}
            onChange={(level) => props.onChange({ permissionLevel: level })}
          />
          <Show when={props.note}>
            {(note) => (
              // A notice is a line: a warning hairline bar down its left edge and a surface-1
              // fill — the one place a coloured border marks a block (C5.4).
              <p class="max-w-measure border-l-2 border-warning bg-surface-1 px-3 py-2 font-text text-name leading-relaxed text-warning">
                {note()}
              </p>
            )}
          </Show>
        </div>

        <div>
          <span class={LABEL}>{t('tasks.schedule')}</span>
          <div class="mt-1.5">
            <ScheduleFields schedule={schedule()} onChange={(next) => props.onChange({ schedule: next })} />
          </div>
        </div>
      </div>

      {/* The form ends the way a decision does: a hairline, then the actions, at the right end. */}
      <div class="mt-4 flex items-center justify-end gap-3 border-t border-line pt-3">
        <button type="button" onClick={props.onCancel} class={OUTLINED_ACTION}>
          {t('tasks.cancel')}
        </button>
        <button type="button" disabled={!ready()} onClick={() => void props.onSave()} class={PRIMARY_ACTION}>
          {t('tasks.save')}
        </button>
      </div>
    </section>
  )
}
