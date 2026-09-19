# 06 — Serving the workbench to a browser

A browser client is a remote control for a shell that runs in a workspace. These rules are what
keeps that sentence from being a vulnerability report.

## C6.1 — The server is off until the user turns it on

Nothing listens unless `network.enabled` is true, and the switch that sets it lives in Settings
next to the exposure it causes. A workbench that opens a port on first launch would be a port
nobody asked for.

**Enforcement:** the `[main] browser access` suite pins the default (a fresh state file has it
off), and the switch in Settings is the only writer of the flag.

## C6.2 — Loopback unless the user chose otherwise

The default bind address is `127.0.0.1`. Widening it to every interface is a choice the user makes
in Settings, and the choice is one value (`'local' | 'network'`) rather than an address anyone can
write by hand.

**Enforcement:** `NetworkBind` is a closed union of `local` and `network`, and the mapping from it
to an address lives in one table in the server. The suite pins the default and the address a
browser is told about for each choice.

## C6.3 — Every API route is authenticated

`POST /api/session` is the only route that accepts a request without a session, and it exists to
trade the token for one. Everything else under `/api/` requires the session cookie or the bearer
token, compared in constant time.

**Enforcement:** every `/api/` request passes one gate before it reaches a handler, and `POST
/api/session` is the only branch that runs before it. The suite covers the refusals: no session, a
wrong token, and a stream asked for without one.

## C6.4 — The token is not in a URL

The browser receives the token once, from the person typing it, and trades it for a cookie. No
route accepts it as a query parameter, and nothing the app prints puts it in a link.

**Enforcement:** the request path is read without its query string at all, so no route can be
handed one; the exchange is a POST body, and the cookie it returns is HttpOnly.

## C6.5 — Static files are served from the bundle, and only from the bundle

The renderer's build directory is the only place files come from, and a request that walks out of
it (`../`, an absolute path, a symlink) is refused rather than resolved.

**Enforcement:** integration test — the server is started on an ephemeral port and asked for paths
outside the bundle.

## C6.6 — The browser gets no more than the window

A browser client can do what the desktop window can do, and nothing else. Window commands do
nothing, the folder picker refuses, and everything else goes through the same gate, the same
permission levels, and the same events. There is no second, more powerful path for network clients.

**Enforcement:** both transports dispatch the one table in `channels.ts`, and what differs is the
`WindowPort` they are given — a desktop one with a native picker, a headless one that refuses. The
browser E2E asserts the absence of window chrome and the refusal of the folder picker.
