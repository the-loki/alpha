import { describe, expect, it } from 'vitest'
import { childrenOf, isTaskItem, listClassOf, safeUrl, treeOf } from './markdown-tree.ts'

/**
 * [renderer] The part of markdown that is a decision rather than markup: which lists are checklists,
 * which items carry a box, and which URLs are safe to put in a link. The JSX around them is drawn
 * by the window; these are the rules it draws from, and they live here because a mistake in them is
 * invisible until a message happens to contain the shape.
 */
describe('[renderer] the markdown tree the message renders from', () => {
  it('a plain list is a plain list, not a list of checkboxes', () => {
    const tree = treeOf('- first\n- second\n')
    const list = childrenOf(tree)[0]

    // remark marks every item with `checked`, and only a GFM task item with true or false: the
    // difference between `null` and `false` is the whole of this bug, so it is pinned here.
    expect(listClassOf(list, false)).toBe('mb-3 max-w-measure list-disc space-y-1 pl-5')
    expect(childrenOf(list).map(isTaskItem)).toEqual([false, false])
  })

  it('a task list is a checklist, and says which items are ticked', () => {
    const tree = treeOf('- [ ] first\n- [x] second\n')
    const list = childrenOf(tree)[0]

    expect(listClassOf(list, false)).toBe('contains-task-list')
    expect(childrenOf(list).map(isTaskItem)).toEqual([true, true])
    expect(childrenOf(list).map((item) => item.checked)).toEqual([false, true])
  })

  it('an ordered list numbers itself, and starts where it says it starts', () => {
    const list = childrenOf(treeOf('1. first\n2. second\n'))[0]
    expect(listClassOf(list, true)).toBe('mb-3 max-w-measure list-decimal space-y-1 pl-5')
  })

  it('keeps the addresses that are not a scheme, and drops the ones that would run', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(safeUrl('mailto:someone@example.com')).toBe('mailto:someone@example.com')
    expect(safeUrl('/c/abc?tab=x')).toBe('/c/abc?tab=x')
    expect(safeUrl('#/settings')).toBe('#/settings')
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe('')
  })
})
