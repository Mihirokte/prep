import type { Pattern } from '../../shared/types'
import { useModel } from '../model/context'
import { useAppSelector } from '../store'
import { Difficulty, StatusDot } from '../components/ui'
import Markdown, { InlineMarkdown } from '../components/Markdown'
import { NotFound, BackLink } from '../components/nav'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion'
import { pixelText } from '../components/pixelText'
import VizPlayer from '../viz/VizPlayer'
import { sceneForPattern } from '../viz'

/** Index: every pattern, grouped by family, one scannable line each. Every
 *  pattern has a walk-through, so nothing per-row says so (it would carry no
 *  information); the name leads in bold, the essence follows in ink-2. */
export function PatternIndex() {
  const { patternFamilies } = useModel()
  return (
    <div className="mx-auto max-w-3xl pt-10">
      <h1>Patterns</h1>

      {patternFamilies.map((family) => (
        <section key={family.name} className="mt-12">
          <div className="mb-4 flex items-baseline justify-between gap-4 px-4">
            <h2>{pixelText(family.name)}</h2>
            <span className="label num">{family.patterns.length} patterns</span>
          </div>

          <div className="list">
            {family.patterns.map((pat) => (
              <a key={pat.key} href={`#/pattern/${pat.key}`} className="row grid grid-cols-[minmax(0,1fr)_auto] items-start gap-6 py-4 no-underline">
                <span className="min-w-0">
                  <span className="block font-bold">{pixelText(pat.name)}</span>
                  <span className="mt-1 block max-w-[62ch] text-ink-2">{pixelText(pat.essence)}</span>
                </span>
                <span className="label num text-right">
                  {pat.problemIds.length} {pat.problemIds.length === 1 ? 'problem' : 'problems'}
                </span>
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
    <AccordionItem value={id}>
      <AccordionTrigger className="!py-3 normal-case tracking-normal [font-family:var(--font-sans)] !text-[16px]">
        <StatusDot status={status} />
        <span className="min-w-0 flex-1 truncate text-left">{pixelText(drill.title)}</span>
        {runnable && <span className="sr-only">editor</span>}
        <Difficulty value={drill.difficulty} />
      </AccordionTrigger>

      <AccordionContent className="pl-[124px]">
        <div className="prose-col">
          {pack ? <Markdown body={pack.description_md} scope={`pp-${id}`} /> : <p>{pixelText(drill.prompt)}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <a href={`#/drill/${id}`} className="chip">
              {runnable ? 'Open with editor' : 'Open problem'}
            </a>
            {drill.link && (
              <a href={drill.link} target="_blank" rel="noopener" className="chip">
                LeetCode
              </a>
            )}
          </div>

          <OtherPatterns id={id} exclude={exclude} />
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

/** "This problem also belongs to..." the cross-pattern link. */
function OtherPatterns({ id, exclude }: { id: string; exclude?: string }) {
  const others = useModel()
    .patternsForProblem(id)
    .filter((pat) => pat.key !== exclude)
  if (others.length === 0) return null
  return (
    <p className="mt-5 flex flex-wrap items-center gap-2">
      <span className="label">Also</span>
      {others.map((pat) => (
        <a key={pat.key} href={`#/pattern/${pat.key}`} className="chip">
          {pixelText(pat.name)}
        </a>
      ))}
    </p>
  )
}

/** The card: essence and cues visible, an animated walk-through, the depth one tap away, problems below. */
export function PatternPage({ patternKey }: { patternKey: string }) {
  const m = useModel()
  const pat = m.findPattern(patternKey)
  if (!pat) return <NotFound />
  const scene = sceneForPattern(pat.key)

  return (
    <div className="mx-auto max-w-3xl pt-2">
      <BackLink href="#/patterns">Patterns</BackLink>

      <div className="flex flex-wrap items-center gap-4">
        <h1>{pixelText(pat.name)}</h1>
        {pat.canonical && <span className="chip">core 16</span>}
      </div>
      <p className="mt-4 max-w-[62ch]">{pixelText(pat.essence)}</p>

      {scene && <VizPlayer key={scene.id} scene={scene} />}

      <section className="mt-12">
        <h2 className="mb-4">Reach for it when</h2>
        <ul className="list">
          {pat.cues.map((cue) => (
            <li key={cue} className="flex max-w-[70ch] gap-4 px-4 py-3">
              <span aria-hidden="true" className="bullet mt-[12px]" />
              <span>
                <InlineMarkdown body={cue} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Accordion type="multiple" className="mt-10 border-y-2 border-ink">
        <AccordionItem value="mechanism">
          <AccordionTrigger>How it works</AccordionTrigger>
          <AccordionContent>
            <div className="prose-col">
              <Markdown body={pat.mechanism} scope={`pm-${pat.key}`} />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="template">
          <AccordionTrigger>Code template</AccordionTrigger>
          <AccordionContent>
            <pre className="notch overflow-x-auto border border-hair-strong bg-surface p-4 text-[16px] leading-6">{pat.template}</pre>
            <p className="prose-col mt-4 flex flex-wrap items-baseline gap-x-3">
              <span className="label">Cost</span> {pixelText(pat.complexity)}
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="pitfalls">
          <AccordionTrigger>Where it goes wrong</AccordionTrigger>
          <AccordionContent>
            <ul className="prose-col">
              {pat.pitfalls.map((pit) => (
                <li key={pit} className="relative my-2 pl-6 before:absolute before:left-1 before:top-3 before:size-1 before:bg-ink">
                  <InlineMarkdown body={pit} />
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>

        {pat.contrasts && pat.contrasts.length > 0 && (
          <AccordionItem value="contrasts">
            <AccordionTrigger>Do not confuse it with</AccordionTrigger>
            <AccordionContent>
              <dl className="prose-col">
                {pat.contrasts.map((c) => {
                  const other = m.findPattern(c.key)
                  return (
                    <div key={c.key} className="border-b border-hair py-3 last:border-b-0">
                      <dt>
                        <a href={`#/pattern/${c.key}`}>{pixelText(other?.name ?? c.key)}</a>
                      </dt>
                      <dd className="ml-0 mt-1 text-ink-2">
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

      <section className="mt-14">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2>Problems</h2>
          <span className="label num">{pat.problemIds.length} mapped</span>
        </div>
        <Accordion type="multiple" className="border-y border-hair">
          {pat.problemIds.map((id) => (
            <ProblemEntry key={id} id={id} exclude={pat.key} />
          ))}
        </Accordion>
      </section>
    </div>
  )
}

/** Pattern chips for the drill page: the reverse mapping. */
export function PatternChips({ problemId }: { problemId: string }) {
  const pats: Pattern[] = useModel().patternsForProblem(problemId)
  if (pats.length === 0) return null
  return (
    <>
      {pats.map((pat) => (
        <a key={pat.key} href={`#/pattern/${pat.key}`} className="chip">
          {pixelText(pat.name)}
        </a>
      ))}
    </>
  )
}
