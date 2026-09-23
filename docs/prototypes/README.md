# Prototypes

Two shapes, drawn as candidates and kept as pictures. A prototype here is a question a ticket
decides between, and the picture is the whole of the answer: the branches that drew them are gone —
they edited `packages/renderer/`, a path that no longer exists — so what survives is what was worth
keeping, byte for byte (commit `d009254`).

Read them as **shape**, not as paint. They were drawn before the current design language, so their
colours, type and spacing are not what the window uses now (Caliper, [ADR-0027](../adr/0027-caliper-design-language.md),
binding in [05-design.md](../constraints/05-design.md)). Where a picture and the code disagree about
appearance, the code is right; where they disagree about *behaviour* — what is on a row, what a
click does — this file says which one today's window does.

## `row-actions/` — what a conversation row's actions are

| Picture | What it shows |
| --- | --- |
| `row-rest.png` | The rail at rest: the places (`New conversation` with a subtitle, `Add a folder`, `Search Ctrl+K`), two folders with their conversations flat beneath, a version number and a theme button at the foot |
| `row-hover-icons.png` | Candidate one, under the pointer: a strip of three icons — archive, delete, `⋯` |
| `row-hover-menu.png` | Candidate two, under the pointer: a single `⋯` |
| `row-icons-menu-open.png` | Both candidates side by side with the menu open, drawn that way so one screenshot could decide it |
| `row-menu-open.png` | The chosen candidate's menu: Rename / Archive / Delete |

**Decided: the single `⋯`.** A row of icons covered the name it was drawn over — the reason is
recorded in the component (`components/chrome/ConversationRow.tsx`). Since then the menu gained
**Export**, and the rail moved on in the other ways: the places are New conversation, Search and
Tasks; adding a folder is the `+` beside the `Folders` heading; a conversation row ends in its age
in mono; the foot holds Settings, and the version number lives in the masthead's tooltip.

## `tasks-shape/` — a task as a third level in the rail

| Picture | What it shows |
| --- | --- |
| `tasks-collapsed.png` | A task row under a folder's conversations, folded, with a verdict per run listed under the expanded one |
| `tasks-expanded.png` | The same task with every run as its own row: a date, and a verdict word at the row's end |

**Decided and built** (ticket #85): a task sits under the conversations of the folder it runs in
(`components/chrome/TaskGroup.tsx`). Two differences today: the verdict is said once, at the end of
the *task's* own row, from its latest run, rather than on every run row; and that row ends in a count
that opens the task's page, with `Run now` in the expanded list. The chevron and the filter icon the
pictures show are not in the code — folding is `aria-expanded`, and the icon is used in settings.

## What was not kept

The specs the two branches drove Electron with, because each said in its own header that it was a
throwaway: they existed to take the screenshots. The E2E suite covers the shapes that were chosen,
at the seams (`e2e/sidebar-fold.spec.ts`, `e2e/tasks.spec.ts`), rather than the candidates that were
not.
