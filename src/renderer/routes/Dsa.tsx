import { useEffect, useMemo, useRef, useState } from 'react'
import { useModel } from '../model/context'
import { useAppSelector } from '../store'
import { StatusDot } from '../components/ui'
import { NotFound } from '../components/nav'
import { pixelText } from '../components/pixelText'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Progress } from '../ui/progress'
import { cn } from '../lib/utils'
import type { Drill } from '../types'

// The DSA list, in the manner of a problem-set page: a stats header, filters
// that stay put while you work (they survive opening a problem), a sortable
// table, a daily pick, and a random pick.

type SortKey = 'order' | 'title' | 'difficulty' | 'status'
interface Filters {
  q: string
  diff: string
  status: string
  topic: string
  pattern: string
  sort: SortKey
  dir: 1 | -1
}
const KEY = 'prep.dsa.filters'
const DEFAULT: Filters = { q: '', diff: 'all', status: 'all', topic: 'all', pattern: 'all', sort: 'order', dir: 1 }

const loadFilters = (): Filters => {
  try {
    return { ...DEFAULT, ...(JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Partial<Filters>) }
  } catch {
    return DEFAULT
  }
}

const DIFF_RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2 }
const STATUS_RANK: Record<string, number> = { attempted: 0, revisit: 1, none: 2, solved: 3 }

function dayIndex(n: number): number {
  const d = new Date()
  return (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % Math.max(n, 1)
}

function DiffMark({ value }: { value: string }) {
  const n = (DIFF_RANK[value.toLowerCase()] ?? 1) + 1
  return (
    <span className="label inline-flex items-center gap-2 whitespace-nowrap">
      <span className="inline-flex gap-1" aria-hidden="true">
        {[1, 2, 3].map((k) => (
          <span key={k} className={cn('size-[6px] border border-ink-2', k <= n && 'bg-ink-2')} />
        ))}
      </span>
      {value}
    </span>
  )
}

/** Header and rows share one column template, so every cell sits under its header. */
const COLS = 'grid items-center gap-4 grid-cols-[88px_32px_minmax(0,1fr)_104px] md:grid-cols-[88px_32px_minmax(0,1fr)_minmax(0,232px)_104px]'

export function DsaList() {
  const m = useModel()
  const area = m.areas.find((a) => a.key === 'dsa')
  const problems = useAppSelector((s) => s.progress.problems)
  const [f, setF] = useState<Filters>(loadFilters)
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => sessionStorage.setItem(KEY, JSON.stringify(f)), [f])

  // `/` jumps to search, like a problem-set page.
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

  const rows = useMemo(() => {
    if (!area) return []
    return area.drills.map((d, i) => ({ d, n: i + 1, patterns: m.patternsForProblem(d.id) }))
  }, [area, m])

  if (!area) return <NotFound />
  const statusOf = (id: string) => problems[id]?.status ?? 'none'

  const count = (diff: string) => {
    const all = rows.filter((r) => r.d.difficulty.toLowerCase() === diff)
    return { solved: all.filter((r) => statusOf(r.d.id) === 'solved').length, total: all.length }
  }
  const E = count('easy')
  const M = count('medium')
  const H = count('hard')
  const solved = E.solved + M.solved + H.solved
  const attempted = rows.filter((r) => ['attempted', 'revisit'].includes(statusOf(r.d.id))).length

  const topics = [...rows.reduce((acc, r) => acc.set(r.d.topic, (acc.get(r.d.topic) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])
  const patternList = m.patterns.filter((p) => p.problemIds.some((id) => area.drills.some((d) => d.id === id)))

  const shown = rows
    .filter(({ d, patterns }) => {
      if (f.diff !== 'all' && d.difficulty.toLowerCase() !== f.diff) return false
      if (f.status !== 'all' && statusOf(d.id) !== f.status) return false
      if (f.topic !== 'all' && d.topic !== f.topic) return false
      if (f.pattern !== 'all' && !patterns.some((p) => p.key === f.pattern)) return false
      if (f.q && !(d.title + ' ' + d.topic + ' ' + patterns.map((p) => p.name).join(' ')).toLowerCase().includes(f.q.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      let r = 0
      if (f.sort === 'title') r = a.d.title.localeCompare(b.d.title)
      else if (f.sort === 'difficulty') r = (DIFF_RANK[a.d.difficulty.toLowerCase()] ?? 1) - (DIFF_RANK[b.d.difficulty.toLowerCase()] ?? 1)
      else if (f.sort === 'status') r = STATUS_RANK[statusOf(a.d.id)] - STATUS_RANK[statusOf(b.d.id)]
      else r = a.n - b.n
      return (r || a.n - b.n) * f.dir
    })

  const unsolved = rows.filter((r) => statusOf(r.d.id) !== 'solved')
  const today: Drill | undefined = unsolved[dayIndex(unsolved.length)]?.d
  const go = (d?: Drill) => d && (window.location.hash = `/drill/${d.id}`)
  const pick = () => go(unsolved[Math.floor(Math.random() * unsolved.length)]?.d)
  const set = (p: Partial<Filters>) => setF((x) => ({ ...x, ...p }))
  const dirty = f.q || f.diff !== 'all' || f.status !== 'all' || f.topic !== 'all' || f.pattern !== 'all'

  const head = (key: SortKey, label: string, cls = '') => (
    <button
      type="button"
      className={cn('label inline-flex items-center gap-1 hover:text-brand', f.sort === key && 'text-ink', cls)}
      onClick={() => set(f.sort === key ? { dir: (-f.dir) as 1 | -1 } : { sort: key, dir: 1 })}
      aria-label={`Sort by ${label}`}
    >
      {label}
      {f.sort === key && <span>{f.dir === 1 ? 'asc' : 'desc'}</span>}
    </button>
  )

  return (
    <div className="pt-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h1>DSA</h1>
        {/* One primary action per region: today's pick is filled, the random pick is a frame. */}
        <div className="flex gap-4">
          <Button variant="outline" onClick={pick} disabled={unsolved.length === 0}>
            Pick one
          </Button>
          <Button onClick={() => go(today)} disabled={!today}>
            Today
          </Button>
        </div>
      </div>

      {/* stats: the figure is M, the bars are S; neither competes with the title or the list */}
      <section className="mt-10 grid items-center gap-x-12 gap-y-6 border-y border-hair py-6 md:grid-cols-[176px_1fr]" aria-label="Progress">
        <div className="flex flex-col gap-1">
          <p className="label">Solved</p>
          <p className="num font-display text-[24px] leading-none">
            {solved}/{rows.length}
          </p>
          <p className="label">{attempted} in progress</p>
        </div>
        <div className="grid gap-3">
          {[
            ['Easy', E],
            ['Medium', M],
            ['Hard', H],
          ].map(([label, c]) => {
            const cc = c as { solved: number; total: number }
            return (
              <div key={label as string} className="grid grid-cols-[80px_1fr_72px] items-center gap-4">
                <span className="label">{label as string}</span>
                <Progress value={cc.total ? (cc.solved / cc.total) * 100 : 0} aria-label={`${label} solved`} />
                <span className="label num text-right">
                  {cc.solved}/{cc.total}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* filters */}
      <section className="mt-8" aria-label="Filters">
        <Input ref={search} placeholder="Search title, topic or pattern   /" value={f.q} onChange={(e) => set({ q: e.target.value })} aria-label="Search problems" />
        <div className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-4">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Difficulty">
            <span className="label mr-2">Level</span>
            {['easy', 'medium', 'hard'].map((d) => (
              <button key={d} type="button" className="chip" aria-pressed={f.diff === d} onClick={() => set({ diff: f.diff === d ? 'all' : d })}>
                {d}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Status">
            <span className="label mr-2">Status</span>
            {['none', 'attempted', 'solved', 'revisit'].map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={f.status === s} onClick={() => set({ status: f.status === s ? 'all' : s })}>
                {s === 'none' ? 'todo' : s}
              </button>
            ))}
          </div>
        </div>

        <details className="group mt-6" open={f.topic !== 'all' || f.pattern !== 'all' ? true : undefined}>
          <summary className="label inline-flex list-none items-center gap-2 hover:text-brand [&::-webkit-details-marker]:hidden">
            Topics and patterns
            <span className="group-open:hidden">show</span>
            <span className="hidden group-open:inline">hide</span>
            {(f.topic !== 'all' || f.pattern !== 'all') && <span className="live-dot ml-1" />}
          </summary>
          <p className="label mb-2 mt-4">Topic</p>
          <div className="flex flex-wrap gap-2">
            {topics.map(([t, n]) => (
              <button key={t} type="button" className="chip" aria-pressed={f.topic === t} onClick={() => set({ topic: f.topic === t ? 'all' : t })}>
                {t} <span className="num">{n}</span>
              </button>
            ))}
          </div>
          <p className="label mb-2 mt-6">Pattern</p>
          <div className="flex flex-wrap gap-2">
            {patternList.map((p) => (
              <button key={p.key} type="button" className="chip" aria-pressed={f.pattern === p.key} onClick={() => set({ pattern: f.pattern === p.key ? 'all' : p.key })}>
                {pixelText(p.name)} <span className="num">{p.problemIds.length}</span>
              </button>
            ))}
          </div>
        </details>
      </section>

      {/* table: the title is the column you scan, so it takes the width; status
          and level are labels. Topic lives in the filter and on the problem page. */}
      <div className="mb-2 mt-10 flex items-center justify-between">
        <p className="label">
          {shown.length} of {rows.length} problems
        </p>
        {dirty && (
          <button type="button" className="label hover:text-brand" onClick={() => setF({ ...DEFAULT, sort: f.sort, dir: f.dir })}>
            Clear filters
          </button>
        )}
      </div>
      <div className="list" role="table" aria-label="Problems">
        <div role="row" className={cn(COLS, 'px-4 py-2')}>
          <span role="columnheader">{head('status', 'Status')}</span>
          <span role="columnheader">{head('order', '#')}</span>
          <span role="columnheader">{head('title', 'Title')}</span>
          <span role="columnheader" className="label hidden md:block">
            Pattern
          </span>
          <span role="columnheader">{head('difficulty', 'Level')}</span>
        </div>
        {shown.map(({ d, n, patterns }) => (
          <a key={d.id} role="row" href={`#/drill/${d.id}`} className={cn('row !min-h-[52px] no-underline', COLS)}>
            <span role="cell">
              <StatusDot status={statusOf(d.id)} className="w-auto" />
            </span>
            <span role="cell" className="label num">
              {n}
            </span>
            <span role="cell" className="min-w-0 truncate">
              {pixelText(d.title)}
            </span>
            <span role="cell" className="label hidden min-w-0 truncate md:block" title={patterns.map((p) => p.name).join(', ')}>
              {patterns[0] ? pixelText(patterns[0].name) : ''}
              {patterns.length > 1 ? ` +${patterns.length - 1}` : ''}
            </span>
            <span role="cell">
              <DiffMark value={d.difficulty} />
            </span>
          </a>
        ))}
        {shown.length === 0 && <p className="px-4 py-10 text-ink-2">No match.</p>}
      </div>
    </div>
  )
}
