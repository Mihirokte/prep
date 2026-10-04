import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { validator, type JudgeState, type ValidateOutcome } from '../judge'
import { useModel } from '../model/context'
import { useAppDispatch, useAppSelector } from '../store'
import { addProblemTime, setProblemCode } from '../store/progressSlice'
import Editor from '../components/Editor'
import Markdown from '../components/Markdown'
import VizPlayer from '../viz/VizPlayer'
import { sceneForPattern } from '../viz'
import { Difficulty, ProblemNotes, ProblemStatusBar, StatusDot } from '../components/ui'
import { NotFound, BackLink } from '../components/nav'
import { PatternChips } from './Patterns'
import { Button } from '../ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command'
import { pixelText } from '../components/pixelText'
import { cn } from '../lib/utils'
import type { Drill, Problem } from '../types'
import type { Pattern } from '../../shared/types'

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="label inline-flex items-center gap-1 no-underline hover:text-brand">
      {children}
    </a>
  )
}

function useStopwatch(id: string) {
  const dispatch = useAppDispatch()
  const [sec, setSec] = useState(0)
  const [running, setRunning] = useState(true)
  const secRef = useRef(0)
  secRef.current = sec
  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => setSec((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [running])
  useEffect(
    () => () => {
      if (secRef.current >= 10) dispatch(addProblemTime({ id, seconds: secRef.current }))
    },
    [id, dispatch],
  )
  return { sec, running, toggle: () => setRunning((r) => !r) }
}

/** Hints that get more specific one step at a time, drawn from the pattern cards. */
function HintLadder({ topic, patterns }: { topic?: string; patterns: Pattern[] }) {
  const [shown, setShown] = useState(0)
  const p = patterns[0]
  const hints = useMemo(() => {
    const out: { title: string; body: React.ReactNode }[] = []
    if (topic || p) {
      out.push({
        title: 'What to notice',
        body: (
          <>
            {topic && <p className="mb-2">Topic: {topic}.</p>}
            {p && (
              <ul>
                {p.cues.slice(0, 3).map((c, i) => (
                  <li key={i}>{pixelText(c)}</li>
                ))}
              </ul>
            )}
          </>
        ),
      })
    }
    if (p)
      out.push(
        {
          title: 'The pattern',
          body: (
            <p>
              <a href={`#/pattern/${p.key}`}>{pixelText(p.name)}</a>: {pixelText(p.essence)}
            </p>
          ),
        },
        { title: 'How it works', body: <p>{pixelText(p.mechanism)}</p> },
        {
          title: 'Where it goes wrong',
          body: (
            <ul>
              {p.pitfalls.slice(0, 3).map((c, i) => (
                <li key={i}>{pixelText(c)}</li>
              ))}
            </ul>
          ),
        },
      )
    return out
  }, [p, topic])
  if (hints.length === 0) return null
  return (
    <section aria-label="Hints">
      <p className="label mb-3">Hints</p>
      <div className="flex flex-col">
        {hints.slice(0, shown).map((h, i) => (
          <div key={i} className="rise border-t border-hair py-4 first:border-t-0">
            <p className="label mb-2 text-ink">
              {i + 1}. {h.title}
            </p>
            <div className="[&_li]:relative [&_li]:pl-5 [&_li]:before:absolute [&_li]:before:left-1 [&_li]:before:top-3 [&_li]:before:size-1 [&_li]:before:bg-ink">{h.body}</div>
          </div>
        ))}
      </div>
      {shown < hints.length ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setShown(shown + 1)}>
          {shown === 0 ? 'Give me a hint' : 'Another hint'} ({shown}/{hints.length})
        </Button>
      ) : (
        <p className="label mt-2">That is every hint. The approach tab has the walk-through.</p>
      )}
    </section>
  )
}

function ApproachTab({ problem, patterns }: { problem: Problem; patterns: Pattern[] }) {
  const [reveal, setReveal] = useState(false)
  const p = patterns[0]
  const scene = p ? sceneForPattern(p.key) : undefined
  return (
    <div className="flex flex-col gap-10 py-6">
      {p ? (
        <section>
          <p className="label mb-2">Pattern</p>
          <h3 className="mb-3">
            <a href={`#/pattern/${p.key}`} className="no-underline hover:text-brand">
              {pixelText(p.name)}
            </a>
          </h3>
          <p>{pixelText(p.essence)}</p>
          <p className="label mt-4">{pixelText(p.complexity)}</p>
        </section>
      ) : (
        <p className="text-ink-2">No pattern is mapped to this problem yet.</p>
      )}
      {scene && (
        <section>
          <p className="label mb-1">Walk-through</p>
          <VizPlayer key={scene.id} scene={scene} compact />
        </section>
      )}
      {p?.template && (
        <section>
          <p className="label mb-3">Template</p>
          <pre className="notch overflow-x-auto border border-hair-strong bg-surface p-4 text-[16px] leading-6">{p.template}</pre>
        </section>
      )}
      {problem.reference_solution && (
        <section>
          <p className="label mb-3">Reference solution</p>
          {reveal ? (
            <pre className="notch rise overflow-x-auto border-2 border-ink bg-surface p-4 text-[16px] leading-6">{problem.reference_solution}</pre>
          ) : (
            <Button variant="outline" onClick={() => setReveal(true)}>
              Reveal solution
            </Button>
          )}
        </section>
      )}
    </div>
  )
}

function ProblemsPicker({ open, onOpenChange, currentId }: { open: boolean; onOpenChange: (o: boolean) => void; currentId: string }) {
  const m = useModel()
  const problems = useAppSelector((s) => s.progress.problems)
  const areaKey = m.areaKeyOf(currentId) ?? 'dsa'
  const drills = m.drillsForArea(areaKey)
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Problems" description="Jump to a problem">
      <CommandInput placeholder="Jump to a problem..." />
      <CommandList>
        <CommandEmpty>No match.</CommandEmpty>
        <CommandGroup heading={`${drills.length} problems`}>
          {drills.map((d, i) => (
            <CommandItem
              key={d.id}
              value={`${i + 1} ${d.title} ${d.topic}`}
              onSelect={() => {
                window.location.hash = `/drill/${d.id}`
                onOpenChange(false)
              }}
            >
              <StatusDot status={problems[d.id]?.status ?? 'none'} />
              <span className="label num w-10">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{pixelText(d.title)}</span>
              <Difficulty value={d.difficulty} />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

function ProblemView({ drill, problem }: { drill: Drill; problem: Problem }) {
  const m = useModel()
  const dispatch = useAppDispatch()
  const savedCode = useAppSelector((s) => s.progress.problems[problem.id]?.code)
  const [code, setCode] = useState(() => savedCode ?? problem.starter_code)
  const [state, setState] = useState<JudgeState>(validator.state)
  const [outcome, setOutcome] = useState<ValidateOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState(false)
  const [split, setSplit] = useState(() => Number(localStorage.getItem('prep.split')) || 46)
  const timer = useStopwatch(problem.id)
  const host = useRef<HTMLDivElement>(null)

  const areaKey = m.areaKeyOf(drill.id) ?? 'dsa'
  const list = m.drillsForArea(areaKey)
  const idx = list.findIndex((d) => d.id === drill.id)
  const prev = idx > 0 ? list[idx - 1] : null
  const next = idx < list.length - 1 ? list[idx + 1] : null
  const patterns = m.patternsForProblem(drill.id)
  const similar = m.relatedProblems(drill.id, 8)

  useEffect(() => {
    validator.onState = setState
    validator.start()
    setState(validator.state)
  }, [])

  const check = useCallback(async () => {
    setBusy(true)
    setOutcome(null)
    dispatch(setProblemCode({ id: problem.id, code }))
    setOutcome(await validator.validate(code, problem.signature?.name))
    setBusy(false)
  }, [code, dispatch, problem.id, problem.signature?.name])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && state === 'ready' && !busy) {
        e.preventDefault()
        void check()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [check, state, busy])

  const reset = () => {
    setCode(problem.starter_code)
    setOutcome(null)
    dispatch(setProblemCode({ id: problem.id, code: problem.starter_code }))
  }

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    const el = host.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const move = (ev: PointerEvent) => setSplit(Math.max(28, Math.min(70, ((ev.clientX - rect.left) / rect.width) * 100)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setSplit((s) => {
        localStorage.setItem('prep.split', String(Math.round(s)))
        return s
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const nav = (d: Drill | null, label: string) =>
    d ? (
      <a href={`#/drill/${d.id}`} className="tool no-underline" aria-label={`${label}: ${d.title}`} title={`${label}: ${d.title}`}>
        {label}
      </a>
    ) : (
      <span className="tool opacity-30" aria-hidden="true">
        {label}
      </span>
    )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-hair px-6 py-2">
        <button type="button" className="label inline-flex items-center gap-2 hover:text-brand" onClick={() => setPicker(true)}>
          Problems
        </button>
        <span className="flex">
          {nav(prev, 'Previous')}
          {nav(next, 'Next')}
        </span>
        <span className="label num">{idx + 1}</span>
        <h1 className="min-w-[14rem] flex-1 truncate !text-[24px]">{pixelText(drill.title)}</h1>
        <Difficulty value={drill.difficulty} />
        <button
          type="button"
          onClick={timer.toggle}
          className={cn('label num inline-flex items-center gap-1 hover:text-brand', timer.running && 'text-ink')}
          aria-label={timer.running ? 'Pause timer' : 'Resume timer'}
        >
          {fmt(timer.sec)}
          <span className="opacity-70">{timer.running ? 'pause' : 'resume'}</span>
        </button>
        <ProblemStatusBar id={problem.id} />
        <ExternalLink href={problem.link}>LeetCode</ExternalLink>
      </div>

      {/* panes */}
      <div ref={host} className="flex min-h-0 flex-1 max-lg:flex-col">
        <div className="min-h-0 overflow-y-auto px-6 pb-16 pt-4 max-lg:max-h-[55%]" style={{ width: `${split}%` }}>
          <Tabs defaultValue="description">
            <TabsList>
              <TabsTrigger value="description">Description</TabsTrigger>
              <TabsTrigger value="approach">Approach</TabsTrigger>
              <TabsTrigger value="similar">Similar {similar.length > 0 && <span className="num">{similar.length}</span>}</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>
            <TabsContent value="description" className="pt-2">
              <div className="flex flex-col gap-8 py-4">
                <Markdown body={problem.description_md} scope={`p-${problem.id}`} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip !border-0 !pl-0">{drill.topic}</span>
                  <PatternChips problemId={drill.id} />
                </div>
                <HintLadder topic={drill.topic} patterns={patterns} />
              </div>
            </TabsContent>
            <TabsContent value="approach">
              <ApproachTab problem={problem} patterns={patterns} />
            </TabsContent>
            <TabsContent value="similar" className="pt-4">
              <div className="list">
                {similar.map((sid) => {
                  const d = m.drillById(sid)
                  return d ? <SimilarRow key={sid} d={d} /> : null
                })}
                {similar.length === 0 && <p className="px-4 py-6 text-ink-2">No similar problems mapped.</p>}
              </div>
            </TabsContent>
            <TabsContent value="notes" className="pt-6">
              <ProblemNotes id={problem.id} />
            </TabsContent>
          </Tabs>
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
          tabIndex={0}
          onPointerDown={startDrag}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setSplit((s) => Math.max(28, s - 2))
            if (e.key === 'ArrowRight') setSplit((s) => Math.min(70, s + 2))
          }}
          className="group relative hidden w-3 shrink-0 cursor-col-resize lg:block"
        >
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hair-strong group-hover:w-[3px] group-hover:bg-brand" />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-hair pt-0 lg:border-l-0">
          <div className="flex h-11 shrink-0 items-center gap-3 border-b border-hair px-4">
            <span className="label text-ink">Python 3</span>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={reset}>
              Reset
            </Button>
            <Button size="sm" onClick={check} disabled={busy || state !== 'ready'}>
              {busy ? 'Checking' : state === 'booting' ? 'Loading Python' : state === 'failed' ? 'Python failed' : 'Check syntax'}
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <Editor key={problem.id} initial={code} onChange={setCode} />
          </div>
          <div className="h-36 shrink-0 overflow-y-auto border-t-2 border-ink px-5 py-3" aria-live="polite">
            <p className="label mb-1 text-ink">Console</p>
            {outcome ? (
              <p className={cn(outcome.status === 'ok' ? 'text-ink' : 'text-brand')}>
                {outcome.status === 'ok' ? outcome.message : outcome.status === 'timeout' ? 'Timed out. The runtime restarted.' : outcome.message}
              </p>
            ) : (
              <p className="text-ink-2">Check syntax runs your code through Python's parser (CMD + Enter). Judge correctness on LeetCode.</p>
            )}
          </div>
        </div>
      </div>
      <ProblemsPicker open={picker} onOpenChange={setPicker} currentId={drill.id} />
    </div>
  )
}

function SimilarRow({ d }: { d: Drill }) {
  const status = useAppSelector((s) => s.progress.problems[d.id]?.status ?? 'none')
  return (
    <a href={`#/drill/${d.id}`} className="row no-underline">
      <StatusDot status={status} />
      <span className="min-w-0 flex-1 truncate">{pixelText(d.title)}</span>
      <Difficulty value={d.difficulty} />
    </a>
  )
}

/** A discussion drill: a prompt to answer out loud, lessons that prepare for it, then the worked answer. */
function DrillView({ drill }: { drill: Drill }) {
  const m = useModel()
  const prep = useMemo(() => {
    const out: { courseKey: string; lessonId: string; title: string }[] = []
    for (const c of m.courses)
      for (const ch of c.chapters) if (ch.problemIds?.includes(drill.id)) for (const l of ch.lessons) out.push({ courseKey: c.key, lessonId: l.id, title: l.title })
    return out
  }, [m.courses, drill.id])
  return (
    <div className="prose-col flex flex-col gap-10 pt-2">
      <p className="notch whitespace-pre-wrap border-2 border-ink bg-surface px-7 py-6 text-[16px] leading-7">{pixelText(drill.prompt)}</p>
      <ProblemStatusBar id={drill.id} />
      {prep.length > 0 && (
        <section>
          <p className="label mb-2">Read first</p>
          <div className="list">
            {prep.map((l) => (
              <a key={l.lessonId} className="row no-underline" href={`#/study/${l.courseKey}/${l.lessonId}`}>
                <span className="bullet" />
                <span className="min-w-0 flex-1 truncate">{pixelText(l.title)}</span>
              </a>
            ))}
          </div>
        </section>
      )}
      <section>
        <p className="label mb-2">Your answer</p>
        <ProblemNotes id={drill.id} />
      </section>
      {drill.solution && (
        <Accordion type="single" collapsible className="border-y-2 border-ink">
          <AccordionItem value="sol" className="border-b-0">
            <AccordionTrigger>Show solution</AccordionTrigger>
            <AccordionContent className="pt-4">
              <Markdown body={drill.solution} scope={`d-${drill.id}`} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
      {drill.link && (
        <div>
          <ExternalLink href={drill.link}>Reference</ExternalLink>
        </div>
      )}
    </div>
  )
}

export function DrillPage({ id }: { id: string }) {
  const m = useModel()
  const drill = m.drillById(id)
  const areaKey = m.areaKeyOf(id)
  if (!drill) return <NotFound />
  const problem = m.packs[id]
  if (problem) return <ProblemView key={id} drill={drill} problem={problem} />

  const back = areaKey === 'dsa' ? { href: '#/dsa', label: 'DSA' } : areaKey ? { href: `#/study/${areaKey}`, label: 'Course' } : { href: '#/', label: 'Overview' }
  const similar = m.relatedProblems(id, 6)
  return (
    <div className="h-full overflow-y-auto px-8 pb-24 pt-2 sm:px-12">
      <BackLink href={back.href}>{back.label}</BackLink>
      <div className="mb-8 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <h1>{pixelText(drill.title)}</h1>
        <Difficulty value={drill.difficulty} />
      </div>
      <div className="mb-8">
        <PatternChips problemId={id} />
      </div>
      <DrillView drill={drill} />
      {similar.length > 0 && (
        <section className="mt-14 max-w-3xl">
          <h2>Similar problems</h2>
          <div className="list mt-4">
            {similar.map((sid) => {
              const d = m.drillById(sid)
              return d ? <SimilarRow key={sid} d={d} /> : null
            })}
          </div>
        </section>
      )}
    </div>
  )
}
