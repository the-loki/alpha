# Hard Constraints

These are the rules the codebase is held to. They exist because they are expensive to
retrofit: each one is cheaper to obey from the first commit than to satisfy after the fact.

Every constraint names its **enforcement**. A constraint that is only prose is a wish; the
machine-checkable ones are wired into `pnpm check`, which runs in CI and before every commit.

| File | Covers |
| --- | --- |
| [01-typescript.md](./01-typescript.md) | Type system rules, including the nullable-union ban |
| [02-architecture.md](./02-architecture.md) | Process split, dependency direction, size budgets |
| [03-product-scope.md](./03-product-scope.md) | What this product is, and what it deliberately is not |
| [04-testing.md](./04-testing.md) | Seams, the red-green loop, and how live model tests run |
| [05-design.md](./05-design.md) | The visual language, tokens, and accessibility floor |

## Why a written list

Three of these constraints (no nullable unions, small functions, small components) are style
choices that a reader cannot infer from any single file; two more (no worktrees, BYOK only) are
scope choices that look like omissions unless written down. Left unwritten, each gets relitigated
in review or, worse, quietly violated until the codebase has two conventions.

## Escape hatches

A constraint may be violated deliberately. Doing so requires a comment on the offending line
naming the constraint file and the reason, in this shape:

```ts
// constraints-ignore 01-typescript: vendor signature returns T | undefined
```

`pnpm check:constraints` fails on violations that lack a `constraints-ignore` marker, and fails
on a marker whose file does not exist. That keeps every exception visible and reasoned about,
rather than accumulating as silent drift.
