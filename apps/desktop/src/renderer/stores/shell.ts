import {
  type Accent,
  type AppearancePatch,
  composerFolder,
  DEFAULT_LANGUAGE,
  DEFAULT_LEVEL,
  DEFAULT_THEME,
  emptyWorkspaceState,
  type Language,
  type LanguageSetting,
  type LaunchState,
  type PermissionLevel,
  resolveLanguage,
  type TextKey,
  type TextParams,
  type Theme,
  text,
  type Undef,
  type WorkspaceRef,
  type WorkspaceSelection,
} from '@alpha/core'
import { createStore } from 'solid-js/store'
import { bridge, type ClientHost, clientHost } from '../lib/bridge.ts'
import { Unauthorized, unlock as unlockTransport, watchRefusals } from '../lib/network-bridge.ts'

export interface ShellState {
  ready: boolean
  appVersion: string
  platform: string
  workspace: WorkspaceSelection
  recents: WorkspaceRef[]
  permissionLevel: PermissionLevel
  /** What this workspace's new conversations start at. */
  workspaceLevel: PermissionLevel
  /** The per-folder defaults behind that, for a folder that is not the selected one. */
  workspaceLevels: Record<string, PermissionLevel>
  theme: Theme
  /** Which accent palette the workbench is drawn in. */
  accent: Accent
  /** Which language the interface is written in: a setting, which `system` leaves to the client. */
  language: LanguageSetting
  model: LaunchState['model']
  /** The conversation to come back to on launch, empty when there is none. */
  lastConversationId: string
  windowMaximized: boolean
  /** Which process draws this workbench: the window chrome and the folder picker differ. */
  host: ClientHost
  /** A browser with no session: the workbench is not reachable until the token is given. */
  locked: boolean
}

/**
 * The workbench's own state, as one reactive store: a field is read where it is used, and the
 * component that read it is the one that redraws when it changes. The actions beside it are the
 * only writers, so every change that matters has a name.
 */
const [shell, setShell] = createStore<ShellState>({
  ready: false,
  appVersion: '',
  platform: '',
  workspace: emptyWorkspaceState().selection,
  recents: [],
  permissionLevel: DEFAULT_LEVEL,
  workspaceLevel: DEFAULT_LEVEL,
  workspaceLevels: {},
  theme: DEFAULT_THEME,
  accent: 'ember',
  language: DEFAULT_LANGUAGE,
  model: { kind: 'none' },
  lastConversationId: '',
  windowMaximized: false,
  host: 'desktop',
  locked: false,
})

export { shell }

/**
 * The folder the composer's next message belongs to. One folder is "current" at a time — the one
 * the next conversation is created in — and the sidebar is what changes it.
 */
export const composerFolderOf = (state: ShellState): Undef<WorkspaceRef> =>
  composerFolder({ selection: state.workspace, recents: state.recents })

const applyLaunchState = (state: LaunchState) => ({
  accent: state.accent,
  language: state.language,
  ready: true,
  appVersion: state.appVersion,
  platform: state.platform,
  workspace: state.workspace,
  recents: state.recents,
  permissionLevel: state.permissionLevel,
  workspaceLevel: state.workspaceLevel,
  workspaceLevels: state.workspaceLevels,
  theme: state.theme,
  model: state.model,
  lastConversationId: state.lastConversationId,
})

/**
 * Paints the look onto the document. The mode is resolved here rather than left to the stylesheet:
 * "system" is a choice about which palette to use, not a third palette, and resolving it in one
 * place is what lets the light/dark blocks stay plain selectors (C5.2).
 */
function applyAppearance(theme: Theme, accent: Accent): void {
  const root = document.documentElement
  const mode = theme === 'system' ? systemMode() : theme
  // Both are written out rather than left to the stylesheet's defaults: the document says what it
  // is drawn in, which is what the settings page and the tests read back.
  root.setAttribute('data-theme', mode)
  root.setAttribute('data-accent', accent)
}

function systemMode(): 'light' | 'dark' {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches === true ? 'dark' : 'light'
}

/**
 * The interface's words, in the language this client is showing. `system` is resolved per client
 * rather than per workbench: the desktop window and a browser on the other side of the room are
 * not necessarily in the same language, and each of them is reading for itself.
 *
 * A plain function rather than a hook: the read happens when a word is asked for, inside whatever
 * scope is drawing it, so a component that shows text follows the setting wherever it moves.
 */
export function useText(): (key: TextKey, params?: TextParams) => string {
  return (key, params) => text(languageOf(shell.language), key, params)
}

/** Which of the two languages this client reads a setting as. */
export function languageOf(setting: LanguageSetting): Language {
  return resolveLanguage(setting, globalThis.navigator?.language ?? '')
}

export const shellActions = {
  load: async (): Promise<void> => {
    // A refusal is not a failure to report: it means this browser has no session yet, and the
    // screen it needs is the one that asks for the token.
    try {
      const state = await bridge().launchState()
      applyAppearance(state.theme, state.accent)
      setShell({ ...applyLaunchState(state), host: clientHost(), locked: false })
    } catch (failure) {
      if (!(failure instanceof Unauthorized)) throw failure
      setShell({ locked: true, ready: true, host: clientHost() })
    }
  },

  unlock: async (token: string): Promise<void> => {
    await unlockTransport(token)
    await shellActions.load()
  },

  pickWorkspace: async (): Promise<void> => {
    const result = await bridge().pickWorkspace()
    if (result.canceled) return
    await shellActions.load()
  },

  selectWorkspace: async (path: string): Promise<void> => {
    setShell(applyLaunchState(await bridge().selectWorkspace(path)))
  },

  setPermissionLevel: async (level: PermissionLevel): Promise<void> => {
    setShell(applyLaunchState(await bridge().setPermissionLevel(level)))
  },

  setAppearance: async (patch: AppearancePatch): Promise<void> => {
    const state = await bridge().setAppearance(patch)
    applyAppearance(state.theme, state.accent)
    setShell(applyLaunchState(state))
  },

  setWindowMaximized: (maximized: boolean): void => {
    setShell('windowMaximized', maximized)
  },

  /** Spends the memory of the last conversation: it is for one launch, not for every visit to /. */
  clearResume: (): void => {
    setShell('lastConversationId', '')
  },

  /** A session that is gone: the whole workbench locks, not just the screen that noticed. */
  lock: (): void => {
    setShell('locked', true)
  },
}

// Once per page, wherever the refusal was noticed: a session that is gone takes the whole
// workbench with it, because every screen behind it would only be refused in turn.
watchRefusals(() => shellActions.lock())
