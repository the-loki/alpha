# An attachment is bytes, and it rides inside the message

A picture the user sends is read in the window, sent as its own bytes, and kept in the message's
content — never as a path to a file on the machine.

## Context

The obvious way to send a picture is to name it: the composer knows the path, the runtime reads the
file when it builds the prompt, and the transcript records where the file was. It is less data over
the wire, and it is what a tool call does. The picture instead crosses from the window to the main
process as content; the embedded agent sends those bytes to the provider.

Three things make it the wrong shape here. The workbench is served to a browser
([ADR-0009](0009-the-workbench-can-be-served-to-a-browser.md)), and a path on the machine that runs
the workbench means nothing to the browser that sent it — the two clients would then have different
features, or the browser would send a path it cannot name. The transcript is the record of the
conversation ([ADR-0004](0004-transcripts-as-jsonl-entries.md)) and has to mean the same thing when
it is re-read a year later, which a path into a folder the user may since have moved or deleted does
not. And the thing the model is handed is the picture itself, so a message that names a file
transcript has already lost what the answer was about.

## Decision

**The window reads the file and sends the bytes.** Base64 in the contract, in the shape the model
runtime accepts, so nothing downstream has to open anything. Pictures are the only attachment kind
the workbench supports; a document in the workspace is a path the agent can read with a tool.

**The pictures ride inside the message's own content, and nowhere else.** The embedded agent receives
`ImageContent[]` beside the text; the agent emits the user message, and the session writes it
down. The live event and the transcript read off disk are therefore built by the same function
(`userBlocksOf`), and there is no second store to keep in step.

**Pictures only, with a ceiling, checked at the boundary.** A fixed list of mime types, four
megabytes per picture, and the check lives where the arguments arrive — a channel handler, which
both transports dispatch — so the HTTP API is refused an oversized or non-image attachment by the
same code that refuses it in the window. The window refuses first, where it can say so.

**A picture with nothing typed is a message.** "Look at this" is a whole thing to say, so the send
control is live with a picture attached and no words. The queue and the steer path stay text-only:
a message that waits its turn is a sentence to be edited, and an edit box for a picture is a
different feature.

**A picture is shown where it was sent.** The transcript renders it above the words it came with,
and the export writes it inline as a data-URL image, so an exported conversation is still
self-contained.

## Consequences

- A session file holds the pictures a conversation was sent, so it grows with them. The ceiling
  per picture is what keeps that bounded, and the body limit on the served workbench is raised to
  accommodate the base64 inflation of the largest one.
- The window holds the bytes twice while a message is on screen — the base64 it sent and the base64
  it renders — which is affordable at four megabytes and would not be at four hundred.
- What a message was sent with is what it says it was sent with: no file needs to still exist for
  the transcript to be true, and reading an old conversation shows the picture rather than a name.
- The prompt the agent receives cannot refer to the file by path, so attaching is not how a
  document is handed over. The folder is the agent's file system; the attachment is the user's
  screenshot.
