# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: this repo is single-context — one `CONTEXT.md` and one `docs/adr/` for the whole project, so there is no `CONTEXT-MAP.md` to look for.
- **`docs/adr/`**: read the ADRs that touch the area you're about to work in, and check `docs/adr/README.md` first — it says which decisions still bind and which were replaced by what.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md                  the glossary: the words, and the synonyms refused
├── docs/adr/                   one file per decision, plus README.md as the index
│   ├── 0001-agent-runtime-in-main-process.md
│   ├── 0025-the-agent-is-embedded-and-the-workbench-is-the-base.md
│   └── README.md
├── apps/desktop/src/           the workbench: main, preload, renderer
└── packages/                   its thirteen libraries
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
