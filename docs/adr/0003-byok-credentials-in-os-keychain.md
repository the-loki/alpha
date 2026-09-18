# BYOK credentials are encrypted with the OS keychain and never cross IPC in plaintext

A provider credential is written by the renderer once, encrypted in the main process with
Electron's `safeStorage`, and stored next to the provider definition in the app's data
directory. The renderer can write a credential and learn whether one exists; it can never read
one back.

## Context

Alpha ships no keys (see [03-product-scope.md](../constraints/03-product-scope.md)), so the
user's own key is the only way to run anything, and its handling is the app's most sensitive
path. The alternatives were a plaintext JSON file (simplest, and it leaks the key to any process
that can read the user's home directory), a system keychain via a native module (a build
dependency per platform), or `safeStorage` (already present in Electron, backed by Keychain /
libsecret / DPAPI).

## Considered options

- **Plaintext with 0600 permissions.** Rejected: the key is worth more than the file's
  convenience, and the failure is silent.
- **`keytar`-style native module.** Rejected: adds a per-platform native build to the packaging
  path for behaviour `safeStorage` already provides.
- **`safeStorage` with a documented fallback** (chosen). Where the OS refuses to provide a
  backend, Alpha stores the key plaintext but tells the user, in the provider settings UI, that
  it did — a known state beats a silent one.

## Consequences

Credentials cannot be exported or synced between machines; a user re-enters the key per machine.
The IPC contract carries a credential only in the store direction, which the architecture
constraint checker enforces by scanning the renderer for reads of credential-shaped fields.
