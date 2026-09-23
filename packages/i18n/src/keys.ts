/**
 * The key type, on its own: the English dictionary names the keys, and the entry and the Chinese
 * dictionary both speak of them. It sits in a leaf rather than in the entry because the entry
 * imports the dictionaries — a dictionary naming a type from the entry would close a loop, which
 * the checker's `no-import-cycles` exists to refuse. One definition, one direction: English names
 * the keys, and everything else reads them from here.
 */
import type { EN } from './en.ts'

export type TextKey = keyof typeof EN
