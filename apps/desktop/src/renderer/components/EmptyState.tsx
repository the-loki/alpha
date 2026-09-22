import type { TextKey } from '@alpha/core'
import { For, Show } from 'solid-js'
import { composerFolderOf, shell, shellActions, useText } from '../stores/shell.ts'
import { Composer, seedComposer } from './Composer.tsx'
import { CHIP as CHIP_SHAPE, PRIMARY_ACTION } from './controls.ts'
import { WindowCorner } from './TitleBar.tsx'

/** The hour decides the greeting; three periods, one line. */
const greetingKey = (): TextKey => {
  const hour = new Date().getHours()
  if (hour >= 18 || hour < 5) return 'empty.greetingEvening'
  return hour < 12 ? 'empty.greetingMorning' : 'empty.greetingAfternoon'
}

/** The ways to start: each lays its words in the box, and the box takes the keyboard. */
const STARTERS: readonly TextKey[] = ['empty.startFix', 'empty.startReview', 'empty.startTests', 'empty.startExplain']

function Starters() {
  const t = useText()
  return (
    <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
      <For each={STARTERS}>
        {(key) => (
          <button
            type="button"
            onClick={() => seedComposer(t(key))}
            class={`${CHIP_SHAPE} text-xs text-muted transition-colors duration-normal hover:border-line-strong hover:text-foreground`}
          >
            {t(key)}
          </button>
        )}
      </For>
    </div>
  )
}

/**
 * What is on the page before anything has been asked. With a folder open that is a welcome: the
 * app's name faint above, the greeting in the largest text voice, the writing box standing in the
 * middle of the room rather than at its foot — the folder it will be written in said on the box —
 * and the ways to start under it (C5.4). With no folder there is no page, so that state is about
 * the window itself and says so in the largest voice it has.
 *
 * It draws no scroll and no column of its own: it stands where the messages will stand, on the
 * page's one pair of edges.
 */
export function EmptyState() {
  const t = useText()
  const composerFolder = () => composerFolderOf(shell)

  return (
    <Show
      when={composerFolder()}
      fallback={
        <div class="relative flex flex-1 flex-col items-center justify-center text-center">
          {/* This screen has no view head, but the window still has a corner — and the left end of
              that same row is where a folded rail is brought back (C5.4). */}
          <WindowCorner />
          <h1 class="font-text text-display text-foreground">{t('empty.noFolder.title')}</h1>
          <p class="mt-2 max-w-measure font-text text-name leading-relaxed text-muted">{t('empty.noFolder.body')}</p>
          <Show
            when={shell.host === 'browser'}
            fallback={
              <button type="button" onClick={() => void shellActions.pickWorkspace()} class={`mt-6 ${PRIMARY_ACTION}`}>
                {t('empty.chooseFolder')}
              </button>
            }
          >
            <p class="mt-6 font-text text-name text-muted">{t('sidebar.browserNoPicker')}</p>
          </Show>
        </div>
      }
    >
      {/* A new conversation is a welcome. The mark is decoration and says so to a reader; the
          greeting is the page's one heading, and the box below it is the one the message lands in.
          No positioned ancestor: the window's corner stays the window's (C5.4). */}
      <div class="flex flex-1 flex-col items-center justify-center text-center">
        <WindowCorner />
        <p
          aria-hidden="true"
          class="select-none font-mono text-[3rem] font-medium leading-none tracking-[0.3em] text-faint/40"
        >
          ALPHA
        </p>
        <h1 class="mt-7 font-text text-display font-semibold text-foreground">{t(greetingKey())}</h1>
        <div class="mt-9 w-full max-w-2xl text-left">
          <Composer folder />
        </div>
        <Starters />
      </div>
    </Show>
  )
}
