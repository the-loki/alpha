# The window is Solid

The renderer's framework is **Solid.js**. The screens, the markup, the Tailwind classes and the
addresses do not change: this is a decision about what draws the window, not about what the window
is. React, React DOM, TanStack Router, zustand and react-markdown leave the dependency list;
`solid-js`, `@solidjs/router` and a markdown tree walked by hand replace them.

## Context

The window is a projection of runtime events (C2.3): main pushes an event, the transcript reduces
it, and the pieces that read the changed field redraw. React implements that projection with a
virtual DOM: every event re-renders a component subtree, diffs it against the last one, and patches
what moved. For a streaming answer — a message whose text grows token by token, dozens of times a
second, inside a transcript that can hold hundreds of messages — the diff is the cost of every
token.

That is a mismatch, not a bug: a virtual DOM is the right tool when a tree is rebuilt from data
wholesale. Here nothing is rebuilt. An event names a conversation, a message or a tool call, and
the DOM nodes that show *that* are the only ones that need to change.

The second half of the mismatch is the stores. zustand hands a component a snapshot selected from
a store; the component re-renders and React decides what moved. The window already knows what
moved — it has the event — so the selector-and-re-render layer was another translation of the same
information.

## Decision

**Solid, with its fine-grained reactivity, is the renderer's framework.** Signals and stores hold
what the window knows; a component body runs once and the expressions inside it subscribe to
exactly the reads they make. A delta updates the text node it belongs to and nothing else, and the
virtual DOM leaves the dependency list with React.

**The stores are Solid stores, and the actions beside them are the only writers.** `shell`,
`conversations`, `providers`, `tasks` and `agent` are `createStore` values in `src/stores/`, read
directly where they are used; derived values (the composer's folder, the running model, a task's
runs) are getters, so asking for one reads the stores at the moment of asking. A component that
reads `conversations.transcript.status` is subscribed to that field and to nothing else.

**The router is `@solidjs/router` in hash mode, and links are plain anchors.** The window loads
from `file://`, where a path-based history has nothing to match on first paint, so the addresses
stay hashes: `#/`, `#/c/:conversationId`, `#/settings?tab=…`, `#/tasks`. The paths are declared in
one place — `src/main.tsx` — rather than derived from the file tree: four routes do not need a code
generator, and the screens read better as components than as route definitions. A link is an `<a
href="#/…">`: the browser does the navigation, the router hears the hash change, and no router
component decorates the anchor with attributes or classes of its own.

**Message markdown is a tree walked by hand.** `remark` parses the answer (GFM included) and
`src/components/Markdown.tsx` maps each node to an element: a script tag in a model's answer is
printed, never run, and the streaming caret goes inside whichever block the last character landed
in because every mdast node carries its own offsets. The alternative — a markdown-to-HTML library
and `innerHTML` — would trade the file's one safety property for a smaller file.

## Consequences

The framework's own files are gone from the bundle: what ships is the code that was written, with
no runtime library diffing it. The React-shaped habits go with them — a component body runs once,
so a branch on a reactive value is `<Show>` rather than an early `return`, and a list that must
keep its rows' identity is keyed deliberately rather than by a `key` prop.

The costs are real and were accepted. Two ordering hazards that React's batching hid are now
explicit: two signal writes in one handler are wrapped in `batch()` when a watcher must see both
together, and a locally-held piece of state (an open ledger row, an open edit box) survives a
transcript update because the rows are drawn by position — which is also why an edit closes its box
on the decision rather than waiting to be rebuilt.

The lists that read a snapshot — the provider cards, the model rows, a row being renamed — keep
their rows by reference, so a new snapshot draws them again and anything typed but not yet saved
goes with the old copy. That is the correct reading for all of them today: every one of those
edits is saved by an action that answers with the snapshot it changed, so the state that would be
lost is state the save has just made redundant.

The documents that named React — the architecture and testing constraints, the design constraint,
the layout in the README — name Solid now, and the constraint checker keeps the direction binding:
no React import may reappear in `packages/renderer/src`.

This supersedes ADR-0006: the file-based routes and the router plugin it chose are gone with the
framework it was chosen for, and the addresses it protected are unchanged.
