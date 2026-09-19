/**
 * The bridge a browser gets. Same surface as the preload's, over HTTP: an invoke is a POST, and
 * everything main pushes arrives on one event stream. The renderer cannot tell the two apart, and
 * that is the point — a browser client is a client of the same workbench, not a second app.
 *
 * The token is the transport's own business, not the contract's: the browser trades it for a
 * cookie once (see `unlock`) and keeps it in local storage so a reload does not ask again.
 */
import {
  type AlphaBridge,
  type ApprovalAnswerInput,
  type ConversationSummary,
  type CustomProviderInput,
  type EditEffect,
  IPC,
  type LaunchState,
  type NetworkPatch,
  type NetworkState,
  type OpenedConversation,
  type PermissionLevel,
  type PermissionRule,
  type PickWorkspaceResult,
  type ProviderModelDefinition,
  type ProvidersSnapshotMessage,
  type RuntimeEvent,
  type Theme,
  type ThinkingLevel,
  type Undef,
  type WindowState,
} from '@alpha/core'

const TOKEN_KEY = 'alpha.token'

/** A refusal this adapter knows the shape of: the session is missing or stale. */
export class Unauthorized extends Error {
  constructor() {
    super('This browser is not signed in to the workbench.')
  }
}

/**
 * Which session this page is on. A refusal takes a moment to come back — the server delays one
 * deliberately, so guessing a token is pointless — and in that moment the person can have typed
 * the token and signed in. A 401 that was answered before that says nothing about the page as it
 * is now, so it is counted here rather than believed.
 */
let session = 0

/**
 * Whoever draws the workbench hears about it when the session behind it goes away — a token
 * replaced at the desk, a server restarted — because a workbench that cannot do anything has to
 * say so instead of looking usable.
 */
const refusals = new Set<() => void>()

export function watchRefusals(listener: () => void): () => void {
  refusals.add(listener)
  return () => refusals.delete(listener)
}

export function isBrowserClient(): boolean {
  return typeof window !== 'undefined' && window.alpha === undefined && window.location.protocol.startsWith('http')
}

/**
 * The token lives in this tab and no longer: it is kept so a reload does not ask again, and the
 * cookie it was traded for is a session cookie, so the tab is the honest lifetime for both.
 */
export function rememberedToken(): string {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberToken(token: string): void {
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Storage disabled: the cookie still works until the browser is closed.
  }
}

/** A token the server refused is the one it no longer knows, so keeping it would only mislead. */
function forgetToken(): void {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage disabled: there was nothing remembered to forget.
  }
}

/**
 * Trades the token for a session cookie, and remembers it so a reload comes straight back in.
 * The cookie is what the server checks; the token is only kept so this can be repeated.
 */
export async function unlock(token: string): Promise<void> {
  const response = await fetch('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error('That token was not accepted.')
  rememberToken(token)
  session += 1
  // The page subscribed before it had a session, and a refused stream is closed for good rather
  // than retried, so the events have to be asked for again now that there is one.
  reconnectStream()
}

async function invoke(name: keyof typeof IPC, args: unknown[]): Promise<unknown> {
  const sentWith = session
  const response = await fetch('/api/invoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: IPC[name], args }),
    credentials: 'same-origin',
  })
  if (response.status === 401) {
    // Only a refusal of the session this page is on now. One answered on the way to signing in is
    // a fact about a page that no longer exists, and acting on it would sign the person back out.
    if (sentWith === session) {
      forgetToken()
      for (const listener of refusals) listener()
    }
    throw new Unauthorized()
  }
  const body = (await response.json()) as { value?: unknown; error?: string }
  if (!response.ok) throw new Error(body.error ?? 'the workbench refused that')
  return body.value
}

/**
 * One event stream for the whole page, and listeners by channel. The stream is opened when the
 * first listener arrives and dropped when the last one leaves, which is what a component
 * mounting and unmounting expects.
 */
/** Which payload type arrives per channel is the contract's promise; this moves the bytes. */
const listeners = new Map<string, Set<(payload: unknown) => void>>()
const attached = new Set<string>()
let stream: Undef<EventSource>

function listen<T>(channel: keyof typeof IPC, listener: (payload: T) => void): () => void {
  const set = listeners.get(channel) ?? new Set<(payload: unknown) => void>()
  const entry = listener as (payload: unknown) => void
  set.add(entry)
  listeners.set(channel, set)
  openStream()
  return () => {
    set.delete(entry)
    if (set.size === 0) listeners.delete(channel)
    if (listeners.size === 0) closeStream()
  }
}

/**
 * One stream, and a listener per channel that has one. A channel subscribed after the stream is
 * already open still has to be attached — the components that care about events mount in their own
 * order, and the first one to arrive is not the only one that matters.
 */
function openStream(): void {
  // A stream the browser closed — a refused session, a server that went away — is replaced rather
  // than left: `EventSource` only retries the failures it considers temporary.
  if (stream !== undefined && stream.readyState === EventSource.CLOSED) closeStream()
  if (stream === undefined) {
    const source = new EventSource('/api/events', { withCredentials: true })
    source.addEventListener('error', () => {
      if (source.readyState === EventSource.CLOSED) void reviveStream()
    })
    stream = source
  }
  for (const channel of listeners.keys()) {
    if (attached.has(channel)) continue
    attach(channel)
    attached.add(channel)
  }
}

/**
 * What a stream that was given up on means: the session is gone, or only the stream is. Asking the
 * workbench settles it — a refusal sends the page to the unlock screen by itself, and a session
 * that still works only needs the stream again. A page with no session has nothing to revive: the
 * unlock that follows opens the stream for itself.
 */
async function reviveStream(): Promise<void> {
  if (rememberedToken() === '') return
  try {
    await invoke('launchState', [])
  } catch {
    return
  }
  reconnectStream()
}

/** Asks for the event stream again, which is what unlocking has to do. */
export function reconnectStream(): void {
  closeStream()
  if (listeners.size > 0) openStream()
}

function closeStream(): void {
  stream?.close()
  stream = undefined
  attached.clear()
}

function attach(channel: string): void {
  stream?.addEventListener(channel, (event) => {
    const payload: unknown = JSON.parse((event as MessageEvent<string>).data)
    for (const listener of listeners.get(channel) ?? []) listener(payload)
  })
}

export function networkBridge(): AlphaBridge {
  return {
    launchState: () => invoke('launchState', []) as Promise<LaunchState>,
    pickWorkspace: () => invoke('pickWorkspace', []) as Promise<PickWorkspaceResult>,
    selectWorkspace: (path: string) => invoke('selectWorkspace', [path]) as Promise<LaunchState>,
    setPermissionLevel: (level: PermissionLevel) => invoke('setPermissionLevel', [level]) as Promise<LaunchState>,
    setConversationLevel: (id: string, level: PermissionLevel) =>
      invoke('setConversationLevel', [id, level]) as Promise<ConversationSummary>,
    setTheme: (theme: Theme) => invoke('setTheme', [theme]) as Promise<LaunchState>,
    networkState: () => invoke('networkState', []) as Promise<NetworkState>,
    setNetworkAccess: (patch: NetworkPatch) => invoke('setNetworkAccess', [patch]) as Promise<NetworkState>,
    regenerateNetworkToken: () => invoke('regenerateNetworkToken', []) as Promise<NetworkState>,
    // A browser has no window to move; the chrome controls are not drawn in one either.
    sendWindowCommand: async () => undefined,
    onWindowState: (listener: (state: WindowState) => void) => listen('windowStateChanged', listener),

    listConversations: () => invoke('listConversations', []) as Promise<ConversationSummary[]>,
    createConversation: (workspacePath: string) =>
      invoke('createConversation', [workspacePath]) as Promise<OpenedConversation>,
    openConversation: (id: string) => invoke('openConversation', [id]) as Promise<OpenedConversation>,
    sendPrompt: (conversationId: string, text: string) => invoke('sendPrompt', [conversationId, text]) as Promise<void>,
    abortRun: (conversationId: string) => invoke('abortRun', [conversationId]) as Promise<void>,
    onRuntimeEvent: (listener: (event: RuntimeEvent) => void) => listen('runtimeEvent', listener),

    providers: () => invoke('providersSnapshot', []) as Promise<ProvidersSnapshotMessage>,
    saveCatalogProvider: (id: string) => invoke('saveCatalogProvider', [id]) as Promise<ProvidersSnapshotMessage>,
    saveCustomProvider: (input: CustomProviderInput) =>
      invoke('saveCustomProvider', [input]) as Promise<ProvidersSnapshotMessage>,
    removeProvider: (id: string) => invoke('removeProvider', [id]) as Promise<ProvidersSnapshotMessage>,
    setCredential: (id: string, secret: string) =>
      invoke('setCredential', [id, secret]) as Promise<ProvidersSnapshotMessage>,
    providerModels: (id: string) => invoke('providerModels', [id]) as Promise<ProviderModelDefinition[]>,
    testProvider: (id: string, modelId: string) =>
      invoke('testProvider', [id, modelId]) as Promise<{ ok: boolean; message: string }>,
    setConversationModel: (id: string, providerId: string, modelId: string) =>
      invoke('setConversationModel', [id, providerId, modelId]) as Promise<ConversationSummary>,
    setThinkingLevel: (id: string, level: ThinkingLevel) =>
      invoke('setThinkingLevel', [id, level]) as Promise<ConversationSummary>,
    steer: (conversationId: string, text: string) => invoke('steer', [conversationId, text]) as Promise<void>,
    queueMessage: (conversationId: string, text: string) =>
      invoke('queueMessage', [conversationId, text]) as Promise<void>,
    cancelQueued: (conversationId: string, entryId: string) =>
      invoke('cancelQueued', [conversationId, entryId]) as Promise<void>,
    regenerate: (conversationId: string) => invoke('regenerate', [conversationId]) as Promise<void>,
    editMessage: (conversationId: string, userMessageIndex: number, text: string, effect: EditEffect) =>
      invoke('editMessage', [conversationId, userMessageIndex, text, effect]) as Promise<OpenedConversation>,
    renameConversation: (id: string, title: string) =>
      invoke('renameConversation', [id, title]) as Promise<ConversationSummary>,
    deleteConversation: (id: string) => invoke('deleteConversation', [id]) as Promise<ConversationSummary[]>,
    exportConversation: (id: string) => invoke('exportConversation', [id]) as Promise<{ path: string }>,
    permissionRules: () => invoke('permissionRules', []) as Promise<PermissionRule[]>,
    revokePermissionRule: (ruleId: string) => invoke('revokePermissionRule', [ruleId]) as Promise<PermissionRule[]>,
    answerApproval: (answer: ApprovalAnswerInput) => invoke('answerApproval', [answer]) as Promise<void>,
    onPermissionRules: (listener: (rules: PermissionRule[]) => void) => listen('permissionRulesChanged', listener),
  }
}
