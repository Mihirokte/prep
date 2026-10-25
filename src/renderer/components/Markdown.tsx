import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../lib/utils'
import { pixelText } from './pixelText'
import SequenceDiagram from './blocks/SequenceDiagram'
import FlowDiagram, { parseFlow } from './blocks/FlowDiagram'
import { BarChart, StackChart, parseChart } from './blocks/Charts'
import StepsBlock, { parseSteps } from './blocks/Steps'
import { RecallDeck, RecallScope, parseRecall } from './blocks/Recall'
import CheckBlock from './blocks/Check'
import { parseCheck } from '../../shared/blocks'
import VizEmbed from '../viz/VizEmbed'

const RICH = /language-(mermaid|flow|stack|bars|steps|recall|check|viz)\b/
const CALLOUTS = new Set(['pitfall', 'interview', 'rule of thumb', 'numbers', 'key idea'])

/** Turn `> **Pitfall.** text` blockquotes into callouts. */
/* eslint-disable @typescript-eslint/no-explicit-any */
function remarkCallouts() {
  return (tree: any) => {
    const walk = (node: any) => {
      if (node.type === 'blockquote') {
        const p = node.children?.[0]
        const first = p?.type === 'paragraph' ? p.children?.[0] : null
        if (first?.type === 'strong') {
          const label = (first.children ?? []).map((c: any) => c.value ?? '').join('').replace(/[.:]\s*$/, '').trim()
          if (CALLOUTS.has(label.toLowerCase())) {
            p.children.shift()
            if (p.children[0]?.type === 'text') p.children[0].value = p.children[0].value.replace(/^\s+/, '')
            node.data = { hName: 'aside', hProperties: { 'data-callout': label } }
          }
        }
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

/** In-app routes (#/...) navigate in place; everything else opens in the browser. */
function Link({ href, children }: { href?: string; children: ReactNode }) {
  if (href?.startsWith('#')) return <a href={href}>{children}</a>
  return (
    <a href={href} target="_blank" rel="noopener">
      {children}
    </a>
  )
}

/** One line of markdown with no block wrapper: for list items and labels that
 *  carry **bold** or `code` but must stay inline. */
export function InlineMarkdown({ body }: { body: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <>{children}</>,
        strong: ({ children }) => <strong>{children}</strong>,
        code: ({ children }) => <code>{children}</code>,
        a: ({ href, children }) => <Link href={href}>{children}</Link>,
      }}
    >
      {pixelText(body)}
    </ReactMarkdown>
  )
}

function RichBlock({ lang, text }: { lang: string; text: string }) {
  switch (lang) {
    case 'mermaid':
      return <SequenceDiagram chart={text} />
    case 'flow': {
      const spec = parseFlow(text)
      return spec ? <FlowDiagram spec={spec} fallback={text} /> : <pre>{text}</pre>
    }
    case 'stack':
    case 'bars': {
      const chart = parseChart(text)
      if (!chart) return <pre>{text}</pre>
      return lang === 'stack' ? <StackChart chart={chart} /> : <BarChart chart={chart} />
    }
    case 'steps': {
      const rows = parseSteps(text)
      return rows ? <StepsBlock rows={rows} /> : <pre>{text}</pre>
    }
    case 'recall': {
      const pairs = parseRecall(text)
      return pairs.length ? <RecallDeck pairs={pairs} /> : <pre>{text}</pre>
    }
    case 'check': {
      const spec = parseCheck(text)
      return spec ? <CheckBlock spec={spec} /> : <pre>{text}</pre>
    }
    case 'viz':
      return <VizEmbed id={text} />
    default:
      return <pre>{text}</pre>
  }
}

/** Lesson prose, styled by the `.md` rules in prep.css (pixel body, Pixelta
 *  headings, square bullets, hairline tables). Rich fenced blocks render as
 *  live diagrams. `scope` ties recall cards to their lesson.
 *
 *  The component map is module-level on purpose: a new map on each render gives
 *  react-markdown new component types, so React remounts every block and the
 *  state inside them (a picked check answer, a diagram mid-play) is lost on
 *  any parent re-render, such as the lesson's scroll progress. */
const PLUGINS = [remarkGfm, remarkCallouts]
const COMPONENTS: Components = {
  h2: ({ children }) => <h2 id={slug(textOf(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={slug(textOf(children))}>{children}</h3>,
  a: ({ href, children }) => <Link href={href}>{children}</Link>,
  aside: ({ children, ...props }) => {
    const label = (props as { 'data-callout'?: string })['data-callout'] ?? ''
    return (
      <aside className="callout">
        <span className="label">{label}</span>
        {children}
      </aside>
    )
  },
  table: ({ children }) => (
    <div className="md-table">
      <table>{children}</table>
    </div>
  ),
  pre: ({ children }) => {
    const child = Children.toArray(children)[0] as ReactElement<{ className?: string }> | undefined
    if (child && isValidElement(child) && RICH.test(child.props.className ?? '')) return <>{children}</>
    return <pre>{children}</pre>
  },
  code: ({ className: cls, children }) => {
    const text = String(children).replace(/\n$/, '')
    const m = /language-(\w+)/.exec(cls ?? '')
    if (m && RICH.test(cls ?? '')) return <RichBlock lang={m[1]} text={text} />
    return <code className={cls}>{children}</code>
  },
}

export default function Markdown({ body, className, scope = 'free' }: { body: string; className?: string; scope?: string }) {
  return (
    <RecallScope.Provider value={scope}>
      <div className={cn('md', className)}>
        <ReactMarkdown remarkPlugins={PLUGINS} components={COMPONENTS}>
          {pixelText(body)}
        </ReactMarkdown>
      </div>
    </RecallScope.Provider>
  )
}
