# The workbench can be served to a browser, and the browser is a full operator

Alpha runs in the main process, and its window talks to it over the typed contract in
`packages/contract/src/contract.ts`. That contract is the seam: a second adapter implements it over HTTP and a
server in the main process serves the same bundle to a browser. Anyone holding the token is as
much an operator as the person at the desk — they can answer approval cards, change the permission
level, and read every conversation.

## Context

The workbench is useful away from the desk: a laptop on the couch, a phone, a second machine. That
needs the interface in a browser, which needs the main process to be reachable without Electron.

The seam already exists. `AlphaBridge` is the whole surface the renderer has, and the preload is
its only adapter — the renderer has never touched `ipcRenderer` (C2.2, now machine-checked). The
work is not "make the app work over the network"; it is "write the second adapter, and make the
handlers reachable from somewhere that is not an Electron window".

What makes this a decision rather than a detail is who the second client is. The agent runs shell
commands in a workspace and asks a person before the dangerous ones. A browser client is therefore
a remote control for a shell: not a viewer. Anything that can reach the port and hold the token can
approve a `bash` call, switch the conversation to full access, and read the transcript.

## Decision

Serve the renderer bundle from an HTTP server inside the main process, with the browser talking to
the same channel table the IPC handlers are registered from.

- **Off until asked for.** `network.enabled` defaults to false and the server is not started.
- **Loopback by default.** `network.bind` is `'local'` (127.0.0.1) unless the user chooses
  `'network'` (all interfaces) in Settings.
- **One token, one cookie.** A 32-byte token is minted when network access is first enabled, shown
  in Settings, and exchanged at `POST /api/session` for an httpOnly, SameSite=Strict cookie. Every
  `/api/*` route requires it, compared in constant time. Scripts may use the token directly as a
  bearer header; the browser never puts it in a URL. The typed token is kept in the tab's own
  session storage so a reload does not ask again, and closing the tab forgets it — the life the
  cookie already has.
- **The same gate.** Network clients go through the permission ladder unchanged. Their cards arrive
  as events and their answers arrive as invokes, exactly like the window's.
- **A session that goes away takes the workbench with it.** A token replaced at the desk, or a
  server that restarted, leaves a browser holding something that refuses everything: the page
  returns to the unlock screen instead of staying up and failing one action at a time.
- **What a browser cannot do.** Window commands (minimize/maximize/close) do nothing, the native
  folder picker refuses with a message, and the browser is not offered one — it changes workspace
  from the recents list, and where there is no list it says why.

## Consequences

- The security of the port is the token's. There is no per-client identity, no read-only mode, and
  no audit trail that distinguishes the desk from the phone. That is deliberate: a second role
  model would double the gate's surface for a feature whose users are one person.
- The token lives in plaintext in the workbench state file, in the same data directory as the
  credential vault. Files on that machine are readable by its user, who can already run the agent;
  anything that can read the state file can already act as the workbench.
- A refusal takes a moment to arrive — the server delays one deliberately, so guessing is pointless
  — and a page can sign in while its own refusal is still in flight. The renderer counts the
  sessions it has been on and disbelieves a refusal that was answered before the current one, which
  is why signing in does not immediately sign itself back out.
- A dead port means a clear failure in Settings, not a silent one: a busy port is reported where the
  switch is.
- Everything the renderer bundle contains is served to anyone who asks for the files. No key
  material is in the bundle (C2.4), so there is nothing to leak there — the token is what the
  server checks, and it is never rendered into the page.
