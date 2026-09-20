/**
 * Copying, in one place. The window has no Node, so this is the browser clipboard and nothing
 * else; a copy that silently fails is worse than one that says so, hence the boolean.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** The raw text a message holds, blocks in order, which is what "copy as text" means. */
export function markdownOf(blocks: { kind: string; text?: string }[]): string {
  return blocks
    .map((block) => block.text ?? '')
    .filter((text) => text !== '')
    .join('\n\n')
}
