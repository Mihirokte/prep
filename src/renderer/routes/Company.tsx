import { useModel } from '../model/context'
import { NotFound, BackLink } from '../components/nav'
import type { AskedQuestion, Company, RoundPattern } from '../../shared/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion'
import { cn } from '../lib/utils'

const countQuestions = (c: Company) => c.questions.reduce((n, g) => n + g.questions.length, 0)

const CHIP =
  'inline-flex h-7 items-center rounded-full border border-input bg-background px-2.5 text-[0.8125rem] text-muted-foreground no-underline transition-colors hover:border-brand/60 hover:text-brand'

/** Links from a question to the pattern cards it exercises. Unknown keys are
 *  dropped rather than rendered dead. */
function PatternChips({ keys }: { keys: string[] }) {
  const m = useModel()
  const pats = keys.map((k) => m.findPattern(k)).filter((p): p is NonNullable<typeof p> => Boolean(p))
  if (pats.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="label">Pattern</span>
      {pats.map((p) => (
        <a key={p.key} href={`#/pattern/${p.key}`} className={CHIP}>
          {p.name}
        </a>
      ))}
    </div>
  )
}

export function CompanyIndex() {
  const { companies } = useModel()
  return (
    <div className="max-w-3xl">
      <BackLink href="#/">Home</BackLink>
      <h1>Companies</h1>
      <div className="list panel mt-6">
        {companies.map((c) => (
          <a key={c.key} href={`#/company/${c.key}`} className="row">
            <span className="flex-1 min-w-0 truncate text-[0.9375rem]">{c.name}</span>
            <span className="num text-[0.8125rem] text-faint">{countQuestions(c)}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

/** One asked question: the question, a revealable short answer, and variants. */
function QuestionEntry({ item, n }: { item: AskedQuestion; n: number }) {
  return (
    <li className="px-5 py-5">
      <div className="flex gap-4">
        <span className="num shrink-0 pt-0.5 text-[0.8125rem] text-faint">{String(n).padStart(2, '0')}</span>
        <div className="min-w-0 flex-1">
          <p className="max-w-[66ch] text-[0.9375rem] leading-relaxed">{item.q}</p>
          {item.patterns && <PatternChips keys={item.patterns} />}

          <Accordion type="single" collapsible className="mt-2 -ml-3">
            <AccordionItem value="a" className="border-b-0">
              <AccordionTrigger className="w-auto flex-none gap-2 px-3 py-2 text-[0.8125rem] font-medium text-brand">
                Answer
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-1 pt-1">
                <p className="max-w-[70ch] text-[0.9375rem] leading-relaxed text-muted-foreground">{item.answer}</p>
                {item.related && item.related.length > 0 && (
                  <div className="mt-5">
                    <p className="label mb-2">Variants they could ask</p>
                    <ul className="max-w-[70ch] pl-5 list-disc marker:text-faint">
                      {item.related.map((r) => (
                        <li key={r} className="my-1.5 text-[0.9375rem] leading-relaxed">
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </li>
  )
}

/** One pattern expected in the algorithm round: what it is, why it is listed
 *  here, and a way into its card and drill set. */
function RoundPatternRow({ item }: { item: RoundPattern }) {
  const pat = useModel().findPattern(item.key)
  if (!pat) return null
  const reported = item.basis === 'reported'
  return (
    <article className="px-5 py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="m-0">
          <a href={`#/pattern/${pat.key}`} className="no-underline text-foreground transition-colors hover:text-brand">
            {pat.name}
          </a>
        </h3>
        <span
          className={cn(
            'inline-flex h-6 items-center rounded-full border px-2 text-[0.6875rem] font-medium',
            reported ? 'border-brand/40 bg-brand/10 text-brand' : 'border-input text-muted-foreground',
          )}
        >
          {reported ? 'From a reported question' : 'From the reported topics'}
        </span>
        <span className="num ml-auto text-[0.8125rem] text-faint">{pat.problemIds.length} drills</span>
      </div>
      <p className="mt-2 max-w-[70ch] text-[0.9375rem] leading-relaxed">{pat.essence}</p>
      <p className="mt-1.5 max-w-[70ch] text-[0.9375rem] leading-relaxed text-muted-foreground">{item.why}</p>
    </article>
  )
}

export function CompanyPage({ companyKey }: { companyKey: string }) {
  const c = useModel().findCompany(companyKey)
  if (!c) return <NotFound />
  const qCount = countQuestions(c)
  const variantCount = c.questions.reduce(
    (n, g) => n + g.questions.reduce((m, q) => m + (q.related?.length ?? 0), 0),
    0,
  )

  return (
    <div className="max-w-3xl">
      <BackLink href="#/companies">Companies</BackLink>
      <h1>{c.name}</h1>
      <p className="mt-3 max-w-[66ch] text-[0.9375rem] leading-relaxed text-muted-foreground">{c.descriptor}</p>

      <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
        {[
          ['Questions', qCount],
          ['Variants', variantCount],
          ['Patterns', c.dsaPatterns?.length ?? 0],
        ].map(([label, n]) => (
          <div key={String(label)} className="flex items-baseline gap-1.5">
            <dt className="label">{label}</dt>
            <dd className="num m-0 text-[0.9375rem]">{n}</dd>
          </div>
        ))}
      </dl>

      <Tabs defaultValue="questions" className="mt-8">
        <TabsList>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          {c.dsaPatterns && c.dsaPatterns.length > 0 && (
            <TabsTrigger value="patterns">DSA patterns</TabsTrigger>
          )}
          <TabsTrigger value="prep">LLD prep</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="pt-4">
          {c.questions.map((g) => (
            <section key={g.id} className="mt-8 first:mt-2">
              <div className="mb-2 flex items-baseline justify-between gap-4 px-1">
                <h2>{g.round}</h2>
                <span className="num text-[0.8125rem] text-faint">{g.questions.length}</span>
              </div>
              <ol className="list panel m-0 list-none p-0">
                {g.questions.map((item, i) => (
                  <QuestionEntry key={item.id} item={item} n={i + 1} />
                ))}
              </ol>
            </section>
          ))}
        </TabsContent>

        {c.dsaPatterns && c.dsaPatterns.length > 0 && (
          <TabsContent value="patterns" className="pt-6">
            <div className="list panel">
              {c.dsaPatterns.map((p) => (
                <RoundPatternRow key={p.key} item={p} />
              ))}
            </div>
          </TabsContent>
        )}

        <TabsContent value="prep" className="pt-6">
          <div className="grid gap-x-10 sm:grid-cols-2">
            {c.lldPrep.map((p) => (
              <article key={p.topic} className="border-t border-hairline px-1 py-5">
                <h2 className="mb-1.5">{p.topic}</h2>
                <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{p.why}</p>
              </article>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="notes" className="pt-6">
          <ul className="panel max-w-[66ch] list-disc px-5 py-4 pl-10 marker:text-faint">
            {c.specialNotes.map((n) => (
              <li key={n} className="my-2 text-[0.9375rem] leading-relaxed">
                {n}
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  )
}
