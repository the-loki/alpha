import type { Null } from '@alpha/core'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'

/**
 * The markdown syntax tree, and the little that has to be known about its shape.
 *
 * It comes straight from remark (mdast) — the same parse the old pipeline did, one step earlier —
 * and every node carries `position.end.offset`, which is what tells the streaming caret which block
 * the last character landed in.
 */
const parser = remark().use(remarkGfm)

/** The parts of a mdast node the renderer reads. */
export interface MdNode {
  type: string
  children?: MdNode[]
  value?: string
  depth?: number
  ordered?: boolean
  start?: number
  align?: Null<string>[]
  url?: string
  alt?: string
  title?: string
  checked?: Null<boolean>
  spread?: boolean
  position?: { end?: { offset?: number } }
}

export const asNode = (child: unknown): MdNode =>
  typeof child === 'object' && child !== null ? (child as MdNode) : { type: 'unknown' }

/** The tree of a message's markdown. */
export const treeOf = (text: string): MdNode => asNode(parser.parse(text))

/**
 * Whether the caret belongs inside this node: the node is where the text stops, once the trailing
 * whitespace a stream leaves behind is discounted.
 */
export const endsHere = (one: MdNode, caret: boolean, end: number): boolean => {
  const offset = one.position?.end?.offset
  return caret && offset !== undefined && offset >= end
}

/** A node's children, which is what most of the mapping walks. */
export const childrenOf = (one: MdNode): MdNode[] => one.children ?? []

/**
 * Whether an item is a checklist row. remark marks **every** item with `checked` — `null` for a
 * plain bullet — so the test is for a boolean, not for the field being there: reading `null` as
 * "this is a task" turns every list in a message into a column of empty checkboxes.
 */
export const isTaskItem = (one: MdNode): boolean => typeof one.checked === 'boolean'

/** Whether a list has a checklist in it, which is what decides which shape it wears. */
const hasTasks = (list: MdNode): boolean => childrenOf(list).some(isTaskItem)

/**
 * What a list's class is. A checklist is not a bulleted list: the pipeline that drew these before
 * named it `contains-task-list`, and that name took the place of the list's own styling.
 */
export const listClassOf = (list: MdNode, ordered: boolean): string =>
  hasTasks(list) ? 'contains-task-list' : `mb-3 max-w-measure list-${ordered ? 'decimal' : 'disc'} space-y-1 pl-5`

/** An item in a list with blank lines in it keeps its paragraphs; a tight one is text and marks. */
export const isLoose = (list: MdNode): boolean => list.spread === true

/**
 * An address that is safe to put in a link, in the shape react-markdown's own transform had: a
 * relative one passes, a scheme other than the harmless few does not. A model can write a link,
 * and a link that runs is the difference between printing an answer and running one.
 */
export function safeUrl(url: string): string {
  const colon = url.indexOf(':')
  if (colon === -1) return url
  const stops = ['/', '?', '#'].map((mark) => url.indexOf(mark)).filter((at) => at !== -1)
  if (stops.some((at) => colon > at)) return url
  return /^(https?|ircs?|mailto|xmpp)$/i.test(url.slice(0, colon)) ? url : ''
}
