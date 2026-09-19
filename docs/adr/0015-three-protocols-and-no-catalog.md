# Three protocols, no catalog, and a model list that belongs to the user

Alpha speaks exactly three wire protocols — OpenAI chat completions, OpenAI responses, Anthropic
messages — and ships **no catalog of providers and no model ids**. A provider is a connection
the user describes; the models it serves are a separate setting.

## Context

The first version shipped a catalog of seven providers. Picking one filled in the name, the base
URL and the protocol, and pi-ai's built-in definitions supplied the model list at runtime, so a
person could add DeepSeek with one click and see its current models without typing them.

Two things were wrong with it. The catalog is a maintenance surface with no end: every entry is a
host, a logo and a key-prefix hint that goes stale, and the interesting population — gateways,
proxies, a model server on the machine, a provider that simply speaks the OpenAI shape — is not in
any catalog at all. And it welded two different settings together: the endpoint you talk to, and
the models you talk to it with. Base URL, protocol, key and a model list arrived in one form, so
"which models does this serve?" could only be answered by editing the connection, and a catalog
provider's model list was whatever pi-ai happened to ship that month rather than what the user
wanted.

## Decision

**Three protocols, as a closed union in `core`.** `openai-completions`, `openai-responses`,
`anthropic-messages`: the de-facto standard that gateways and local servers copy, OpenAI's newer
shape, and Anthropic's own. Each is one API implementation from pi-ai, chosen by a table keyed on
the record's `api`, so adding a fourth later is one row.

**No catalog, and therefore no host in Alpha's source.** The user types a base URL or nothing
works. That is a stronger version of C3.1 than the catalog was: the previous rule had to exempt
one module that was allowed to hold provider hosts, and now no module is.

**A provider is a connection; a model is a name that connection serves.** Two settings panels.
*Providers* is the connection: name, protocol, base URL, credential, a test button. *Models* is
what travels over it: the wire id, the display name, the context window, the max output, whether it
thinks — plus the **default model**, which is what a new conversation starts on and what a
scheduled run uses. A model is editable where it is defined, and the provider form no longer asks
for one.

**A provider with no models is a state, not an error.** Adding a connection and adding its models
are two acts in two places, so the one between them has to exist: a provider that serves nothing
yet is listed, counted as zero, and the models panel says what to do about it.

**The default model is a pointer, checked where it is read.** The choice is stored as provider +
model and validated on every read, so deleting a model or a provider cannot leave the workbench
pointing at nothing; no write path has to remember to clean up after itself.

## Consequences

- Adding a provider is more typing than it was: the name, the base URL and the protocol, then the
  models. In exchange, an endpoint nobody has heard of works exactly as well as a famous one, and
  nothing here needs a code change to keep working.
- A provider configured before this change keeps its base URL and protocol and arrives with **no
  models** — the list used to come from pi-ai at runtime. The models panel is where they go back
  in, which is also the first thing the workbench says if a conversation has nothing to run on.
- The model picker in a conversation is filled from the models panel and nowhere else. A model
  that is not written down there cannot be chosen, which is the point: what the workbench may send
  a request to is one list, written by the person who pays for it.
- `CustomProviderInput` and `saveCustomProvider` are gone with the distinction they named: with no
  catalog, every provider is custom, so `saveProvider` is the only way one is written down.
