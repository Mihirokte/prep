import { useMemo } from 'react'
import { useInView } from './hooks'

// ```stack and ```bars — the two chart blocks. Both read rows of
// `Label | number | note`, with optional `title:` and `unit:` lines, and both
// grow in once when they scroll into view.

export interface ChartRow {
  label: string
  value: number
  note?: string
}
export interface Chart {
  title?: string
  unit?: string
  rows: ChartRow[]
}

export function parseChart(src: string): Chart | null {
  const rows: ChartRow[] = []
  let title: string | undefined
  let unit: string | undefined
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let m = /^title\s*:\s*(.+)$/i.exec(line)
    if (m) {
      title = m[1].trim()
      continue
    }
    m = /^unit\s*:\s*(.+)$/i.exec(line)
    if (m) {
      unit = m[1].trim()
      continue
    }
    const parts = line.split('|').map((p) => p.trim())
    const value = Number(parts[1]?.replace(/,/g, ''))
    if (parts.length >= 2 && parts[0] && Number.isFinite(value)) rows.push({ label: parts[0], value, note: parts[2] || undefined })
  }
  return rows.length >= 2 ? { title, unit, rows } : null
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 2 : 1).replace(/\.?0+$/, ''))

/** Ink at stepped strengths: segments stay legible without a second hue. */
const TONES = [1, 0.78, 0.58, 0.42, 0.3, 0.2, 0.13, 0.08]

export function StackChart({ chart }: { chart: Chart }) {
  const [ref, seen] = useInView<HTMLDivElement>(true)
  const total = useMemo(() => chart.rows.reduce((s, r) => s + r.value, 0), [chart])
  return (
    <figure ref={ref} className="diagram my-8 px-5 py-5">
      {chart.title && <figcaption className="label mb-4 text-ink">{chart.title}</figcaption>}
      <div className="flex h-10 w-full border-2 border-ink" role="img" aria-label={`${chart.title ?? 'Breakdown'}: ${chart.rows.map((r) => `${r.label} ${fmt(r.value)}`).join(', ')}`}>
        {chart.rows.map((r, i) => (
          <div
            key={r.label}
            className="group relative h-full overflow-hidden border-r border-paper last:border-r-0"
            style={{
              width: seen ? `${(r.value / total) * 100}%` : '0%',
              background: `color-mix(in srgb, var(--ink) ${TONES[i % TONES.length] * 100}%, transparent)`,
              transition: `width .7s var(--ease) ${i * 90}ms`,
            }}
          />
        ))}
      </div>
      <ul className="mt-5">
        {chart.rows.map((r, i) => (
          <li key={r.label} className="flex items-baseline gap-3 border-t border-hair py-2 first:border-t-0">
            <span
              className="mt-1.5 size-3 shrink-0 border border-ink"
              style={{ background: `color-mix(in srgb, var(--ink) ${TONES[i % TONES.length] * 100}%, transparent)` }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              {r.label}
              {r.note && <span className="ml-3 text-ink-2">{r.note}</span>}
            </span>
            <span className="num shrink-0 tabular-nums">
              {fmt(r.value)}
              {chart.unit ? ` ${chart.unit}` : ''}
              <span className="ml-3 text-ink-2">{Math.round((r.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

export function BarChart({ chart }: { chart: Chart }) {
  const [ref, seen] = useInView<HTMLDivElement>(true)
  const max = Math.max(...chart.rows.map((r) => r.value), 1)
  return (
    <figure ref={ref} className="diagram my-8 px-5 py-5">
      {chart.title && <figcaption className="label mb-4 text-ink">{chart.title}</figcaption>}
      <ul className="flex flex-col gap-3">
        {chart.rows.map((r, i) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-4 max-[640px]:grid-cols-[1fr_auto]">
            <span className="min-w-0 truncate" title={r.label}>
              {r.label}
            </span>
            <div className="h-5 border border-hair-strong max-[640px]:col-span-2 max-[640px]:row-start-2">
              <div
                className="h-full bg-ink"
                style={{ width: seen ? `${(r.value / max) * 100}%` : '0%', transition: `width .7s var(--ease) ${i * 90}ms` }}
              />
            </div>
            <span className="num shrink-0 tabular-nums">
              {fmt(r.value)}
              {chart.unit ? ` ${chart.unit}` : ''}
            </span>
            {r.note && <span className="col-span-full -mt-1 text-ink-2">{r.note}</span>}
          </li>
        ))}
      </ul>
    </figure>
  )
}
