# The interface is written in a dictionary, and only the interface

The window has two languages, and the words it says come from a typed dictionary in `core` rather
than from the places that draw them. What the agent is told stays in the conversation's own
language, and so does anything a vendor or the operating system said: those are not the
interface's words, and translating them would change what a conversation is.

## Superseded in part

The tooling has moved. The dictionaries were once generated from one table
(`tools/i18n/build-dictionary.py`), and the generator is gone. It was not what prevented drift:
`ZH`'s `satisfies Record<TextKey, string>` already makes a key present in one language and missing
in the other a type error, and `i18n.test.ts` pins the rest. The side-by-side table the generator
bought was not worth a Python toolchain inside a TypeScript repo. What stands is the decision: one
dictionary of keys, two languages, and the compiler reading both.

## Context

Nothing here was translated before: every string lived where it was rendered, in nineteen
components. Adding a second language means deciding *which* strings are the interface's, where the
words live, where the choice of language lives, and how a test suite with 104 English assertions
survives it.

That last one is the sharp edge. The suite asserts English strings, so the moment the interface can
be in Chinese, every one of those assertions depends on a setting that a test did not write down.
On a machine whose locale is Chinese, the suite would go red for a reason that has nothing to do
with the code.

## Decision

**Three kinds of string, and only one of them is translated.**

- **Chrome** — labels, buttons, empty states, aria-labels, the sentences under controls. These are
  the interface's, and they come from the dictionary.
- **Prose for the agent** — a permission refusal, the reason a tool was blocked, anything written
  into the transcript. The model reads these, so they belong to the conversation, and a Chinese
  interface must not silently change what a conversation is told.
- **Foreign text** — what a provider's API returned, what the OS said, a path, a model id. Quoted
  as-is. Translating a vendor error would be inventing a sentence nobody wrote.

**The dictionary is data in `core`, and the compiler checks it.** `EN` and `ZH` are plain objects
of `key: string`; `ZH` is declared `satisfies Record<TextKey, string>`, so a key added to one
language and forgotten in the other is a type error rather than a blank line at runtime. Prose
lives in `core/src/i18n.ts` with the types that name it, because a type's absence and a label's
words are both vocabulary — but no framework, no store and no side effects, so `core` stays pure.

**Copy in a component is a `pnpm check` failure.** `05-design:copy-has-a-key` reads every `.tsx`
under `packages/renderer/src/` and flags copy three ways it hides: an `aria-label`, `placeholder` or
`title` holding more than one word; a JSX text node with more than one word; and a line of prose
with no code characters in it, which is how a wrapped paragraph reads to a checker. A key
(`{t('sidebar.search')}`) is what passes, and a single word is left alone — `Alpha` is the app's
name in both languages.

**No i18n library.** Two languages, ~80 strings, no plural rules worth the name, and no date or
number formatting that is not already ours (`formatTokens`, `formatAge`). A library would add a
dependency, a build step and a runtime to save a `Record` and a `replace`.

**Holes are named, plurals are keys.** `text(language, 'sidebar.newConversationIn', { folder })`
fills `{folder}`; a hole with no value is *left standing* as `{folder}`, because a visibly unfilled
placeholder is a bug report while an empty gap is a mystery. English needs "1 conversation" and
Chinese does not inflect at all, so a count picks between two keys — `conversationCount(language,
count)` writes that rule once.

**The language is a workbench setting, resolved per client.** `language: 'system' | 'en' | 'zh'`
lives in the state file beside the theme and the accent, and reaches every client as part of the
launch state. `system` is resolved in the client against `navigator.language`: the desktop window
and a browser on the far side of the room are not necessarily in the same language, and each of
them is reading for itself. A machine whose language the interface does not have gets English —
half a dictionary reads worse than a language you did not pick, and settings fixes it in a click.

**The unlock screen is in the client's language, and that is a security rule.** A browser that has
not unlocked has not been told the workbench's language — the launch state carries it and the
launch state needs a session — so the screen asking for the token is written in the language of
the machine reading it. Telling a client the workbench's settings before it holds the token would
have to be a second, unauthenticated endpoint, which is a worse trade than one screen in the
wrong language.

**Errors are cases, not sentences.** Main no longer composes a user-facing sentence. `ModelStatus`
is `{ kind: 'none' } | { kind: 'configured' }` and the window says "No model configured yet." in
whatever language it is in. A sentence assembled in the main process would be an English clause in
the middle of a Chinese window, and no amount of care in the renderer fixes that afterwards.

**Tests pin the language twice, for two different reasons.** Every spec's state file says
`language: 'en'`, the way it already says `permissionLevel: 'ask'`: the assertions are about
behaviour, not about the machine they run on. Every Electron launch also passes `--lang=en-US`, so
the one path with no state file — a fresh install — is deterministic too. Browser clients get
Playwright's own default locale.

## Consequences

- The two dictionaries are hand-written, and the compiler is what keeps them in step: `ZH` is
  `satisfies Record<TextKey, string>`, so a key added to one language and not the other is a type
  error, and `i18n.test.ts` pins the rest.
- A string that is the same in both languages (a language's own name, a palette's name, an id)
  is deliberately not in the dictionary: it is not copy, and translating it would be wrong.
- The interface is not fully Chinese on a machine with no CJK font installed; that is a font
  question (`#69`), not a dictionary one.
- Adding a string means adding it twice, and the compiler says so if you forget.
- The three classes are a judgement call at the boundary: a sentence that is both "what the user
  reads" and "what the agent is told" has to be split, or the agent's copy stays English.
- `--lang=en-US` is a test-environment pin, not a product behaviour: the workbench never reads a
  command-line language.
