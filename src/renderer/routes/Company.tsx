import { useModel } from '../model/context'
import { NotFound, BackLink } from '../components/nav'
import type { AskedQuestion, Company, RoundPattern } from '../../shared/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion'
import { pixelText } from '../components/pixelText'

const countQuestions = (c: Company) => c.questions.reduce((n, g) => n + g.questions.length, 0)

/** Links from a question to the pattern cards it exercises. Unknown keys are
 *  dropped rather than rendered dead. */
function PatternChips({ keys }: { keys: string[] }) {
  const m = useModel()
  const pats = keys.map((k) => m.findPattern(k)).filter((p): p is NonNullable<typeof p> => Boolean(p))
  if (pats.length === 0) return null
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="label">Pattern</span>
      {pats.map((p) => (
        <a key={p.key} href={`#/pattern/${p.key}`} className="chip">
          {pixelText(p.name)}
        </a>
      ))}
    </div>
  )
}

export function CompanyIndex() {
  const { companies } = useModel()
  return (
    <div className="mx-auto max-w-3xl pt-10">
      <h1>Companies</h1>
      <div className="list mt-10">
        {companies.map((c) => {
          const n = countQuestions(c)
          return (
            <a key={c.key} href={`#/company/${c.key}`} className="row no-underline">
              <span className="bullet" />
              <span className="min-w-0 flex-1 truncate">{pixelText(c.name)}</span>
              <span className="label num">
                {n} {n === 1 ? 'question' : 'questions'}
              </span>
            </a>
          )
        })}
      </div>
    </div>
  )
}

/** One asked question: the question, a revealable short answer, and variants. */
function QuestionEntry({ item, n }: { item: AskedQuestion; n: number }) {
  return (
    <li className="px-1 py-6">
      <div className="flex gap-5">
        <span className="label num shrink-0 pt-1">{String(n).padStart(2, '0')}</span>
        <div className="min-w-0 flex-1">
          <p className="max-w-[66ch]">{pixelText(item.q)}</p>
          {item.patterns && <PatternChips keys={item.patterns} />}

          <Accordion type="single" collapsible className="mt-3">
            <AccordionItem value="a" className="border-b-0">
              <AccordionTrigger className="!w-auto !flex-none !justify-start !gap-3 !px-0 !py-2">Answer</AccordionTrigger>
              <AccordionContent className="!px-0 pt-1">
                <p className="max-w-[70ch]">{pixelText(item.answer)}</p>
                {item.related && item.related.length > 0 && (
                  <div className="mt-6">
                    <p className="label mb-2">Variants they could ask</p>
                    <ul className="max-w-[70ch]">
                      {item.related.map((r) => (
                        <li key={r} className="relative my-2 pl-6 before:absolute before:left-1 before:top-3 before:size-1 before:bg-ink">
                          {pixelText(r)}
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
    <article className="px-1 py-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3>
          <a href={`#/pattern/${pat.key}`} className="no-underline">
            {pixelText(pat.name)}
          </a>
        </h3>
        <span className={reported ? 'chip !bg-ink !text-paper' : 'chip'}>{reported ? 'From a reported question' : 'From the reported topics'}</span>
        <span className="label num ml-auto">{pat.problemIds.length} drills</span>
      </div>
      <p className="mt-3 max-w-[70ch]">{pixelText(pat.essence)}</p>
      <p className="mt-2 max-w-[70ch] text-ink-2">{pixelText(item.why)}</p>
    </article>
  )
}

export function CompanyPage({ companyKey }: { companyKey: string }) {
  const c = useModel().findCompany(companyKey)
  if (!c) return <NotFound />
  const qCount = countQuestions(c)
  const variantCount = c.questions.reduce((n, g) => n + g.questions.reduce((m, q) => m + (q.related?.length ?? 0), 0), 0)

  return (
    <div className="mx-auto max-w-3xl pt-2">
      <BackLink href="#/companies">Companies</BackLink>
      <h1>{pixelText(c.name)}</h1>
      <p className="mt-4 max-w-[66ch] text-ink-2">{pixelText(c.descriptor)}</p>

      <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2">
        {[
          ['Questions', qCount],
          ['Variants', variantCount],
          ['Patterns', c.dsaPatterns?.length ?? 0],
        ].map(([label, n]) => (
          <div key={String(label)} className="flex items-baseline gap-2">
            <dt className="label">{label}</dt>
            <dd className="num m-0">{n}</dd>
          </div>
        ))}
      </dl>

      <Tabs defaultValue="questions" className="mt-10">
        <TabsList>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          {c.dsaPatterns && c.dsaPatterns.length > 0 && <TabsTrigger value="patterns">DSA patterns</TabsTrigger>}
          <TabsTrigger value="prep">LLD prep</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="questions">
          {c.questions.map((g) => (
            <section key={g.id} className="mt-10 first:mt-2">
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <h2>{pixelText(g.round)}</h2>
                <span className="label num">
                  {g.questions.length} {g.questions.length === 1 ? 'question' : 'questions'}
                </span>
              </div>
              <ol className="list m-0 list-none p-0">
                {g.questions.map((item, i) => (
                  <QuestionEntry key={item.id} item={item} n={i + 1} />
                ))}
              </ol>
            </section>
          ))}
        </TabsContent>

        {c.dsaPatterns && c.dsaPatterns.length > 0 && (
          <TabsContent value="patterns">
            <div className="list">
              {c.dsaPatterns.map((p) => (
                <RoundPatternRow key={p.key} item={p} />
              ))}
            </div>
          </TabsContent>
        )}

        <TabsContent value="prep">
          <div className="grid gap-x-12 sm:grid-cols-2">
            {c.lldPrep.map((p) => (
              <article key={p.topic} className="border-t border-hair py-6">
                <h2 className="mb-2">{pixelText(p.topic)}</h2>
                <p className="text-ink-2">{pixelText(p.why)}</p>
              </article>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <ul className="max-w-[66ch]">
            {c.specialNotes.map((n) => (
              <li key={n} className="relative my-3 pl-6 before:absolute before:left-1 before:top-3 before:size-1 before:bg-ink">
                {pixelText(n)}
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  )
}
