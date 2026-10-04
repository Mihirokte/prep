import { useMemo, useRef } from 'react'
import { exportProgress, readProgressFile } from '../storage'
import { importAll } from '../store/progressSlice'
import { useAppDispatch, useAppSelector } from '../store'
import { useModel } from '../model/context'
import { Bar } from '../components/ui'
import { Button } from '../ui/button'
import { pixelText } from '../components/pixelText'
import { dueCards } from './Review'

const DAY = 86400000

/** Last 14 weeks of activity, one cell per day: anything touched counts. */
function useActivity() {
  const progress = useAppSelector((s) => s.progress)
  return useMemo(() => {
    const counts = new Map<string, number>()
    const bump = (iso?: string) => {
      if (!iso) return
      const k = iso.slice(0, 10)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    Object.values(progress.lessons).forEach((l) => bump(l.updatedAt))
    Object.values(progress.problems).forEach((p) => bump(p.updatedAt))
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weeks = 14
    const start = new Date(today.getTime() - ((weeks - 1) * 7 + today.getDay()) * DAY)
    const days = Array.from({ length: weeks * 7 }, (_, i) => {
      const d = new Date(start.getTime() + i * DAY)
      const key = d.toISOString().slice(0, 10)
      return { key, n: d > today ? -1 : (counts.get(key) ?? 0) }
    })
    return { days }
  }, [progress])
}

export default function Home() {
  const m = useModel()
  const progress = useAppSelector((s) => s.progress)
  const dispatch = useAppDispatch()
  const fileRef = useRef<HTMLInputElement>(null)
  const activity = useActivity()
  const queue = useMemo(() => dueCards(m, progress.recall ?? {}), [m, progress.recall])
  const due = queue.filter((c) => progress.recall?.[c.id]).length
  const fresh = queue.length - due

  // Only the sequenced study areas carry a step number; Patterns and Company
  // Research are reference lenses over the same material, not steps in the path.
  const sequenceNumber = useMemo(
    () => new Map(m.homeAreas.filter((a) => a.kind === 'problems' || a.kind === 'study').map((a, i) => [a.key, i + 1])),
    [m.homeAreas],
  )

  const stat = (key: string, kind: string) => {
    if (kind === 'patterns') return { count: `${m.patterns.length}`, pct: -1 }
    if (kind === 'companies') return { count: `${m.companies.length}`, pct: -1 }
    if (kind === 'problems') {
      const drills = m.areas.find((a) => a.key === key)?.drills ?? []
      const solved = drills.filter((d) => progress.problems[d.id]?.status === 'solved').length
      return { count: `${solved}/${drills.length}`, pct: drills.length ? Math.round((solved / drills.length) * 100) : 0 }
    }
    const course = m.findCourse(key)
    const total = course?.chapters.reduce((n, ch) => n + ch.lessons.length, 0) ?? 0
    const read = course?.chapters.reduce((n, ch) => n + ch.lessons.filter((l) => progress.lessons[l.id]?.status === 'read').length, 0) ?? 0
    return { count: `${read}/${total}`, pct: total ? Math.round((read / total) * 100) : 0 }
  }

  // Where to pick up: first unread lesson (course order), first unsolved DSA problem.
  const nextLesson = useMemo(() => {
    for (const c of m.courses)
      for (const ch of c.chapters)
        for (const l of ch.lessons) if (progress.lessons[l.id]?.status !== 'read') return { course: c, lesson: l }
    return null
  }, [m.courses, progress.lessons])
  const nextProblem = useMemo(() => {
    const dsa = m.areas.find((a) => a.key === 'dsa')
    return dsa?.drills.find((d) => (progress.problems[d.id]?.status ?? 'none') !== 'solved') ?? null
  }, [m.areas, progress.problems])

  const study = m.homeAreas.filter((a) => a.kind === 'problems' || a.kind === 'study')
  const reference = m.homeAreas.filter((a) => a.kind !== 'problems' && a.kind !== 'study')
  const unit = (kind: string) => (kind === 'problems' ? 'solved' : 'read')

  // Hierarchy: title (L), then what to do next (M, the focal point), then the
  // progress ledger and reference lenses (S). Labels sit 8px above their list.
  return (
    <div className="mx-auto max-w-3xl pt-10">
      <h1>Overview</h1>

      <section aria-label="Continue" className="mt-10">
        <p className="label mb-2">Continue</p>
        <div className="list">
          {nextLesson && (
            <a className="row !min-h-[72px] py-4" href={`#/study/${nextLesson.course.key}/${nextLesson.lesson.id}`}>
              <span className="bullet" />
              <span className="min-w-0 flex-1 truncate font-display text-[24px] leading-[1.15]">{pixelText(nextLesson.lesson.title)}</span>
              <span className="label">{nextLesson.course.label}</span>
            </a>
          )}
          {nextProblem && (
            <a className="row !min-h-[72px] py-4" href={`#/drill/${nextProblem.id}`}>
              <span className="bullet" />
              <span className="min-w-0 flex-1 truncate font-display text-[24px] leading-[1.15]">{pixelText(nextProblem.title)}</span>
              <span className="label">DSA</span>
            </a>
          )}
          <a className="row !min-h-[72px] py-4" href="#/review">
            <span className={due > 0 ? 'live-dot' : 'bullet'} />
            <span className="min-w-0 flex-1 font-display text-[24px] leading-[1.15]">Review</span>
            <span className="label num">
              {due} due, {fresh} new
            </span>
          </a>
        </div>
      </section>

      <section aria-label="Progress" className="mt-14">
        <p className="label mb-2">Progress</p>
        <nav className="list" aria-label="Areas">
          {study.map((a) => {
            const s = stat(a.key, a.kind)
            const seq = sequenceNumber.get(a.key)
            return (
              <a key={a.key} href={a.href} className="row grid grid-cols-[24px_minmax(0,1fr)_minmax(0,200px)_136px] gap-x-4 no-underline">
                <span className="label num" aria-hidden="true">
                  {seq ? String(seq).padStart(2, '0') : ''}
                </span>
                <span className="min-w-0 truncate">{a.label}</span>
                <Bar value={s.pct} label={`${a.label} progress`} className="!h-[6px]" />
                <span className="label num whitespace-nowrap text-right">
                  {s.count} {unit(a.kind)}
                </span>
              </a>
            )
          })}
        </nav>
      </section>

      {reference.length > 0 && (
        <section aria-label="Reference" className="mt-14">
          <p className="label mb-2">Reference</p>
          <nav className="list" aria-label="Reference">
            {reference.map((a) => {
              const s = stat(a.key, a.kind)
              return (
                <a key={a.key} href={a.href} className="row grid grid-cols-[24px_minmax(0,1fr)_auto] gap-x-4 no-underline">
                  <span className="bullet" />
                  <span className="min-w-0 truncate">{a.label}</span>
                  <span className="label num text-right">
                    {s.count} {a.kind === 'patterns' ? 'patterns' : Number(s.count) === 1 ? 'company' : 'companies'}
                  </span>
                </a>
              )
            })}
          </nav>
        </section>
      )}

      <section aria-label="Activity" className="mt-14">
        <p className="label mb-2">Activity, last 14 weeks</p>
        <div
          className="grid grid-flow-col gap-1"
          style={{ gridTemplateRows: 'repeat(7, 12px)', gridAutoColumns: '12px' }}
          role="img"
          aria-label="Activity grid"
        >
          {activity.days.map((d) => (
            <span
              key={d.key}
              title={d.n >= 0 ? `${d.key}: ${d.n}` : undefined}
              className={d.n < 0 ? 'invisible' : d.n === 0 ? 'border border-hair-strong' : 'border border-ink'}
              style={{
                background: d.n > 2 ? 'var(--ink)' : d.n > 0 ? 'color-mix(in srgb, var(--ink) 45%, transparent)' : 'transparent',
              }}
            />
          ))}
        </div>
      </section>

      <div className="mt-14 flex flex-wrap gap-4 border-t border-hair pt-6">
        <Button variant="secondary" size="sm" onClick={() => exportProgress(progress)}>
          Export
        </Button>
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) readProgressFile(f).then((p) => dispatch(importAll(p)))
          }}
        />
      </div>
    </div>
  )
}
