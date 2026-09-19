# The interface is written in a dictionary, and only the interface

The window has two languages, and the words it says come from a typed dictionary in `core` rather
than from the places that draw them. What the agent is told stays in the conversation's own
language, and so does anything a vendor or the operating system said: those are not the
interface's words, and translating them would change what a conversation is.

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
words are both vocabulary — but no React, no store and no side effects, so `core` stays pure.

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

- A surface that is not in the dictionary yet shows English inside a Chinese interface. That is
  the honest intermediate state; the extraction is a mechanical pass over each component.
- Adding a string means adding it twice, and the compiler says so if you forget.
- The three classes are a judgement call at the boundary: a sentence that is both "what the user
  reads" and "what the agent is told" has to be split, or the agent's copy stays English.
- `--lang=en-US` is a test-environment pin, not a product behaviour: the workbench never reads a
  command-line language.
