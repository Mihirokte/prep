import { useAppDispatch, useAppSelector } from '../store'
import { setProblemNotes, setProblemStatus, setLessonNotes, type ProblemStatus } from '../store/progressSlice'
import { useModel } from '../model/context'
import type { Drill } from '../types'
import { Progress } from '../ui/progress'
import { Textarea } from '../ui/textarea'
import { cn } from '../lib/utils'
import { pixelText } from './pixelText'

// ---- progress ----
export function Bar({ value, label, className }: { value: number; label?: string; className?: string }) {
  return <Progress value={value} aria-label={label ?? 'progress'} className={cn('h-2', className)} />
}

// ---- status mark: a word, never colour alone ----
const STATUS: Record<string, string> = {
  none: 'not started',
  unread: 'not read',
  attempted: 'attempted',
  solved: 'solved',
  read: 'read',
  revisit: 'revisit',
}

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const text = STATUS[status] ?? STATUS.none
  const quiet = status === 'none' || status === 'unread'
  // A fixed slot so rows line up; the default state stays unmarked on screen.
  return (
    <span className={cn('label inline-block w-24 shrink-0 whitespace-nowrap', !quiet && '!text-ink', className)}>
      {quiet ? <span className="sr-only">{text}</span> : text}
    </span>
  )
}

// ---- problem status chips ----
const PSTATUS: ProblemStatus[] = ['attempted', 'solved', 'revisit']

export function ProblemStatusBar({ id }: { id: string }) {
  const cur = useAppSelector((s) => s.progress.problems[id]?.status ?? 'none')
  const dispatch = useAppDispatch()
  return (
    <div role="group" aria-label="Your status on this problem" className="flex flex-wrap gap-2">
      {PSTATUS.map((s) => (
        <button
          key={s}
          type="button"
          className="chip !h-9"
          aria-pressed={cur === s}
          onClick={() => dispatch(setProblemStatus({ id, status: cur === s ? 'none' : s }))}
        >
          {s}
        </button>
      ))}
    </div>
  )
}

const NOTES = 'min-h-24 resize-y'

export function ProblemNotes({ id }: { id: string }) {
  const notes = useAppSelector((s) => s.progress.problems[id]?.notes)
  const dispatch = useAppDispatch()
  return (
    <>
      <label className="sr-only" htmlFor={`notes-${id}`}>
        Your notes on this problem
      </label>
      <Textarea id={`notes-${id}`} placeholder="Notes..." defaultValue={notes ?? ''} className={NOTES} onBlur={(e) => dispatch(setProblemNotes({ id, notes: e.target.value }))} />
    </>
  )
}

export function LessonNotes({ id, initial }: { id: string; initial?: string }) {
  const dispatch = useAppDispatch()
  return (
    <>
      <label className="sr-only" htmlFor={`lnotes-${id}`}>
        Your notes on this lesson
      </label>
      <Textarea id={`lnotes-${id}`} placeholder="Notes..." defaultValue={initial ?? ''} className={NOTES} onBlur={(e) => dispatch(setLessonNotes({ id, notes: e.target.value }))} />
    </>
  )
}

// ---- difficulty: a word and a count of squares ----
const LEVEL: Record<string, number> = { easy: 1, 'easy-medium': 2, medium: 2, 'medium-hard': 3, hard: 3 }

export function Difficulty({ value, className }: { value: string; className?: string }) {
  const n = LEVEL[value.toLowerCase()] ?? 2
  return (
    <span className={cn('label inline-flex items-center gap-2 whitespace-nowrap', className)}>
      <span className="inline-flex gap-[3px]" aria-hidden="true">
        {[1, 2, 3].map((k) => (
          <span key={k} className={cn('size-[6px] border border-ink-2', k <= n && 'bg-ink-2')} />
        ))}
      </span>
      {value}
    </span>
  )
}

// ---- rows ----
export function ProblemRow({ drill }: { drill: Drill }) {
  const runnable = useModel().isRunnable(drill.id)
  const status = useAppSelector((s) => s.progress.problems[drill.id]?.status ?? 'none')
  return (
    <a className="row" href={`#/drill/${drill.id}`}>
      <StatusDot status={status} />
      <span className="min-w-0 flex-1 truncate">{pixelText(drill.title)}</span>
      {runnable && <span className="sr-only">editor</span>}
      <Difficulty value={drill.difficulty} className="w-32 justify-end" />
      <span className="label hidden w-40 shrink-0 truncate text-right sm:block">{drill.topic}</span>
    </a>
  )
}

export function LessonRow({ courseKey, lessonId, title, minutes }: { courseKey: string; lessonId: string; title: string; minutes: number }) {
  const read = useAppSelector((s) => s.progress.lessons[lessonId]?.status === 'read')
  return (
    <a className="row" href={`#/study/${courseKey}/${lessonId}`}>
      <StatusDot status={read ? 'read' : 'unread'} />
      <span className="min-w-0 flex-1 truncate">{pixelText(title)}</span>
      <span className="label num">{minutes} min</span>
    </a>
  )
}
