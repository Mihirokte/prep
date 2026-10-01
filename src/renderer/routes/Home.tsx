import { useMemo, useRef } from 'react'
import { Download, Upload } from 'lucide-react'
import { exportProgress, readProgressFile } from '../storage'
import { importAll } from '../store/progressSlice'
import { useAppDispatch, useAppSelector } from '../store'
import { useModel } from '../model/context'
import { Bar } from '../components/ui'
import { Button } from '../ui/button'

export default function Home() {
  const m = useModel()
  const progress = useAppSelector((s) => s.progress)
  const dispatch = useAppDispatch()
  const fileRef = useRef<HTMLInputElement>(null)

  // Only the sequenced study areas carry a step number; Patterns and Company
  // Research are reference lenses over the same material, not steps in the path.
  const sequenceNumber = useMemo(
    () =>
      new Map(
        m.homeAreas.filter((a) => a.kind === 'problems' || a.kind === 'study').map((a, i) => [a.key, i + 1]),
      ),
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

  return (
    <div className="max-w-3xl pt-6">
      <nav className="list panel" aria-label="Areas">
        {m.homeAreas.map((a) => {
          const s = stat(a.key, a.kind)
          const seq = sequenceNumber.get(a.key)
          return (
            <a
              key={a.key}
              href={a.href}
              className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-4 no-underline text-foreground transition-colors hover:bg-muted first:rounded-t-lg last:rounded-b-lg"
            >
              <span className="num text-[0.8125rem] text-faint" aria-hidden="true">
                {seq ? String(seq).padStart(2, '0') : ''}
              </span>
              <h2 className="text-[1.0625rem] font-medium">{a.label}</h2>
              <span className="num text-[0.9375rem] text-muted-foreground tabular-nums">{s.count}</span>
              {s.pct >= 0 && (
                <Bar value={s.pct} label={`${a.label} progress`} className="col-start-2 col-span-2 mt-3 h-[3px]" />
              )}
            </a>
          )
        })}
      </nav>

      <div className="mt-8 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => exportProgress(progress)}>
          <Download aria-hidden="true" />
          Export
        </Button>
        <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload aria-hidden="true" />
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
