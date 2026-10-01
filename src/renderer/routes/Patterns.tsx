import { ArrowUpRight } from 'lucide-react'
import type { Pattern } from '../../shared/types'
import { useModel } from '../model/context'
import { useAppSelector } from '../store'
import { Difficulty, StatusDot } from '../components/ui'
import Markdown, { InlineMarkdown } from '../components/Markdown'
import { NotFound, BackLink } from '../components/nav'
import { Badge } from '../ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion'

const CHIP =
  'inline-flex h-7 items-center rounded-full border border-input bg-card px-2.5 text-[0.8125rem] text-muted-foreground no-underline transition-colors hover:border-brand/60 hover:text-brand'

/** Index: every pattern, grouped by family, one scannable line each. */
export function PatternIndex() {
  const { patternFamilies } = useModel()
  return (
    <div className="max-w-3xl">
      <BackLink href="#/">Home</BackLink>
      <h1>Patterns</h1>

      {patternFamilies.map((family) => (
        <section key={family.name} className="mt-10 first-of-type:mt-8">
          <div className="flex items-baseline justify-between gap-4 px-1 mb-2">
            <h2>{family.name}</h2>
            <span className="num text-[0.8125rem] text-faint">{family.patterns.length}</span>
          </div>

          <div className="list panel">
            {family.patterns.map((pat) => (
              <a
                key={pat.key}
                href={`#/pattern/${pat.key}`}
                className="row grid grid-cols-[minmax(0,1fr)_2.5rem] items-baseline gap-4 px-4 py-3.5"
              >
                <span className="min-w-0">
                  <span className="block text-[0.9375rem] font-medium">{pat.name}</span>
                  <span className="mt-0.5 block max-w-[62ch] text-[0.875rem] leading-relaxed text-muted-foreground">
                    {pat.essence}
                  </span>
                </span>
                <span className="num text-right text-[0.8125rem] text-faint">{pat.problemIds.length}</span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** One mapped problem: title row, expanding to the whole question. */
function ProblemEntry({ id, exclude }: { id: string; exclude: string }) {
  const m = useModel()
  const drill = m.drillById(id)
  const status = useAppSelector((s) => s.progress.problems[id]?.status ?? 'none')
  if (!drill) return null
  const pack = m.packs[id]
  const runnable = m.isRunnable(id)

  return (
    <AccordionItem value={id} className="border-b border-hairline">
      <AccordionTrigger className="rounded-none px-4 py-3 font-normal">
        <span className="flex flex-1 items-center gap-3 min-w-0 text-left">
          <StatusDot status={status} />
          <span className="flex-1 min-w-0 truncate text-[0.9375rem]">{drill.title}</span>
          {runnable && <span className="sr-only">editor</span>}
          <Difficulty value={drill.difficulty} />
        </span>
      </AccordionTrigger>

      <AccordionContent className="px-4 pb-6">
        <div className="prose-col pl-7">
          {pack ? <Markdown body={pack.description_md} /> : <p className="leading-relaxed">{drill.prompt}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <a href={`#/drill/${id}`} className={CHIP}>
              {runnable ? 'Open with editor' : 'Open problem'}
            </a>
            {drill.link && (
              <a href={drill.link} target="_blank" rel="noopener" className={CHIP}>
                LeetCode
                <ArrowUpRight aria-hidden="true" className="ml-1 size-3.5 text-faint" />
              </a>
            )}
          </div>

          <OtherPatterns id={id} exclude={exclude} />
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

/** "This problem also belongs to…" — the cross-pattern link. */
function OtherPatterns({ id, exclude }: { id: string; exclude?: string }) {
  const others = useModel()
    .patternsForProblem(id)
    .filter((pat) => pat.key !== exclude)
  if (others.length === 0) return null
  return (
    <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.8125rem] text-muted-foreground">
      <span className="label">Also</span>
      {others.map((pat) => (
        <a key={pat.key} href={`#/pattern/${pat.key}`} className={CHIP}>
          {pat.name}
        </a>
      ))}
    </p>
  )
}

/** The card: essence + cues visible, the depth one tap away, problems below. */
export function PatternPage({ patternKey }: { patternKey: string }) {
  const m = useModel()
  const pat = m.findPattern(patternKey)
  if (!pat) return <NotFound />

  return (
    <div className="max-w-3xl">
      <BackLink href="#/patterns">Patterns</BackLink>

      <div className="flex flex-wrap items-center gap-3">
        <h1>{pat.name}</h1>
        {pat.canonical && (
          <Badge variant="outline" className="uppercase tracking-wide text-[0.625rem]">
            core 16
          </Badge>
        )}
      </div>
      <p className="mt-4 max-w-[62ch] text-[1.125rem] leading-relaxed text-foreground/90">{pat.essence}</p>

      <section className="mt-10">
        <h2 className="mb-3 px-1">Reach for it when</h2>
        <ul className="panel px-5 py-2">
          {pat.cues.map((cue) => (
            <li key={cue} className="flex max-w-[70ch] gap-3 py-2.5 leading-relaxed text-[0.9375rem]">
              <span aria-hidden="true" className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-brand" />
              <span>
                <InlineMarkdown body={cue} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Accordion type="multiple" className="panel mt-8 [&>*+*]:border-t [&>*+*]:border-hairline">
        <AccordionItem value="mechanism" className="border-b-0">
          <AccordionTrigger>How it works</AccordionTrigger>
          <AccordionContent>
            <div className="prose-col">
              <Markdown body={pat.mechanism} />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="template" className="border-b-0">
          <AccordionTrigger>Code template</AccordionTrigger>
          <AccordionContent>
            <pre className="overflow-x-auto rounded-md bg-background px-4 py-3 font-mono text-[0.8125rem] leading-relaxed">
              {pat.template}
            </pre>
            <p className="mt-4 flex flex-wrap items-baseline gap-x-2 prose-col text-[0.9375rem] leading-relaxed text-muted-foreground">
              <span className="label">Cost</span> {pat.complexity}
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="pitfalls" className="border-b-0">
          <AccordionTrigger>Where it goes wrong</AccordionTrigger>
          <AccordionContent>
            <ul className="prose-col pl-5 list-disc marker:text-faint">
              {pat.pitfalls.map((pit) => (
                <li key={pit} className="my-2 text-[0.9375rem] leading-relaxed">
                  <InlineMarkdown body={pit} />
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>

        {pat.contrasts && pat.contrasts.length > 0 && (
          <AccordionItem value="contrasts" className="border-b-0">
            <AccordionTrigger>Don't confuse it with</AccordionTrigger>
            <AccordionContent>
              <dl className="prose-col">
                {pat.contrasts.map((c) => {
                  const other = m.findPattern(c.key)
                  return (
                    <div key={c.key} className="py-3 border-b border-hairline last:border-b-0">
                      <dt>
                        <a href={`#/pattern/${c.key}`} className="text-[0.9375rem] font-medium text-brand no-underline hover:underline">
                          {other?.name ?? c.key}
                        </a>
                      </dt>
                      <dd className="mt-1 ml-0 text-[0.9375rem] leading-relaxed text-muted-foreground">
                        <InlineMarkdown body={c.how} />
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>

      <section className="mt-12">
        <div className="flex items-baseline justify-between gap-4 px-1 mb-2">
          <h2>Problems</h2>
          <span className="num text-[0.8125rem] text-faint">{pat.problemIds.length}</span>
        </div>
        <Accordion type="multiple" className="panel overflow-hidden [&>*:last-child]:border-b-0">
          {pat.problemIds.map((id) => (
            <ProblemEntry key={id} id={id} exclude={pat.key} />
          ))}
        </Accordion>
      </section>
    </div>
  )
}

/** Pattern chips for the drill page — the reverse mapping. */
export function PatternChips({ problemId }: { problemId: string }) {
  const pats: Pattern[] = useModel().patternsForProblem(problemId)
  if (pats.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="label">Pattern</span>
      {pats.map((pat) => (
        <a key={pat.key} href={`#/pattern/${pat.key}`} className={CHIP}>
          {pat.name}
        </a>
      ))}
    </div>
  )
}
