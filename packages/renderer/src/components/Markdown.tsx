import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Message text renders as markdown, built from React elements rather than injected HTML, so a
 * model that writes a script tag gets a script tag printed rather than a script tag run.
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-[1.65] text-parchment">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p className="mb-3 last:mb-0 whitespace-pre-wrap" {...props} />,
          h1: (props) => <h1 className="mb-2 mt-4 text-[17px] font-semibold" {...props} />,
          h2: (props) => <h2 className="mb-2 mt-4 text-[16px] font-semibold" {...props} />,
          h3: (props) => <h3 className="mb-1.5 mt-3 text-[15px] font-semibold" {...props} />,
          ul: (props) => <ul className="mb-3 list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="mb-3 list-decimal space-y-1 pl-5" {...props} />,
          li: (props) => <li className="leading-[1.6]" {...props} />,
          a: (props) => <a className="text-ember underline underline-offset-2 hover:text-ember-bright" {...props} />,
          blockquote: (props) => (
            <blockquote className="mb-3 border-l-2 border-line-strong pl-3 text-parchment-dim" {...props} />
          ),
          code: (props) => (
            <code className="rounded bg-ink-600 px-1 py-0.5 font-mono text-[12.5px] text-parchment" {...props} />
          ),
          pre: (props) => (
            <pre
              className="mb-3 overflow-x-auto rounded-card border border-line bg-ink-800 p-3 font-mono text-[12.5px] leading-[1.55]"
              {...props}
            />
          ),
          table: (props) => (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]" {...props} />
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
