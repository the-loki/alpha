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
import { useShell, useText } from '../../stores/shell.ts'
import { OUTLINED_ACTION, PRIMARY_ACTION } from '../controls.ts'

const FIELD = 'w-full rounded-control border border-line bg-ink-700 px-2 py-1.5 text-ui text-parchment'
const LABEL = 'block text-xs font-medium text-parchment-dim'
/** A choice carries a mark, not only a colour (C5.7): the chosen one is tinted and ringed. */
const CHOICE = 'flex items-center gap-2 rounded-control border px-3 py-1 text-xs transition-colors'
const CHOSEN = 'border-accent/50 bg-accent/10 text-accent'
const RESTING = 'border-line text-parchment-dim hover:bg-ink-600'

/** A schedule, as the form holds it: the two kinds, and the one number or time it needs. */
function ScheduleFields({
  schedule,
  onChange,
}: {
  schedule: TaskSchedule
  onChange: (schedule: TaskSchedule) => void
}) {
  const t = useText()
  const kind = schedule.kind
  const each = kind === 'every'
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={each}
          title={t('tasks.minutes')}
          onClick={() => onChange({ kind: 'every', minutes: MINIMUM_INTERVAL_MINUTES })}
          className={`${CHOICE} ${each ? CHOSEN : RESTING}`}
        >
          {t('tasks.kindEvery')}
        </button>
        <button
          type="button"
          aria-pressed={!each}
          title={t('tasks.time')}
          onClick={() => onChange(DEFAULT_SCHEDULE)}
          className={`${CHOICE} ${each ? RESTING : CHOSEN}`}
        >
          {t('tasks.kindDaily')}
        </button>
      </div>
      {schedule.kind === 'every' ? (
        <label className="flex items-center gap-2">
          <span className={LABEL}>{t('tasks.minutes')}</span>
          <input
            type="number"
            min={MINIMUM_INTERVAL_MINUTES}
            value={schedule.minutes}
            aria-label={t('tasks.minutes')}
            onChange={(event) => {
              const minutes = Number(event.target.value)
              onChange({ kind: 'every', minutes: Number.isFinite(minutes) ? minutes : MINIMUM_INTERVAL_MINUTES })
            }}
            className="w-24 rounded-control border border-line bg-ink-700 px-2 py-1.5 text-code text-parchment"
          />
        </label>
      ) : (
        <label className="flex items-center gap-2">
          <span className={LABEL}>{t('tasks.time')}</span>
          <input
            type="time"
            value={schedule.at}
            aria-label={t('tasks.time')}
            onChange={(event) =>
              onChange({
                kind: 'daily',
                at: parseDailyTime(event.target.value) === undefined ? '09:00' : event.target.value,
              })
            }
            className="rounded-control border border-line bg-ink-700 px-2 py-1.5 text-code text-parchment"
          />
        </label>
      )}
    </div>
  )
}

/** The choices a scheduled run has, with the consequence of each written where it is chosen. */
function LevelField({ level, onChange }: { level: PermissionLevel; onChange: (level: PermissionLevel) => void }) {
  const t = useText()
  return (
    <fieldset>
      <legend className={LABEL}>{t('tasks.level')}</legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {PERMISSION_LEVELS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={candidate === level}
            onClick={() => onChange(candidate)}
            className={OUTLINED_ACTION}
          >
            {t(levelKey(candidate))}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * Making a task or editing one. It is a form on the page rather than a dialog: a task has five
 * fields and one sentence that has to be read, and that is a page's worth of things (ticket #85).
 */
export function TaskForm({
  form,
  note,
  onChange,
  onSave,
  onCancel,
}: {
  form: Partial<ScheduledTask>
  note: Undef<string>
  onChange: (changes: Partial<ScheduledTask>) => void
  onSave: () => Promise<void>
  onCancel: () => void
}) {
  const t = useText()
  const folders = useShell((state) => state.recents)
  const schedule: TaskSchedule = form.schedule ?? DEFAULT_SCHEDULE
  const ready = (form.name ?? '').trim() !== '' && (form.prompt ?? '').trim() !== '' && form.workspacePath !== ''

  return (
    <section aria-label={t('tasks.new')} className="mt-5 rounded-card border border-line bg-ink-800 p-4">
      <div className="grid gap-3">
        <label>
          <span className={LABEL}>{t('tasks.name')}</span>
          <input
            value={form.name ?? ''}
            onChange={(event) => onChange({ name: event.target.value })}
            className={`mt-1 ${FIELD}`}
          />
          <span className="mt-1 block text-micro text-parchment-faint">{t('tasks.nameHint')}</span>
        </label>

        <label>
          <span className={LABEL}>{t('tasks.prompt')}</span>
          <textarea
            rows={3}
            value={form.prompt ?? ''}
            onChange={(event) => onChange({ prompt: event.target.value })}
            className={`mt-1 ${FIELD}`}
          />
          <span className="mt-1 block text-micro text-parchment-faint">{t('tasks.promptHint')}</span>
        </label>

        <label>
          <span className={LABEL}>{t('tasks.folder')}</span>
          <select
            value={form.workspacePath ?? ''}
            onChange={(event) => onChange({ workspacePath: event.target.value })}
            className={`mt-1 ${FIELD}`}
          >
            {folders.map((folder) => (
              <option key={folder.path} value={folder.path}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>

        <LevelField level={form.permissionLevel ?? 'ask'} onChange={(level) => onChange({ permissionLevel: level })} />
        {note !== undefined && <p className="text-micro text-amber">{note}</p>}

        <div>
          <span className={LABEL}>{t('tasks.schedule')}</span>
          <div className="mt-1.5">
            <ScheduleFields schedule={schedule} onChange={(next) => onChange({ schedule: next })} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <button type="button" disabled={!ready} onClick={() => void onSave()} className={PRIMARY_ACTION}>
          {t('tasks.save')}
        </button>
        <button type="button" onClick={onCancel} className={OUTLINED_ACTION}>
          {t('tasks.cancel')}
        </button>
      </div>
    </section>
  )
}
