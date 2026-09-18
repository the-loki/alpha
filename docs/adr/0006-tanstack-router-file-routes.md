# The renderer routes with TanStack Router's file-based routes

Alpha's renderer uses TanStack Router with the Vite file-route plugin: `src/routes/` is the
source of truth for navigation, and every screen is addressable.

## Context

A desktop app technically needs no router — a `useState` switch over "which screen" would work.
But the workbench has genuinely addressable state: a conversation, a workspace, a settings
section, and overlays that should survive a reload. It also needs typed params (`/c/:id`) and
search params (`?level=ask`, `?provider=...`) so that a view can be linked, restored on relaunch,
and driven by an E2E test without clicking through the UI.

## Considered options

- **`useState` screen switch.** Least code, and it makes every screen unaddressable, untestable
  by URL, and impossible to restore after a reload.
- **React Router.** Equivalent capability; TanStack Router was chosen for its typed params and
  search-param validation, which matter because the E2E suite drives the app through URLs.
- **TanStack Router with code-based routes.** Rejected: with file routes, adding a screen is
  adding a file, so the route tree cannot drift from the directory listing.

## Consequences

Route files are the one place a default export is allowed, because the plugin generates the route
tree from file exports. Screen-level data loading stays out of route loaders: the renderer's data
arrives by IPC events from a live runtime, so loaders would have to fake a request/response
shape that does not exist. Loaders are used only for settings reads, where the shape is a real
request.
