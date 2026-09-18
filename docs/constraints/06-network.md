# 06 — Serving the workbench to a browser

A browser client is a remote control for a shell that runs in a workspace. These rules are what
keeps that sentence from being a vulnerability report.

## C6.1 — The server is off until the user turns it on

Nothing listens unless `network.enabled` is true, and the switch that sets it lives in Settings
next to the exposure it causes. A workbench that opens a port on first launch would be a port
nobody asked for.

**Enforcement:** `pnpm check:constraints` rule `06-network:off-by-default` reads the persisted
state's defaults and fails if `enabled` defaults to true.

## C6.2 — Loopback unless the user chose otherwise

The default bind address is `127.0.0.1`. Widening it to every interface is a choice the user makes
in Settings, and the choice is one value (`'local' | 'network'`) rather than an address anyone can
write by hand.

**Enforcement:** `pnpm check:constraints` rule `06-network:loopback-default` fails on a bind address
written out as a literal outside the module that owns the choice.

## C6.3 — Every API route is authenticated

`POST /api/session` is the only route that accepts a request without a session, and it exists to
trade the token for one. Everything else under `/api/` requires the session cookie or the bearer
token, compared in constant time.

**Enforcement:** `pnpm check:constraints` rule `06-network:api-is-authenticated` reads the route
table and fails on an `/api/` route that is not marked as authenticated or as the session route.

## C6.4 — The token is not in a URL

The browser receives the token once, from the person typing it, and trades it for a cookie. No
route accepts it as a query parameter, and nothing the app prints puts it in a link.

**Enforcement:** review, plus `06-network:api-is-authenticated` — a route that could read a token
from the query string would have to be written by hand, and the static files it would sit next to
are served by the same table.

## C6.5 — Static files are served from the bundle, and only from the bundle

The renderer's build directory is the only place files come from, and a request that walks out of
it (`../`, an absolute path, a symlink) is refused rather than resolved.

**Enforcement:** integration test — the server is started on an ephemeral port and asked for paths
outside the bundle.

## C6.6 — The browser gets no more than the window

A browser client can do what the desktop window can do, and nothing else. Window commands do
nothing, the folder picker refuses, and everything else goes through the same gate, the same
permission levels, and the same events. There is no second, more powerful path for network clients.

**Enforcement:** the route table dispatches the same channel handlers the IPC handlers are
registered from, so a channel the window cannot use does not exist for the browser either; the
browser E2E asserts the refusal of the folder picker and the absence of window commands.
