/**
 * A conversation as a markdown file: everything that was said, thought, run and printed, in order.
 * The point of an export is that it can be read without Alpha, so nothing is linked back to the
 * app — tool calls show their arguments and their output rather than pointing at the ledger.
 */
import type { ChatBlock, ChatMessage, ConversationSummary } from './runtime-events.ts'

const NAME_LIMIT = 60

export function exportFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, NAME_LIMIT)
    .replace(/-+$/, '')
  return slug === '' ? 'conversation.md' : `${slug}.md`
}

export function exportMarkdown(conversation: ConversationSummary, messages: ChatMessage[]): string {
  const lines: string[] = [
    `# ${conversation.title}`,
    '',
    `Workspace: ${conversation.workspacePath}`,
    `Exported: ${new Date().toISOString()}`,
    '',
  ]

  for (const message of messages) {
    lines.push(...messageLines(message), '')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

function messageLines(message: ChatMessage): string[] {
  const heading = message.role === 'user' ? '## You' : '## Alpha'
  const lines = [heading, '']
  if (message.status === 'interrupted') lines.push('*interrupted — the answer stops where it was stopped*', '')

  for (const block of message.blocks) lines.push(...blockLines(block))
  return lines
}

function blockLines(block: ChatBlock): string[] {
  if (block.kind === 'text') return [block.text, '']
  if (block.kind === 'thinking') return ['### Thinking', '', block.text, '']
  if (block.kind === 'compaction') return ['### History summarised here', '', block.summary, '']
  if (block.kind === 'attachment') return [`![attached image](data:${block.mimeType};base64,${block.data})`, '']
  return toolLines(block)
}

function toolLines(block: Extract<ChatBlock, { kind: 'tool' }>): string[] {
  const exit = block.details?.exitCode === undefined ? '' : `, exit ${block.details.exitCode}`
  const lines = [`### Tool: ${block.name} (${block.status}${exit})`, '', '```json', block.raw, '```', '']
  if (block.approval !== undefined) lines.push(`*${block.approval.kind} at the ${block.approval.level} level*`, '')
  if (block.output !== '') {
    lines.push('Output:', '', '```', block.output, '```', '')
  }
  if (block.details?.truncated === true && block.details.fullOutputPath !== undefined) {
    lines.push(`*Output was truncated; the full text is at ${block.details.fullOutputPath}.*`, '')
  }
  return lines
}
