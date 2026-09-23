# A model says what it can be handed

Every model carries a **takes pictures** setting, off until it is turned on. A picture attached to
a conversation whose model does not take them is refused — at the composer when the window knows
the model, and in the main process when it does not — rather than sent as a message the model never
saw a picture in. The setting travels to the agent as the model's `input` list in `models.json`; the
refusal is Alpha's, read from the same record (packages/providers/src/models.ts).

## Context

Attachments have been part of the workbench since ADR-0014: bytes, not paths, read in the window,
stored in the transcript, handed to the runtime as image content. What was never modelled is
whether the model on the other end can *read* one. Back when Alpha made the requests, the runtime
built every model with `input: ['text']`, and every protocol implementation dropped image content
for a model that did not list `image` there:

```js
if (hasImages && model.input.includes("image")) { … }   // openai-completions
if (images.length === 0 || !model.input.includes("image")) { … }   // openai-responses
```

So the feature worked end to end and produced nothing: the picture was read, encoded, stored,
displayed in the transcript and then quietly left out of the request. The suite never caught it
because the scripted model used by the tests takes pictures by default, and because a drop is not
an error — the turn simply answered about a picture nobody had seen.

ADR-0015 removed the provider catalog, which is the reason this cannot be detected rather than
configured: nothing in the app knows what a hand-typed model id can read.

## Decision

**The capability is a setting on the model**, beside the limits it already carries: a checkbox per
model row in the models panel, stored in `providers.json` with the rest of the model, and carried
through the same validator. It is **off** for a model that does not say otherwise, including every
model stored before this setting existed.

**The agent is told, and its protocol decides.** The setting is written into the model's `input`
in `models.json`: a model that takes pictures is declared `['text', 'image']`, and one that does not
is declared `['text']` (`runtime/agent-models.ts`). That is the fix for the silent drop — the flag
the protocol already respects is finally set.

**Where a picture is refused.** Two places, one sentence each:

- The **window**, when its provider list serves the model: a pick for a model that does not take
  pictures is dropped and the composer says so, naming the model and where to change it. It also
  drops a picture already attached if the model changes under it — switching conversations, or
  switching model — rather than letting the state go stale.
- The **main process**, always, before the turn starts: `prompt` refuses an attachment for a model
  whose `input` does not include `image`. This is the boundary. It is also what covers the case the
  window cannot see: the scripted test runtime, or a window whose provider list has not arrived.

**Unknown is not the same as no.** When the window cannot resolve the model at all it allows the
picture and leaves the decision to the main process, because refusing on ignorance would turn a
missing snapshot into a broken feature. The refusal is only ever made about a model the app can
actually point at.

## Consequences

- The models panel gains one checkbox and one line of explanation in its intro, and `providers.json`
  gains one field per model. An older file is read as text-only models: attachments stop working
  until the setting is turned on for the model in use. That is the intended direction — the
  previous behaviour was to send them into a void.
- The model list in a conversation's picker is unchanged: capability is not a filter there, because
  a text-only model is still the right model for a question.
- `definitionOf` and `useRunningModel` exist because of this: the window has to resolve a model
  reference to its definition to know what it can be handed, and the composer's chip, its paperclip
  and its refusal all have to agree about which model that is.
- Nothing else consults the flag. Audio, video and documents are not attachments this workbench
  sends (ADR-0014), so a list of modalities would have one member that means something and one
  that never can — the boolean is the honest shape until a second kind of attachment exists, and
  `readModels` is where it would become a list.

## Alternatives considered

**Default it on.** It would preserve the old behaviour exactly, including the bug: every model would
be declared able to read a picture, and the protocols would keep dropping them for the models that
cannot. Optimistic defaults are for settings that fail loudly; this one fails silently.

**Guess from the model id** (a table of known vision models). That is the catalog ADR-0015 deleted,
in a smaller and more embarrassing form: a list of substrings that goes stale and is wrong for
every gateway and local server, which is most of what this app is pointed at.

**Refuse only in the window.** Simpler, and wrong: the window's knowledge is a snapshot, and the
runtime is where an image either goes into a request or does not. A rule that matters has to hold
where the request is built.

**A modality list** (`['text', 'image', 'audio']`). Honest about the shape of the problem and
dishonest about this app: it sends text and pictures. It would put a disabled checkbox for text in
the settings row and a never-used value in the schema for a feature nobody has asked for.
