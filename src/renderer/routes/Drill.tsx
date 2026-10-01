import { useEffect, useState } from 'react'
import { ArrowUpRight, Play, RotateCcw } from 'lucide-react'
import { validator, type JudgeState, type ValidateOutcome } from '../judge'
import { useModel } from '../model/context'
import { useAppDispatch, useAppSelector } from '../store'
import { setProblemCode } from '../store/progressSlice'
import Editor from '../components/Editor'
import Markdown from '../components/Markdown'
import { Difficulty, ProblemNotes, ProblemStatusBar } from '../components/ui'
import { NotFound, BackLink } from '../components/nav'
import { PatternChips } from './Patterns'
import { Button } from '../ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion'
import { cn } from '../lib/utils'
import type { Drill, Problem } from '../types'

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1 text-[0.8125rem] text-muted-foreground no-underline hover:text-foreground"
    >
      {children}
      <ArrowUpRight aria-hidden="true" className="size-3.5 text-faint" />
    </a>
  )
}

function ProblemView({ problem }: { problem: Problem }) {
  const dispatch = useAppDispatch()
  const savedCode = useAppSelector((s) => s.progress.problems[problem.id]?.code)
  const [code, setCode] = useState(() => savedCode ?? problem.starter_code)
  const [state, setState] = useState<JudgeState>(validator.state)
  const [outcome, setOutcome] = useState<ValidateOutcome | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    validator.onState = setState
    validator.start()
    setState(validator.state)
  }, [])

  const check = async () => {
    setBusy(true)
    setOutcome(null)
    dispatch(setProblemCode({ id: problem.id, code }))
    setOutcome(await validator.validate(code, problem.signature?.name))
    setBusy(false)
  }

  const reset = () => {
    setCode(problem.starter_code)
    setOutcome(null)
    dispatch(setProblemCode({ id: problem.id, code: problem.starter_code }))
  }

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-10">
      <div className="prose-col [&>*+*]:mt-6">
        <Markdown body={problem.description_md} />
        <div>
          <ExternalLink href={problem.link}>Open on LeetCode</ExternalLink>
        </div>
        <ProblemStatusBar id={problem.id} />
        <ProblemNotes id={problem.id} />
        {problem.reference_solution && (
          <Accordion type="single" collapsible className="panel">
            <AccordionItem value="sol" className="border-b-0">
              <AccordionTrigger className="text-brand">Reference solution</AccordionTrigger>
              <AccordionContent>
                <pre className="overflow-x-auto rounded-md bg-background px-4 py-3 font-mono text-[0.8125rem] leading-relaxed">
                  {problem.reference_solution}
                </pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>

      <div className="panel flex min-h-[420px] flex-col overflow-hidden xl:sticky xl:top-2 xl:h-[calc(100vh-52px-1.5rem)]">
        <div className="min-h-0 flex-1">
          <Editor key={problem.id} initial={code} onChange={setCode} />
        </div>
        <div className="shrink-0 border-t border-hairline">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <Button onClick={check} disabled={busy || state !== 'ready'}>
              <Play aria-hidden="true" className="size-3.5" />
              {busy ? 'Checking…' : state === 'booting' ? 'Loading Python…' : state === 'failed' ? 'Python failed' : 'Check syntax'}
            </Button>
            <Button variant="ghost" onClick={reset}>
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Reset
            </Button>
          </div>
          {outcome && (
            <div
              className={cn(
                'px-4 py-3 text-[0.875rem] leading-relaxed border-t border-hairline',
                outcome.status === 'ok' ? 'bg-brand/10 text-foreground' : 'bg-destructive/10 text-foreground',
              )}
            >
              {outcome.status === 'ok' ? outcome.message : outcome.status === 'timeout' ? 'Timed out — runtime restarted.' : outcome.message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DrillView({ drill }: { drill: Drill }) {
  return (
    <div className="prose-col [&>*+*]:mt-6">
      <p className="panel whitespace-pre-wrap px-5 py-4 text-[1rem] leading-relaxed">{drill.prompt}</p>
      {drill.link && (
        <div>
          <ExternalLink href={drill.link}>Reference</ExternalLink>
        </div>
      )}
      <ProblemStatusBar id={drill.id} />
      <ProblemNotes id={drill.id} />
      {drill.solution && (
        <Accordion type="single" collapsible className="panel">
          <AccordionItem value="sol" className="border-b-0">
            <AccordionTrigger className="text-brand">Show solution</AccordionTrigger>
            <AccordionContent>
              <Markdown body={drill.solution} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  )
}

export function DrillPage({ id }: { id: string }) {
  const m = useModel()
  const drill = m.drillById(id)
  const areaKey = m.areaKeyOf(id)
  const similar = m.relatedProblems(id, 6)
  if (!drill) return <NotFound />
  const problem = m.packs[id]
  const back = areaKey === 'dsa' ? { href: '#/dsa', label: 'DSA' } : areaKey ? { href: `#/study/${areaKey}`, label: 'Course' } : { href: '#/', label: 'Home' }
  return (
    <div>
      <BackLink href={back.href}>{back.label}</BackLink>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1>{drill.title}</h1>
        <Difficulty value={drill.difficulty} className="w-auto text-left text-[0.8125rem]" />
      </div>
      <div className="mb-8">
        <PatternChips problemId={id} />
      </div>
      {problem ? <ProblemView problem={problem} /> : <DrillView drill={drill} />}
      {similar.length > 0 && (
        <section className="mt-14 max-w-3xl">
          <h2 className="px-1">Similar problems</h2>
          <div className="list panel mt-3">
            {similar.map((sid) => {
              const d = m.drillById(sid)
              if (!d) return null
              return (
                <a key={sid} href={`#/drill/${sid}`} className="row">
                  <span className="flex-1 min-w-0 truncate text-[0.9375rem]">{d.title}</span>
                  <Difficulty value={d.difficulty} />
                </a>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
