import { Circle, CircleCheck, CircleDashed, RotateCcw } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../store'
import {
  setProblemNotes,
  setProblemStatus,
  setLessonNotes,
  type ProblemStatus,
} from '../store/progressSlice'
import { useModel } from '../model/context'
import type { Drill } from '../types'
import { Progress } from '../ui/progress'
import { Textarea } from '../ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { cn } from '../lib/utils'

// ---- progress ----
export function Bar({ value, label, className }: { value: number; label?: string; className?: string }) {
  return <Progress value={value} aria-label={label ?? 'progress'} className={cn('h-1', className)} />
}

// ---- status mark: a drawn icon plus text, never colour alone ----
const STATUS_TEXT: Record<string, string> = {
  none: 'not started',
  attempted: 'attempted',
  solved: 'solved',
  revisit: 'revisit',
  read: 'read',
  unread: 'not read',
}

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const cls = cn('size-4 shrink-0', className)
  let icon = <Circle aria-hidden="true" className={cn(cls, 'text-faint/70')} strokeWidth={1.5} />
  if (status === 'attempted') icon = <CircleDashed aria-hidden="true" className={cn(cls, 'text-muted-foreground')} />
  if (status === 'solved' || status === 'read') icon = <CircleCheck aria-hidden="true" className={cn(cls, 'text-brand')} />
  if (status === 'revisit') icon = <RotateCcw aria-hidden="true" className={cn(cls, 'text-brand')} />
  return (
    <>
      {icon}
      <span className="sr-only">{STATUS_TEXT[status] ?? status}</span>
    </>
  )
}

// ---- problem status toggle group ----
const PSTATUS: ProblemStatus[] = ['attempted', 'solved', 'revisit']

export function ProblemStatusBar({ id }: { id: string }) {
  const cur = useAppSelector((s) => s.progress.problems[id]?.status ?? 'none')
  const dispatch = useAppDispatch()
  return (
    <ToggleGroup
      type="single"
      value={cur === 'none' ? '' : cur}
      onValueChange={(v) =>
        dispatch(setProblemStatus({ id, status: (v || 'none') as ProblemStatus }))
      }
      variant="outline"
      aria-label="Your status on this problem"
      className="rounded-md"
    >
      {PSTATUS.map((s) => (
        <ToggleGroupItem
          key={s}
          value={s}
          className="h-9 px-4 text-[0.8125rem] capitalize data-[state=on]:bg-brand/15 data-[state=on]:text-brand data-[state=on]:border-brand/40"
        >
          {s}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

const NOTES = 'min-h-24 resize-y bg-card px-4 py-3 text-[0.9375rem] leading-relaxed md:text-[0.9375rem] shadow-[var(--shadow-panel)]'

export function ProblemNotes({ id }: { id: string }) {
  const notes = useAppSelector((s) => s.progress.problems[id]?.notes)
  const dispatch = useAppDispatch()
  return (
    <>
      <label className="sr-only" htmlFor={`notes-${id}`}>
        Your notes on this problem
      </label>
      <Textarea
        id={`notes-${id}`}
        placeholder="Notes…"
        defaultValue={notes ?? ''}
        className={NOTES}
        onBlur={(e) => dispatch(setProblemNotes({ id, notes: e.target.value }))}
      />
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
      <Textarea
        id={`lnotes-${id}`}
        placeholder="Notes…"
        defaultValue={initial ?? ''}
        className={NOTES}
        onBlur={(e) => dispatch(setLessonNotes({ id, notes: e.target.value }))}
      />
    </>
  )
}

// ---- rows ----
export function Difficulty({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('w-16 shrink-0 text-right text-[0.75rem] font-medium capitalize text-faint', className)}>
      {value}
    </span>
  )
}

export function ProblemRow({ drill }: { drill: Drill }) {
  const runnable = useModel().isRunnable(drill.id)
  const status = useAppSelector((s) => s.progress.problems[drill.id]?.status ?? 'none')
  return (
    <a className="row" href={`#/drill/${drill.id}`}>
      <StatusDot status={status} />
      <span className="flex-1 min-w-0 truncate text-[0.9375rem]">{drill.title}</span>
      {runnable && <span className="sr-only">editor</span>}
      <Difficulty value={drill.difficulty} />
      <span className="hidden sm:block w-36 shrink-0 truncate text-right text-[0.8125rem] text-faint">{drill.topic}</span>
    </a>
  )
}

export function LessonRow({
  courseKey,
  lessonId,
  title,
  minutes,
}: {
  courseKey: string
  lessonId: string
  title: string
  minutes: number
}) {
  const read = useAppSelector((s) => s.progress.lessons[lessonId]?.status === 'read')
  return (
    <a className="row" href={`#/study/${courseKey}/${lessonId}`}>
      <StatusDot status={read ? 'read' : 'unread'} />
      <span className="flex-1 min-w-0 truncate text-[0.9375rem]">{title}</span>
      <span className="num text-[0.8125rem] text-faint">{minutes} min</span>
    </a>
  )
}
