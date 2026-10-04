import { useEffect, useMemo, useState } from 'react'
import { prefersReducedMotion, useFontsReady, useInView, useWidth, wrapText } from './hooks'

// ```mermaid sequenceDiagram — the subset the lessons use (participant, ->>,
// -->>, Note over). Messages reveal one at a time while the block is on
// screen; a replay button restarts it. Text is wrapped, never truncated.

interface Step {
  kind: 'msg' | 'note'
  from: string
  to: string
  text: string
  dashed?: boolean
}

export function parseSequence(src: string): { actors: string[]; steps: Step[] } {
  const actors: string[] = []
  const alias: Record<string, string> = {}
  const steps: Step[] = []
  const add = (name: string) => {
    if (!actors.includes(name)) actors.push(name)
  }
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line || line === 'sequenceDiagram') continue
    let m
    if ((m = /^participant\s+(\S+)(?:\s+as\s+(.+))?$/.exec(line))) {
      const label = (m[2] ?? m[1]).trim()
      alias[m[1]] = label
      add(label)
    } else if ((m = /^Note\s+(?:over|left of|right of)\s+([^:]+):\s*(.+)$/.exec(line))) {
      const who = m[1].split(',')[0].trim()
      const name = alias[who] ?? who
      add(name)
      steps.push({ kind: 'note', from: name, to: name, text: m[2].trim() })
    } else if ((m = /^(\S+?)\s*(--?>>?)\s*(\S+?)\s*:\s*(.+)$/.exec(line))) {
      const from = alias[m[1]] ?? m[1]
      const to = alias[m[3]] ?? m[3]
      add(from)
      add(to)
      steps.push({ kind: 'msg', from, to, text: m[4].trim(), dashed: m[2].startsWith('--') })
    }
  }
  return { actors, steps }
}

const PAD = 16
const HEAD_H = 40
const LH = 20

export default function SequenceDiagram({ chart }: { chart: string }) {
  const fonts = useFontsReady()
  const parsed = useMemo(() => parseSequence(chart), [chart])
  const [wrapRef, W] = useWidth<HTMLDivElement>()
  const [viewRef, inView] = useInView<HTMLDivElement>(true)
  const reduced = prefersReducedMotion()
  const [shown, setShown] = useState(reduced ? parsed.steps.length : 0)
  const [run, setRun] = useState(0)
  const { actors, steps } = parsed

  useEffect(() => {
    if (!inView || reduced) return
    setShown(0)
    let i = 0
    const t = window.setInterval(() => {
      i++
      setShown(i)
      if (i >= steps.length) clearInterval(t)
    }, 650)
    return () => clearInterval(t)
  }, [inView, run, reduced, steps.length])

  const lay = useMemo(() => {
    if (!W || !fonts || actors.length === 0) return null
    const colW = Math.max(120, Math.floor((W - PAD * 2) / actors.length))
    const width = Math.max(W, colW * actors.length + PAD * 2)
    const lifeX = (name: string) => PAD + colW * actors.indexOf(name) + colW / 2
    let y = HEAD_H + 16
    const rows = steps.map((s) => {
      const span = Math.max(1, Math.abs(actors.indexOf(s.to) - actors.indexOf(s.from)))
      const self = s.from === s.to
      const maxPx = s.kind === 'note' ? colW * 1.6 - 24 : self ? colW - 48 : span * colW - 24
      const lines = wrapText(s.text, Math.max(72, maxPx))
      const h = lines.length * LH + (s.kind === 'note' ? 20 : 22)
      const row = { s, lines, y, h }
      y += h + 10
      return row
    })
    return { colW, width, height: y + 8, lifeX, rows }
  }, [W, fonts, actors, steps])

  if (actors.length === 0) return <pre className="diagram my-8 p-4">{chart}</pre>

  return (
    <div ref={viewRef} className="diagram my-8">
      <div ref={wrapRef} className="w-full overflow-x-auto">
        {lay && (
          <svg
            width={lay.width}
            height={lay.height}
            viewBox={`0 0 ${lay.width} ${lay.height}`}
            role="img"
            aria-label={`Sequence diagram between ${actors.join(', ')}`}
            shapeRendering="crispEdges"
            className="block"
          >
            <defs>
              <marker id="sq-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0 0L8 4L0 8z" fill="var(--ink)" />
              </marker>
              <marker id="sq-arrow-on" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0 0L8 4L0 8z" fill="var(--accent)" />
              </marker>
            </defs>
            {actors.map((a) => (
              <g key={a}>
                <line x1={lay.lifeX(a)} y1={HEAD_H} x2={lay.lifeX(a)} y2={lay.height - 8} stroke="var(--hair-strong)" strokeDasharray="2 4" />
                <rect x={lay.lifeX(a) - lay.colW / 2 + 8} y={6} width={lay.colW - 16} height={30} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} />
                <text x={lay.lifeX(a)} y={26} textAnchor="middle" fontSize={16}>
                  {wrapText(a, lay.colW - 28)[0]}
                </text>
              </g>
            ))}
            {lay.rows.map((r, i) => {
              const visible = i < shown
              const current = i === shown - 1 && shown < steps.length + 1 && !reduced
              const x1 = lay.lifeX(r.s.from)
              const x2 = lay.lifeX(r.s.to)
              const opacity = visible ? 1 : 0.12
              if (r.s.kind === 'note') {
                const w = Math.min(lay.colW * 1.6, Math.max(...r.lines.map((l) => l.length * 8)) + 24)
                return (
                  <g key={i} opacity={opacity} style={{ transition: 'opacity .3s' }}>
                    <rect x={x1 - w / 2} y={r.y} width={w} height={r.h - 4} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 3" />
                    {r.lines.map((ln, k) => (
                      <text key={k} x={x1} y={r.y + 18 + k * LH - 2} textAnchor="middle" fontSize={16}>
                        {ln}
                      </text>
                    ))}
                  </g>
                )
              }
              const self = x1 === x2
              const ay = r.y + r.lines.length * LH + 10
              const color = current ? 'var(--accent)' : 'var(--ink)'
              const dir = x2 > x1 ? 1 : -1
              return (
                <g key={i} opacity={opacity} style={{ transition: 'opacity .3s' }}>
                  {r.lines.map((ln, k) => (
                    <text
                      key={k}
                      x={self ? x1 + 40 : (x1 + x2) / 2}
                      y={r.y + 14 + k * LH}
                      textAnchor={self ? 'start' : 'middle'}
                      fontSize={16}
                      style={{ fill: current ? 'var(--accent)' : undefined }}
                    >
                      {ln}
                    </text>
                  ))}
                  {self ? (
                    <path
                      d={`M${x1} ${ay - 6}H${x1 + 32}V${ay + 8}H${x1 + 6}`}
                      fill="none"
                      stroke={color}
                      strokeWidth={current ? 2 : 1}
                      markerEnd={current ? 'url(#sq-arrow-on)' : 'url(#sq-arrow)'}
                    />
                  ) : (
                    <line
                      x1={x1 + dir * 2}
                      y1={ay}
                      x2={x2 - dir * 2}
                      y2={ay}
                      stroke={color}
                      strokeWidth={current ? 2 : 1}
                      strokeDasharray={r.s.dashed ? '5 4' : undefined}
                      markerEnd={current ? 'url(#sq-arrow-on)' : 'url(#sq-arrow)'}
                    />
                  )}
                </g>
              )
            })}
          </svg>
        )}
      </div>
      <div className="flex items-center gap-3 border-t border-hair px-4 py-2">
        <button
          type="button"
          className="tool"
          aria-label="Replay sequence"
          onClick={() => {
            setShown(0)
            setRun((r) => r + 1)
          }}
        >
          Replay
        </button>
        <span className="label num">
          {Math.min(shown, steps.length)}/{steps.length}
        </span>
        <button
          type="button"
          className="label ml-auto hover:text-brand"
          onClick={() => setShown(steps.length)}
          aria-label="Show every message"
        >
          Show all
        </button>
      </div>
    </div>
  )
}
