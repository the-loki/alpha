import { memo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Message text renders as markdown, built from React elements rather than injected HTML, so a
 * model that writes a script tag gets a script tag printed rather than a script tag run.
 */
/** Where a markdown node ends, in characters from the start of the message. */
type Positioned = { position?: { end?: { offset?: number } } }

export const Markdown = memo(function Markdown({ text, caret = false }: { text: string; caret?: boolean }) {
  // The caret goes inside whatever block the last character is in, at the end of it: as a sibling
  // after the block it would sit on a line of its own and read as a stray bar. A stream can stop
  // inside a paragraph, a list item or a code fence, so each of those carries it.
  const endsHere = (node: Positioned | undefined): boolean => {
    const end = node?.position?.end?.offset
    return caret && end !== undefined && end >= text.trimEnd().length
  }
  const tail = (node: Positioned | undefined, children: ReactNode): ReactNode => (
    <>
      {children}
      {endsHere(node) && <span className="ember-cursor ml-0.5" aria-hidden="true" />}
    </>
  )

  return (
    <div className="text-body text-parchment">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Prose carries the reading measure (C5.3); code, tables and tool rows take the pane.
          p: (props) => (
            <p className="mb-3 max-w-measure last:mb-0 whitespace-pre-wrap" {...props}>
              {tail(props.node, props.children)}
            </p>
          ),
          h1: (props) => <h1 className="mb-2 mt-4 max-w-measure text-lg font-semibold" {...props} />,
          h2: (props) => <h2 className="mb-2 mt-4 max-w-measure text-base font-semibold" {...props} />,
          h3: (props) => <h3 className="mb-1.5 mt-3 max-w-measure text-body font-semibold" {...props} />,
          ul: (props) => <ul className="mb-3 max-w-measure list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="mb-3 max-w-measure list-decimal space-y-1 pl-5" {...props} />,
          li: (props) => (
            <li className="leading-[1.6]" {...props}>
              {tail(props.node, props.children)}
            </li>
          ),
          a: (props) => <a className="text-ember underline underline-offset-2 hover:text-ember-bright" {...props} />,
          blockquote: (props) => (
            <blockquote className="mb-3 max-w-measure border-l-2 border-line-strong pl-3 text-parchment-dim" {...props}>
              {tail(props.node, props.children)}
            </blockquote>
          ),
          code: (props) => (
            <code className="rounded bg-ink-600 px-1 py-0.5 font-mono text-code text-parchment" {...props} />
          ),
          pre: (props) => (
            <pre
              className="mb-3 overflow-x-auto rounded-card border border-line bg-ink-800 p-3 font-mono text-code"
              {...props}
            >
              {tail(props.node, props.children)}
            </pre>
          ),
          table: (props) => (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-ui" {...props} />
            </div>
          ),
          th: (props) => <th className="border border-line px-2 py-1 text-left font-medium" {...props} />,
          td: (props) => <td className="border border-line px-2 py-1 align-top" {...props} />,
          hr: () => <hr className="my-4 border-line" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
