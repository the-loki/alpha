# 01 — TypeScript

`strict: true` with `strictNullChecks: true`, repo-wide. Absence is expressed in the type system
rather than assumed away, and the rules below exist to keep that one way of expressing it.

## C1.1 — Strict mode on, everywhere

`strict: true` and `strictNullChecks: true` in `tsconfig.json`; one project covers all four
packages, so there is no per-package escape.

**Enforcement:** `pnpm typecheck`; `tsconfig.json` is the single source of these settings.

## C1.2 — `undefined` is the absence value; `null` is not

Do not write `T | null`. A value that can be absent is `T | undefined`, and a property that can
be absent is `foo?: T`. `null` appears only where a foreign system produced it — a JSON payload,
a vendor SDK, an IPC frame — and is converted to `undefined` at the boundary that received it,
so `null` never travels into the domain.

The point is to have one absence value, not two: the moment both are legal, every check has to
be written twice and one of them is eventually forgotten.

**Enforcement:** `pnpm check:constraints` rule `01-typescript:no-null-union` scans
`packages/*/src/**/*.{ts,tsx}` for `| null`. A `constraints-ignore 01-typescript` marker on the
line is required to pass. Declaration files are exempt: vendored types are not ours to fix.

## C1.3 — `any` is a boundary word

`any` appears only where data genuinely crosses a boundary whose shape the runtime cannot know
yet: a parsed JSON payload before validation, an IPC frame, a vendor callback signature. It must
not appear in a domain type, in a function that returns domain data, or in a store shape.

**Enforcement:** Biome `suspicious/noExplicitAny` is an error, and `pnpm check:constraints`
rule `01-typescript:any-usage` requires a `constraints-ignore` marker for each occurrence, which
keeps every exception visible in review.

## C1.4 — Validate at the trust boundary, then trust

Everything arriving from outside the process — IPC frames, provider HTTP responses, JSON on
disk, environment variables — is validated once, at the edge, into a typed value. Past that edge
the code trusts the type and does not re-check.

Validation uses the schema library the runtime already depends on (TypeBox, via `pi`), not a
second one.

**Enforcement:** review. The seam is named per package in [02-architecture.md](./02-architecture.md).

## C1.5 — No type assertions to silence the compiler

`as` is allowed for a genuine narrowing the compiler cannot see (a validated payload, a literal
tuple). `as unknown as T`, `as any`, and non-null assertions used to bypass a check are not —
under `strictNullChecks`, `x!.y` is a claim the compiler cannot verify, so it needs the same
justification a cast does.

`@ts-ignore` is banned. `@ts-expect-error` is allowed when it carries a reason on the same line.

**Enforcement:** `pnpm check:constraints` rule `01-typescript:ts-expect-error-reason` bans
`@ts-ignore` outright and demands a reason, and `01-typescript:any-usage` catches `as any`.
Non-null assertions stay review-level: Biome's rule is deliberately off, because a guarded `!`
is idiomatic once `strictNullChecks` is on.

## C1.6 — Exported functions declare their return type

Every exported function annotates its return type. Inference is welcome inside a function body;
at a module boundary it hides accidental widening, and it is exactly where a `Promise<Result<T>>`
becomes `Promise<any>` by accident.

Components in `.tsx` are exempt: a React component returns JSX, and the annotation says nothing.

**Enforcement:** review. Biome's equivalent rule lives in `nursery` and fires on every inline
callback, a noise-to-value trade this project does not take.

## C1.7 — Named exports, no default exports

Default exports rename themselves at every import site, which makes grepping a symbol's uses
unreliable. Files under `packages/*/src` are covered; the config files at the repository root are
consumed by tooling that requires a default export, so they are not.

**Enforcement:** `pnpm check:constraints` rule `01-typescript:no-default-export`.

## C1.8 — Discriminated unions over boolean flags

When a value has more than two states, or when two booleans can describe an impossible
combination, model it as a discriminated union with a string literal tag. `isLoading` +
`isError` + `data` is three fields that can lie; `{ status: "loading" } | { status: "error", ... }`
cannot.

**Enforcement:** review, and the shape is visible in the domain types under `packages/core`.

## C1.9 — Biome is the linter and the formatter

`pnpm lint` runs `biome check .`, which is both. `biome.json` is the single source of truth for
code style, and imports are organized by it, so nobody hand-sorts them. What Biome cannot
express — the architecture rules, the size budgets, the `null` ban — lives in
`pnpm check:constraints`, so the two never disagree about the same thing.

**Enforcement:** `pnpm check` runs both.
