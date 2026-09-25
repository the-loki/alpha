# Four permission levels, with interactive approvals and remembered rules

Alpha gates every tool call through a four-level ladder — `plan`, `ask`, `accept-edits`,
`full-access` — evaluated against a tool's risk class, with an interactive approval prompt for
anything the level does not auto-approve.

## Context

The reference products converge on a ladder but name it differently: Claude Code uses
`default`/`acceptEdits`/`plan`/`bypassPermissions`, Codex CLI uses
`read-only`/`auto`/`full-access`, ZCode uses `plan`/`build`/`edit`/`yolo`. Adopting any one
product's vocabulary verbatim would import its other assumptions (Claude's settings-file rule
syntax, Codex's sandbox tiers, ZCode's terminal-first interaction). The permission decision is
close to the product's identity — see [03-product-scope.md](../constraints/03-product-scope.md)
— and it is expensive to change later because it is encoded in the IPC contract, the store, the
transcript, and the UI.

## Considered options

- **A boolean "auto-approve" toggle.** Cheapest to build, but it cannot express the useful middle
  ground (edits yes, commands no) that every reference product independently converged on.
- **A general rule engine with glob patterns and precedence.** Most powerful, and the least
  predictable: the user cannot tell what will happen from the level chip alone.
- **A fixed ladder plus remembered rules** (chosen). The level is the always-visible default; a
  rule is created when the user chooses **Always allow** on an approval card, and is scoped to the
  conversation or the workspace.

## Consequences

Auto-approval is decided by a pure function over (level, tool risk class), so the whole policy is
unit-testable without a runtime. Denials are returned to the model as an error tool result with
the reason, so the agent can adapt rather than silently stall. The level is a chip in the
composer's own foot row, beside the attach control, and it is there in every state — `full-access`
included, because the alternative, a bypass nobody can see, is how users lose data without knowing
which setting did it.
