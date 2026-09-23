/**
 * Where the library used to be. The dictionary, the rules and the contract are packages of their
 * own now; this re-export is what lets the call sites move over one directory at a time, and it
 * goes when the last of them has.
 */

export * from '@alpha/contract'
export * from '@alpha/domain'
export * from '@alpha/i18n'
