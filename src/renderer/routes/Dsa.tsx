import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useModel } from '../model/context'
import { useAppSelector } from '../store'
import { StatusDot } from '../components/ui'
import { NotFound } from '../components/nav'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Progress } from '../ui/progress'
import { cn } from '../lib/utils'
import type { Drill } from '../types'
import type { Pattern } from '../../shared/types'

// The DSA list, grouped by pattern: learn one pattern, then solve its problems.
// A problem that uses two patterns appears under both. Filters narrow every
// group at once and survive opening a problem.

interface Filters {
  q: string
  diff: string
  status: string
}
const KEY = 'prep.dsa.filters'
const DEFAULT: Filters = { q: '', diff: 'all', status: 'all' }

const loadFilters = (): Filters => {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Partial<Filters>
    return { q: raw.q ?? '', diff: raw.diff ?? 'all', status: raw.status ?? 'all' }
  } catch {
    return DEFAULT
  }
}

function dayIndex(n: number): number {
  const d = new Date()
  return (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % Math.max(n, 1)
}

const ROW = 'grid items-center gap-4 grid-cols-[minmax(0,1fr)_72px_88px]'

interface Group {
  key: string
  pattern: Pattern | null
  drills: Drill[]
}

export function DsaList() {
  const m = useModel()
  const area = m.areas.find((a) => a.key === 'dsa')
  const problems = useAppSelector((s) => s.progress.problems)
  const [f, setF] = useState<Filters>(loadFilters)
  const query = useDeferredValue(f.q.trim().toLowerCase())
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => sessionStorage.setItem(KEY, JSON.stringify(f)), [f])

  // `/` jumps to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(t.tagName) && !t.closest('.cm-editor')) {
        e.preventDefault()
        search.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const groups = useMemo<Group[]>(() => {
    if (!area) return []
    const byId = new Map(area.drills.map((d) => [d.id, d]))
    const placed = new Set<string>()
    const out: Group[] = []
    for (const p of m.patterns) {
      const drills = p.problemIds.map((id) => byId.get(id)).filter((d): d is Drill => Boolean(d))
      if (!drills.length) continue
      drills.forEach((d) => placed.add(d.id))
      out.push({ key: p.key, pattern: p, drills })
    }
    const rest = area.drills.filter((d) => !placed.has(d.id))
    if (rest.length) out.push({ key: 'other', pattern: null, drills: rest })
    return out
  }, [area, m.patterns])

  if (!area) return <NotFound />
  const statusOf = (id: string) => problems[id]?.status ?? 'none'
  const all = area.drills
  const solved = all.filter((d) => statusOf(d.id) === 'solved').length
  const attempted = all.filter((d) => ['attempted', 'revisit'].includes(statusOf(d.id))).length
  const levels = ['easy', 'medium', 'hard'].map((lv) => {
    const list = all.filter((d) => d.difficulty.toLowerCase() === lv)
    return { lv, solved: list.filter((d) => statusOf(d.id) === 'solved').length, total: list.length }
  })

  const keep = (d: Drill, g: Group) => {
    if (f.diff !== 'all' && d.difficulty.toLowerCase() !== f.diff) return false
    if (f.status !== 'all' && statusOf(d.id) !== f.status) return false
    if (query && !`${d.title} ${d.topic} ${g.pattern?.name ?? ''}`.toLowerCase().includes(query)) return false
    return true
  }
  const shown = groups.map((g) => ({ ...g, rows: g.drills.filter((d) => keep(d, g)) })).filter((g) => g.rows.length)
  const shownCount = new Set(shown.flatMap((g) => g.rows.map((d) => d.id))).size

  const unsolved = all.filter((d) => statusOf(d.id) !== 'solved')
  const today: Drill | undefined = unsolved[dayIndex(unsolved.length)]
  const go = (d?: Drill) => d && (window.location.hash = `/drill/${d.id}`)
  const set = (p: Partial<Filters>) => setF((x) => ({ ...x, ...p }))
  const dirty = f.q || f.diff !== 'all' || f.status !== 'all'

  return (
    <div className="pt-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1>DSA</h1>
          <p className="label mt-2">
            {groups.filter((g) => g.pattern).length} patterns, {all.length} problems. Learn a pattern, then solve its problems.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => go(unsolved[Math.floor(Math.random() * unsolved.length)])} disabled={unsolved.length === 0}>
            Pick one
          </Button>
          <Button onClick={() => go(today)} disabled={!today}>
            Today
          </Button>
        </div>
      </div>

      <section className="panel-quiet mt-8 grid items-center gap-x-10 gap-y-4 p-5 md:grid-cols-[160px_1fr]" aria-label="Progress">
        <div>
          <p className="label">Solved</p>
          <p className="num text-[20px] font-semibold">
            {solved}/{all.length}
          </p>
          <p className="label">{attempted} in progress</p>
        </div>
        <div className="grid gap-2">
          {levels.map((c) => (
            <div key={c.lv} className="grid grid-cols-[72px_1fr_64px] items-center gap-4">
              <span className="label capitalize">{c.lv}</span>
              <Progress value={c.total ? (c.solved / c.total) * 100 : 0} aria-label={`${c.lv} solved`} />
              <span className="label num text-right">
                {c.solved}/{c.total}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-4" aria-label="Filters">
        <Input ref={search} placeholder="Search problems or patterns (press /)" value={f.q} onChange={(e) => set({ q: e.target.value })} aria-label="Search problems" />
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex items-center gap-2" role="group" aria-label="Difficulty">
            <span className="label">Level</span>
            {['easy', 'medium', 'hard'].map((d) => (
              <button key={d} type="button" className="chip capitalize" aria-pressed={f.diff === d} onClick={() => set({ diff: f.diff === d ? 'all' : d })}>
                {d}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2" role="group" aria-label="Status">
            <span className="label">Status</span>
            {['none', 'attempted', 'solved', 'revisit'].map((s) => (
              <button key={s} type="button" className="chip capitalize" aria-pressed={f.status === s} onClick={() => set({ status: f.status === s ? 'all' : s })}>
                {s === 'none' ? 'To do' : s}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <span className="label">
            {shownCount} of {all.length}
          </span>
          {dirty && (
            <Button variant="link" size="sm" onClick={() => setF(DEFAULT)}>
              Clear filters
            </Button>
          )}
        </div>
      </section>

      <div className="mt-8 flex flex-col gap-10" aria-label="Problems by pattern">
        {shown.map((g) => {
          const done = g.drills.filter((d) => statusOf(d.id) === 'solved').length
          return (
            <section key={g.key} aria-label={g.pattern?.name ?? 'Other problems'} data-pattern-group={g.key}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h2>{g.pattern ? <a href={`#/pattern/${g.pattern.key}`} className="text-ink no-underline hover:underline">{g.pattern.name}</a> : 'Other problems'}</h2>
                <span className="label num">
                  {done}/{g.drills.length} solved
                </span>
              </div>
              {g.pattern && <p className="mb-4 text-ink-2">{g.pattern.essence}</p>}
              <div className="list" role="table" aria-label={`${g.pattern?.name ?? 'Other'} problems`}>
                {g.rows.map((d) => (
                  <a key={d.id} role="row" href={`#/drill/${d.id}`} className={cn('row', ROW)}>
                    <span role="cell" className="min-w-0 truncate">
                      {d.title}
                    </span>
                    <span role="cell" className="label capitalize">
                      {d.difficulty.toLowerCase()}
                    </span>
                    <span role="cell" className="text-right">
                      <StatusDot status={statusOf(d.id)} className="w-auto capitalize" />
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )
        })}
        {shown.length === 0 && <p className="text-ink-2">No problem matches these filters.</p>}
      </div>
    </div>
  )
}
