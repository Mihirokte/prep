import { useEffect, useMemo, useState } from 'react'
import { prefersReducedMotion, useInView } from './hooks'

// ```steps — an ordered process, lit one step at a time while on screen.

export interface StepRow {
  title: string
  text: string
}

export function parseSteps(src: string): StepRow[] | null {
  const rows = src
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf('|')
      return i < 0 ? { title: l, text: '' } : { title: l.slice(0, i).trim(), text: l.slice(i + 1).trim() }
    })
  return rows.length >= 2 ? rows : null
}

export default function StepsBlock({ rows }: { rows: StepRow[] }) {
  const [ref, seen] = useInView<HTMLDivElement>(true)
  const reduced = prefersReducedMotion()
  const [lit, setLit] = useState(reduced ? rows.length : 0)
  const [run, setRun] = useState(0)
  const total = rows.length
  const ids = useMemo(() => rows.map((_, i) => String(i + 1).padStart(2, '0')), [rows])

  useEffect(() => {
    if (!seen || reduced) return
    setLit(0)
    let i = 0
    const t = window.setInterval(() => {
      i++
      setLit(i)
      if (i >= total) clearInterval(t)
    }, 700)
    return () => clearInterval(t)
  }, [seen, run, reduced, total])

  // Text never fades (contrast principle): a step that is not lit yet keeps its
  // full-contrast text and shows its state in the number frame instead
  // (edge = not reached, ink = done, accent = current).
  return (
    <div ref={ref} className="my-8">
      <ol className="steps relative">
        {rows.map((r, i) => {
          const on = i < lit
          const current = i === lit - 1 && lit < total
          return (
            <li key={i} className="relative grid grid-cols-[48px_1fr] gap-x-4 pb-6 last:pb-0">
              {i < total - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute left-[23px] top-12 bottom-0 w-px"
                  style={{ background: i < lit - 1 ? 'var(--ink)' : 'var(--edge)', transition: 'background .4s' }}
                />
              )}
              <span
                className={`z-10 flex size-12 items-center justify-center border-2 bg-paper font-label text-[12px] tracking-[0.12em] transition-[border-color,color] duration-300 ${
                  current ? 'border-brand text-brand' : on ? 'border-ink text-ink' : 'border-edge text-ink-2'
                }`}
              >
                {ids[i]}
              </span>
              <div className="pt-2">
                <p className="font-bold">{r.title}</p>
                {r.text && <p className="mt-1 text-ink-2">{r.text}</p>}
              </div>
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        className="label mt-4 inline-flex items-center gap-2 hover:text-brand"
        onClick={() => {
          setLit(0)
          setRun((r) => r + 1)
        }}
      >
        Replay
      </button>
    </div>
  )
}
