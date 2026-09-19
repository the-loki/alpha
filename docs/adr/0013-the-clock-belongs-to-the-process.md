# The clock belongs to the process, and a missed run is caught up once

There is no daemon: tasks fire while the workbench is running, and a run whose minute passed while
it was not is caught up **once** when it next runs — never replayed as a burst. One task runs at a
time; an occurrence that arrives while its task is still working is skipped and recorded.

## Context

A schedule needs a clock, and the workbench is the only thing here that has one. It quits when its
last window closes (`app.on('window-all-closed')` in `packages/main/src/index.ts`), except on
macOS where the platform keeps the process alive — so "the task ran at nine" is really "the task
ran at nine *and the workbench was open*". Making that untrue means a background service, a tray
presence, and a story about what an application nobody is looking at may do to your files; that is
a different product, and the map has ruled it out of scope.

Given a clock that stops, the interesting question is not accuracy but what to do about the minutes
that were missed. The two obvious answers are both wrong on their own. Skipping everything missed
means a task set for 09:00 mostly never runs — a desktop application is not open at 09:00 very
often, and a feature that quietly does nothing is worse than no feature. Replaying everything
missed means opening the workbench after a weekend and starting fourteen runs of a task that edits
the same folder.

## Decision

**The scheduler lives in the main process and runs whenever the process does.** It keeps one timer,
set to the nearest occurrence across all tasks, and re-arms after each wake — no polling loop, and
nothing to leak. A window is not required: on macOS the process outlives its window and the
schedule keeps its meaning. What the interface promises is therefore "while Alpha is running",
which is printed where tasks are made rather than discovered at the wrong moment.

**A missed run is caught up once, promptly after the workbench starts.** If the app was closed
over one occurrence or over forty, the task runs once, marked in its own history as a catch-up and
naming the occurrence it is standing in for. Intervals resume from that run; a daily task's next
occurrence is the next scheduled time, not the one it just replaced.

**One scheduled run at a time.** Occurrences that arrive while their own task is still running are
skipped and recorded as skipped, never queued and never interrupting: two runs of the same task
touch the same folder, and the second was written for the state the first is in the middle of
changing. Different tasks overdue at the same moment take turns for the same reason a burst is
bad — one model provider, one machine.

**Two kinds of schedule, and no cron.** *Every N minutes* (floor: 5, below which the workbench is
being used as a loop), and *every day at HH:MM*. Cron is a language to learn, validate and explain
in an error message; the two kinds cover what a personal workbench actually asks for, and a third
kind can be added when someone wants it.

**Time is local wall-clock, and daylight saving is not a special case.** A daily time that does not
exist on that day (the hour that springs forward) runs at the first minute that does. An hour that
happens twice (the one that falls back) still runs once, because a daily occurrence is keyed to its
day. The machine sleeping is treated exactly like the workbench being closed: the missed
occurrence is caught up once, late, when the timer gets to run.

**A failed run is not retried.** The next occurrence is the next occurrence; the failure is
recorded where the task's runs are listed. Automatic retries of a task whose environment is wrong
are noise, and a retry of a task that half-applied its edits is worse than the failure.

**A task can be stopped without being deleted.** Stopping it keeps the prompt and the history and
stops the clock — the alternative to stopping is deleting, and losing what you wrote because you
wanted a quiet week is a bad trade.

## Consequences

- Every run gets a **new conversation**, titled with the task's name, in the task's workspace.
  Runs are therefore read, continued and archived like any other conversation, and a task's history
  is the list of conversations it made.
- A workspace that no longer exists is not an error: the run is skipped and recorded as skipped,
  with the reason. The task survives, because the folder may come back.
- "Run this now" exists, and it is the manual answer to a missed run as well as the way to try a
  task out. A run started by hand is attended — the person is right there — so
  [ADR-0012](0012-nothing-is-asked-when-nobody-is-watching.md)'s auto-denial does not apply to it.
- Tasks are the main process's own record, in one file beside the conversation index, written
  whole. There is no cross-process scheduling, no lock file and no coordination with another
  instance, which is consistent with how the rest of the workbench stores things.
- The cost is stated where it is paid: a task whose time passed while the app was closed runs late,
  and a task whose times passed while it was closed runs once, not as many times as it was missed.
