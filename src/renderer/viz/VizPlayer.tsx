import { useEffect, useMemo, useRef, useState } from 'react'
import { prefersReducedMotion, useInView } from '../components/blocks/hooks'
import { cn } from '../lib/utils'
import type { ArrayPanel, Cell, Frame, GraphPanel, GridPanel, KvPanel, ListPanel, Panel, Scene, StackPanel, Tone } from './types'

const CELL = 44
const GAP = 4
const STRIDE = CELL + GAP

function toneClass(tone?: Tone): string {
  switch (tone) {
    case 'on':
      return 'bg-ink text-paper border-ink'
    case 'done':
      return 'bg-[var(--wash)] text-ink-2 border-hair-strong'
    case 'hit':
      return 'border-brand text-brand bg-surface'
    case 'dim':
      // Out of play: dashed hairline frame, ink-2 value (still 5.9:1), no fill.
      return 'border-dashed border-edge text-ink-2 bg-transparent'
    default:
      return 'border-ink bg-surface text-ink'
  }
}

function CellBox({ cell, size = CELL }: { cell: Cell; size?: number }) {
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center border-2 text-center transition-[background-color,color,border-color,opacity] duration-300 ease-[var(--ease)]', toneClass(cell.tone))}
      style={{ width: size, height: size }}
    >
      {cell.v}
    </div>
  )
}

function Title({ children }: { children?: string }) {
  return children ? <p className="label mb-2 text-ink">{children}</p> : null
}

function ArrayView({ p }: { p: ArrayPanel }) {
  const n = p.cells.length
  const w = n * STRIDE - GAP
  const groups = new Map<number, string[]>()
  for (const ptr of p.pointers ?? []) groups.set(ptr.at, [...(groups.get(ptr.at) ?? []), ptr.name])
  const slot = new Map<string, number>()
  for (const names of groups.values()) names.forEach((nm, i) => slot.set(nm, i))
  const rows = Math.max(1, ...[...groups.values()].map((g) => g.length))
  return (
    <div>
      <Title>{p.title}</Title>
      <div className="relative" style={{ width: w, paddingTop: 6 }}>
        <div className="relative flex" style={{ gap: GAP }}>
          {p.cells.map((c, i) => (
            <CellBox key={i} cell={c} />
          ))}
          {p.window && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-[6px] border-2 border-brand transition-[left,width] duration-500 ease-[var(--ease)]"
              style={{ left: p.window[0] * STRIDE - 5, width: (p.window[1] - p.window[0] + 1) * STRIDE - GAP + 10, height: CELL + 12 }}
            />
          )}
        </div>
        {p.indices !== false && (
          <div className="flex" style={{ gap: GAP }}>
            {p.cells.map((_, i) => (
              <span key={i} className="label num text-center" style={{ width: CELL }}>
                {i}
              </span>
            ))}
          </div>
        )}
        {(p.pointers?.length ?? 0) > 0 && (
          <div className="relative" style={{ height: rows * 26 + 8 }}>
            {p.pointers!.map((ptr) => (
              <div
                key={ptr.name}
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center transition-[left,top] duration-500 ease-[var(--ease)]"
                style={{ left: ptr.at * STRIDE + CELL / 2, top: (slot.get(ptr.name) ?? 0) * 26 }}
              >
                <span className="h-1.5 w-0.5 bg-brand" />
                <span className="tag label px-2 !text-brand" style={{ lineHeight: '18px' }}>
                  {ptr.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function GridView({ p }: { p: GridPanel }) {
  const focus = new Set((p.focus ?? []).map(([r, c]) => `${r},${c}`))
  const S = 40
  return (
    <div>
      <Title>{p.title}</Title>
      <div className="inline-block">
        {p.cols && (
          <div className="flex" style={{ gap: GAP, marginLeft: p.rows ? S + GAP : 0 }}>
            {p.cols.map((c, i) => (
              <span key={i} className="label num text-center" style={{ width: S }}>
                {c}
              </span>
            ))}
          </div>
        )}
        {p.cells.map((row, r) => (
          <div key={r} className="flex items-center" style={{ gap: GAP, marginTop: r ? GAP : 0 }}>
            {p.rows && (
              <span className="label num text-center" style={{ width: S }}>
                {p.rows[r]}
              </span>
            )}
            {row.map((c, cI) => (
              <div key={cI} className="relative">
                <CellBox cell={c} size={S} />
                {focus.has(`${r},${cI}`) && <span aria-hidden="true" className="pointer-events-none absolute -inset-[5px] border-2 border-dotted border-brand" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function GraphView({ p }: { p: GraphPanel }) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]))
  const R = 18
  return (
    <div>
      <Title>{p.title}</Title>
      <svg width={p.width + 24} height={p.height + 24} viewBox={`-12 -12 ${p.width + 24} ${p.height + 24}`} shapeRendering="crispEdges" className="block max-w-full">
        <defs>
          <marker id="vz-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0 0L8 4L0 8z" fill="var(--ink)" />
          </marker>
        </defs>
        {p.edges.map((e, i) => {
          const a = byId.get(e.a)
          const b = byId.get(e.b)
          if (!a || !b) return null
          const dx = b.x - a.x
          const dy = b.y - a.y
          const len = Math.hypot(dx, dy) || 1
          const sx = a.x + (dx / len) * R
          const sy = a.y + (dy / len) * R
          const ex = b.x - (dx / len) * (R + (e.directed ? 6 : 0))
          const ey = b.y - (dy / len) * (R + (e.directed ? 6 : 0))
          const hot = e.tone === 'hit' || e.tone === 'on'
          return (
            <g key={i}>
              <line
                x1={sx}
                y1={sy}
                x2={ex}
                y2={ey}
                stroke={hot ? 'var(--accent)' : 'var(--ink)'}
                strokeOpacity={e.tone === 'dim' ? 0.2 : hot ? 1 : 0.6}
                strokeWidth={hot ? 2 : 1}
                markerEnd={e.directed ? 'url(#vz-arrow)' : undefined}
                style={{ transition: 'stroke .3s, stroke-opacity .3s' }}
              />
              {e.w !== undefined && (
                <g>
                  <rect x={(a.x + b.x) / 2 - 10} y={(a.y + b.y) / 2 - 9} width={20} height={16} fill="var(--surface)" />
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 + 4} textAnchor="middle" fontSize={12} className="lbl">
                    {e.w}
                  </text>
                </g>
              )}
            </g>
          )
        })}
        {p.nodes.map((n) => {
          const dim = n.tone === 'dim'
          const fill = n.tone === 'on' ? 'var(--ink)' : n.tone === 'done' ? 'var(--wash)' : dim ? 'var(--paper)' : 'var(--surface)'
          const stroke = n.tone === 'hit' ? 'var(--accent)' : n.tone === 'done' || dim ? 'var(--edge)' : 'var(--ink)'
          const text = n.tone === 'on' ? 'var(--paper)' : n.tone === 'hit' ? 'var(--accent)' : n.tone === 'done' || dim ? 'var(--ink-2)' : 'var(--ink)'
          return (
            <g key={n.id}>
              <rect
                x={n.x - R}
                y={n.y - R}
                width={R * 2}
                height={R * 2}
                fill={fill}
                stroke={stroke}
                strokeWidth={2}
                strokeDasharray={dim ? '3 3' : undefined}
                style={{ transition: 'fill .3s, stroke .3s' }}
              />
              <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize={16} style={{ fill: text }}>
                {n.label}
              </text>
              {n.sub !== undefined && (
                <text x={n.x} y={n.y + R + 14} textAnchor="middle" fontSize={12} className="lbl">
                  {n.sub}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function ListView({ p }: { p: ListPanel }) {
  const BW = 48
  const STR = 92
  const w = p.items.length * STR
  const groups = new Map<number, string[]>()
  for (const ptr of p.pointers ?? []) groups.set(ptr.at, [...(groups.get(ptr.at) ?? []), ptr.name])
  const slot = new Map<string, number>()
  for (const names of groups.values()) names.forEach((nm, i) => slot.set(nm, i))
  const rows = Math.max(1, ...[...groups.values()].map((g) => g.length))
  const top = rows * 26 + 4
  const H = top + 44 + 54
  const cx = (i: number) => i * STR + BW / 2 + 6
  return (
    <div>
      <Title>{p.title}</Title>
      <svg width={w + 24} height={H} viewBox={`0 0 ${w + 24} ${H}`} shapeRendering="crispEdges" className="block max-w-full">
        <defs>
          <marker id="vz-l-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0 0L8 4L0 8z" fill="var(--ink)" />
          </marker>
        </defs>
        {p.items.map((it, i) => {
          const x = i * STR + 6
          const y = top
          const fill = it.tone === 'on' ? 'var(--ink)' : it.tone === 'done' ? 'var(--wash)' : 'var(--surface)'
          const stroke = it.tone === 'hit' ? 'var(--accent)' : it.tone === 'done' ? 'var(--hair-strong)' : 'var(--ink)'
          const text = it.tone === 'on' ? 'var(--paper)' : it.tone === 'hit' ? 'var(--accent)' : it.tone === 'done' ? 'var(--ink-2)' : 'var(--ink)'
          const nx = p.next[i]
          return (
            <g key={i}>
              <rect x={x} y={y} width={BW} height={44} fill={fill} stroke={stroke} strokeWidth={2} style={{ transition: 'fill .3s, stroke .3s' }} />
              <text x={x + BW / 2} y={y + 28} textAnchor="middle" fontSize={16} style={{ fill: text }}>
                {it.v}
              </text>
              {nx === null || nx === undefined ? (
                <text x={x + BW + 6} y={y + 27} fontSize={12} className="lbl">
                  null
                </text>
              ) : nx === i + 1 ? (
                <line x1={x + BW} y1={y + 22} x2={x + STR - 4} y2={y + 22} stroke="var(--ink)" strokeWidth={1} markerEnd="url(#vz-l-arrow)" />
              ) : (
                <path
                  d={`M${cx(i)} ${y + 44}V${y + 44 + 14 + (Math.abs(nx - i) > 1 ? 10 : 0)}H${cx(nx)}V${y + 46}`}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1}
                  markerEnd="url(#vz-l-arrow)"
                />
              )}
            </g>
          )
        })}
        {p.pointers?.map((ptr) => {
          const w = ptr.name.length * 9 + 16
          return (
            <g
              key={ptr.name}
              style={{ transform: `translate(${cx(ptr.at) - w / 2}px, ${(slot.get(ptr.name) ?? 0) * 26}px)`, transition: 'transform .5s cubic-bezier(.2,.9,.2,1)' }}
            >
              <rect width={w} height={20} fill="var(--paper)" stroke="var(--accent)" strokeWidth={1} />
              <text x={w / 2} y={14} textAnchor="middle" fontSize={12} className="lbl" style={{ fill: 'var(--accent)' }}>
                {ptr.name}
              </text>
              <rect x={w / 2 - 1} y={20} width={2} height={top - (slot.get(ptr.name) ?? 0) * 26 - 20} fill="var(--accent)" />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function StackView({ p }: { p: StackPanel }) {
  return (
    <div>
      <Title>{p.title}</Title>
      {p.queue ? (
        <div className="flex min-h-[44px] items-center gap-1 border-y-2 border-ink px-1 py-1">
          {p.items.length === 0 && <span className="label px-2">empty</span>}
          {p.items.map((v, i) => (
            <CellBox key={`${i}-${v}`} cell={{ v }} size={36} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[44px] w-[60px] flex-col-reverse gap-1 border-x-2 border-b-2 border-ink p-1">
          {p.items.map((v, i) => (
            <CellBox key={`${i}-${v}`} cell={{ v, tone: i === p.items.length - 1 ? 'on' : undefined }} size={44} />
          ))}
          {p.items.length === 0 && <span className="label py-1 text-center">empty</span>}
        </div>
      )}
    </div>
  )
}

function KvView({ p }: { p: KvPanel }) {
  return (
    <div className="min-w-[128px]">
      <Title>{p.title}</Title>
      <ul className="border-y border-hair-strong">
        {p.entries.length === 0 && <li className="label px-3 py-2">empty</li>}
        {p.entries.map(([k, v], i) => (
          <li key={`${k}-${i}`} className="flex justify-between gap-6 border-t border-hair px-3 py-1 first:border-t-0">
            <span className="text-ink-2">{k}</span>
            <span className="num">{v}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PanelView({ p }: { p: Panel }) {
  switch (p.kind) {
    case 'array':
      return <ArrayView p={p} />
    case 'grid':
      return <GridView p={p} />
    case 'graph':
      return <GraphView p={p} />
    case 'list':
      return <ListView p={p} />
    case 'stack':
      return <StackView p={p} />
    case 'kv':
      return <KvView p={p} />
  }
}

export default function VizPlayer({ scene, compact }: { scene: Scene; compact?: boolean }) {
  const frames: Frame[] = useMemo(() => scene.frames(), [scene])
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [fast, setFast] = useState(false)
  const [ref, seen] = useInView<HTMLDivElement>(true)
  const started = useRef(false)
  const last = frames.length - 1
  const f = frames[Math.min(i, last)]

  useEffect(() => {
    if (seen && !started.current && !prefersReducedMotion()) {
      started.current = true
      setPlaying(true)
    }
  }, [seen])

  useEffect(() => {
    if (!playing) return
    if (i >= last) {
      setPlaying(false)
      return
    }
    const t = window.setTimeout(() => setI((x) => Math.min(x + 1, last)), fast ? 650 : 1300)
    return () => clearTimeout(t)
  }, [playing, i, last, fast])

  const go = (n: number) => {
    setPlaying(false)
    setI(Math.max(0, Math.min(last, n)))
  }

  return (
    <div ref={ref} className="diagram my-8" onKeyDown={(e) => (e.key === 'ArrowRight' ? go(i + 1) : e.key === 'ArrowLeft' ? go(i - 1) : undefined)}>
      {/* The page already names the pattern, so the player's own head is a label
          (no second title competing with the page's) plus the example it runs. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-hair px-5 py-3">
        <p className="label text-ink">Walk-through</p>
        <p className="text-ink-2">{scene.setup}</p>
      </div>

      <div className={cn('grid gap-0', !compact && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
        <div className="min-w-0 px-5 py-5">
          <div className="flex min-h-[132px] flex-wrap items-start gap-x-10 gap-y-6 overflow-x-auto pb-2">
            {f.panels.map((p, k) => (
              <PanelView key={k} p={p} />
            ))}
          </div>
          {f.vars && f.vars.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {f.vars.map(([k, v]) => (
                <span key={k} className="chip !h-7 !text-ink">
                  <span className="text-ink-2">{k}</span>
                  <span className="num">{v}</span>
                </span>
              ))}
            </div>
          )}
          <p className="mt-4 min-h-[56px] border-l-2 border-ink pl-4" aria-live="polite">
            {f.note}
          </p>
        </div>

        {!compact && (
          <pre className="hidden border-l border-hair bg-paper/40 py-4 text-[16px] leading-6 lg:block">
            {scene.code.map((ln, k) => (
              <div
                key={k}
                className={cn('whitespace-pre-wrap break-words px-4 [overflow-wrap:anywhere]', k === f.line ? 'bg-[var(--wash)] text-ink shadow-[inset_2px_0_0_var(--accent)]' : 'text-ink-2')}
              >
                {ln || ' '}
              </div>
            ))}
          </pre>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-hair px-3 py-2">
        <button type="button" className="tool" aria-label="Restart" onClick={() => go(0)}>
          Restart
        </button>
        <button type="button" className="tool" aria-label="Previous step" onClick={() => go(i - 1)} disabled={i === 0}>
          Prev
        </button>
        <button
          type="button"
          className="tool"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            if (i >= last) setI(0)
            setPlaying((p) => !p)
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="tool" aria-label="Next step" onClick={() => go(i + 1)} disabled={i === last}>
          Next
        </button>
        <input
          type="range"
          min={0}
          max={last}
          value={i}
          onChange={(e) => go(Number(e.target.value))}
          aria-label="Step"
          className="viz-range mx-3 h-6 min-w-0 flex-1"
        />
        <span className="label num w-14 text-right">
          {i + 1}/{frames.length}
        </span>
        <button type="button" className="chip !h-7" aria-pressed={fast} onClick={() => setFast((v) => !v)}>
          2x
        </button>
      </div>
    </div>
  )
}
