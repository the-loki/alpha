/**
 * The history an agent starts from: the session's entries folded into the messages pi is handed,
 * with the entry each message came from kept beside it. The transcript is what is stored; this is
 * what the agent reads.
 *
 * It names the agent library because the fold's answer *is* that library's message array — the one
 * package of this kind that is not a capability, and C2.0 says which packages may.
 */
export * from './history.ts'
