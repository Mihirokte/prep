import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../lib/utils'
import SequenceDiagram from './SequenceDiagram'

/** In-app routes (#/…) navigate in place; everything else opens in the browser. */
function Link({ href, children }: { href?: string; children: ReactNode }) {
  if (href?.startsWith('#')) return <a href={href} className="text-brand underline decoration-brand/40 hover:decoration-brand">{children}</a>
  return (
    <a href={href} target="_blank" rel="noopener" className="text-brand underline decoration-brand/40 hover:decoration-brand">
      {children}
    </a>
  )
}

const INLINE_CODE = 'rounded-sm bg-[oklch(1_0_0/0.07)] px-1.5 py-0.5 font-mono text-[0.875em] text-foreground'

/** One line of markdown with no block wrapper — for list items and labels that
 *  carry **bold** or `code` but must stay inline. */
export function InlineMarkdown({ body }: { body: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <>{children}</>,
        strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
        code: ({ children }) => <code className={INLINE_CODE}>{children}</code>,
        a: ({ href, children }) => <Link href={href}>{children}</Link>,
      }}
    >
      {body}
    </ReactMarkdown>
  )
}

// Lesson prose. Tailwind classes are applied per element so the markdown
// inherits the same tokens as the rest of the app.
export default function Markdown({ body, className }: { body: string; className?: string }) {
  return (
    <div className={cn('text-[1rem] leading-[1.7] [&>*+*]:mt-4', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => <h2 className="mt-10 mb-3 text-[1.25rem]">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-8 mb-2 text-[1.0625rem]">{children}</h3>,
          p: ({ children }) => <p className="my-4">{children}</p>,
          ul: ({ children }) => <ul className="my-4 pl-6 list-disc marker:text-faint">{children}</ul>,
          ol: ({ children }) => <ol className="my-4 pl-6 list-decimal marker:text-faint">{children}</ol>,
          li: ({ children }) => <li className="my-1.5">{children}</li>,
          strong: ({ children }) => <strong className="font-medium">{children}</strong>,
          a: ({ href, children }) => <Link href={href}>{children}</Link>,
          blockquote: ({ children }) => (
            <blockquote className="md-surface my-6 rounded-md bg-card px-5 py-3 text-muted-foreground shadow-[var(--shadow-panel)] [&>p]:my-2">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="md-surface my-6 overflow-x-auto rounded-md bg-card shadow-[var(--shadow-panel)]"><table className="w-full border-collapse text-[0.9rem]">{children}</table></div>
          ),
          th: ({ children }) => (
            <th className="border-b border-hairline px-4 py-2.5 text-left text-[0.75rem] font-medium text-faint">{children}</th>
          ),
          td: ({ children }) => <td className="border-b border-hairline px-4 py-2.5 text-left align-top last:border-b-0">{children}</td>,
          code({ className, children, ...props }) {
            const text = String(children).replace(/\n$/, '')
            if (className === 'language-mermaid') return <SequenceDiagram chart={text} />
            if (!className) return <code className={INLINE_CODE}>{children}</code>
            return (
              <pre className="md-surface my-6 overflow-x-auto rounded-md bg-card px-4 py-3.5 font-mono text-[0.8125rem] leading-relaxed shadow-[var(--shadow-panel)]">
                <code {...props}>{children}</code>
              </pre>
            )
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}
