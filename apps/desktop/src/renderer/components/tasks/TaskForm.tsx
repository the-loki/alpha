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
} from '@alpha/core'
import { For, Show } from 'solid-js'
import { shell, useText } from '../../stores/shell.ts'
import { CONTROL_HEIGHT, FIELD_FRAME, OUTLINED_ACTION, PRIMARY_ACTION } from '../controls.ts'

const FIELD = `w-full px-2 text-ui text-parchment ${CONTROL_HEIGHT} ${FIELD_FRAME}`
const LABEL = 'block text-xs font-medium text-parchment-dim'
/** A choice carries a mark, not only a colour (C5.7): the chosen one is tinted and ringed. */
const CHOICE = 'flex h-7 items-center gap-2 rounded-control border px-3 text-xs transition-colors'
const CHOSEN = 'border-accent/50 bg-accent/10 text-accent'
const RESTING = 'border-line text-parchment-dim hover:bg-ink-600'

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
            class="h-7 w-24 rounded-control border border-line bg-ink-700 px-2 text-code text-parchment"
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
            class="h-7 rounded-control border border-line bg-ink-700 px-2 text-code text-parchment"
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
              class={OUTLINED_ACTION}
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

  // Three groups, separated by the rules the rest of the app separates with: what the task asks,
  // where and at what level it runs, and when. Five fields of the same size in one block read as
  // a list; the rules are what make it a form with a shape.
  return (
    <section aria-label={t('tasks.new')} class="mt-5 rounded-card border border-line bg-ink-800 p-4">
      <div class="grid gap-4 divide-y divide-line [&>*]:pt-4 first:[&>*]:pt-0">
        <div class="grid gap-3">
          <label>
            <span class={LABEL}>{t('tasks.name')}</span>
            <input
              value={props.form.name ?? ''}
              onInput={(event) => props.onChange({ name: event.currentTarget.value })}
              class={`mt-1 ${FIELD}`}
            />
            <span class="mt-1 block text-micro leading-relaxed text-parchment-faint">{t('tasks.nameHint')}</span>
          </label>

          <label>
            <span class={LABEL}>{t('tasks.prompt')}</span>
            <textarea
              rows={3}
              value={props.form.prompt ?? ''}
              onInput={(event) => props.onChange({ prompt: event.currentTarget.value })}
              class={`mt-1 ${FIELD}`}
            />
            <span class="mt-1 block text-micro leading-relaxed text-parchment-faint">{t('tasks.promptHint')}</span>
          </label>
        </div>

        <div class="grid gap-3">
          <label>
            <span class={LABEL}>{t('tasks.folder')}</span>
            <select
              value={props.form.workspacePath ?? ''}
              onInput={(event) => props.onChange({ workspacePath: event.currentTarget.value })}
              class={`mt-1 ${FIELD}`}
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
              <p class="rounded-control border border-amber/30 bg-amber/10 px-3 py-2 text-micro leading-relaxed text-amber">
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

      {/* The form ends the way the gate ends: a rule, then the decision, at the right end. */}
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
