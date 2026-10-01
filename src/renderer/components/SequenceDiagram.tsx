import type { JSX } from 'react'

// Minimal sequence-diagram renderer — parses the subset of mermaid
// `sequenceDiagram` syntax the lessons use (participant, ->>, -->>, Note).
// Purpose-built so we don't ship the ~4MB full mermaid engine.
// Colours come from the app's tokens so the diagram sits in the lesson like
// any other block rather than as pasted-in artwork.

interface Step {
  kind: 'msg' | 'note'
  from: string
  to: string
  text: string
  dashed?: boolean
}

function parse(src: string): { actors: string[]; steps: Step[] } {
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
      const id = m[1]
      const label = (m[2] ?? id).trim()
      alias[id] = label
      add(label)
    } else if ((m = /^Note\s+(?:over|left of|right of)\s+([^:]+):\s*(.+)$/.exec(line))) {
      const who = m[1].split(',')[0].trim()
      const name = alias[who] ?? who
      add(name)
      steps.push({ kind: 'note', from: name, to: name, text: m[2].trim() })
    } else if ((m = /^(\S+)\s*(--?>>?)\s*(\S+)\s*:\s*(.+)$/.exec(line))) {
      const from = alias[m[1]] ?? m[1]
      const to = alias[m[3]] ?? m[3]
      add(from)
      add(to)
      steps.push({ kind: 'msg', from, to, text: m[4].trim(), dashed: m[2].startsWith('--') })
    }
  }
  return { actors, steps }
}

const SANS = 'var(--font-sans)'
const INK = 'var(--foreground)'
const INK_2 = 'var(--muted-foreground)'
const RULE = 'var(--input)'
const BRAND = 'var(--brand)'

export default function SequenceDiagram({ chart }: { chart: string }): JSX.Element {
  const { actors, steps } = parse(chart)
  if (actors.length === 0)
    return <pre className="md-surface my-6 overflow-x-auto rounded-md bg-card px-4 py-3.5 font-mono text-[0.8125rem]">{chart}</pre>

  const colW = 128
  const padX = 14
  const headerH = 40
  const rowH = 42
  const width = padX * 2 + colW * Math.max(actors.length, 1)
  const height = headerH + rowH * steps.length + 24
  const lifeX = (name: string) => padX + colW * actors.indexOf(name) + colW / 2

  return (
    <div className="md-surface seqdiagram my-6 rounded-md bg-card px-4 py-4 shadow-[var(--shadow-panel)]">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="sequence diagram">
        {/* lifelines */}
        {actors.map((a) => (
          <line
            key={`ll-${a}`}
            x1={lifeX(a)}
            y1={headerH}
            x2={lifeX(a)}
            y2={height - 10}
            stroke={RULE}
            strokeOpacity="0.6"
            strokeDasharray="3 5"
          />
        ))}
        {/* actor headers */}
        {actors.map((a) => (
          <g key={`h-${a}`}>
            <rect
              x={lifeX(a) - colW / 2 + 8}
              y={8}
              width={colW - 16}
              height={28}
              rx={6}
              fill="var(--background)"
              stroke={RULE}
            />
            <text x={lifeX(a)} y={26.5} textAnchor="middle" fill={INK} fontSize="12" fontWeight="500" fontFamily={SANS}>
              {a.length > 16 ? a.slice(0, 15) + '…' : a}
            </text>
          </g>
        ))}
        {/* steps */}
        {steps.map((s, i) => {
          const y = headerH + rowH * i + 30
          if (s.kind === 'note') {
            const x = lifeX(s.from)
            return (
              <g key={i}>
                <rect
                  x={x - colW / 2 + 14}
                  y={y - 16}
                  width={colW - 28}
                  height={26}
                  rx={5}
                  fill="oklch(0.82 0.13 80 / 0.12)"
                  stroke={BRAND}
                  strokeOpacity="0.45"
                />
                <text x={x} y={y + 1.5} textAnchor="middle" fill={BRAND} fontSize="10.5" fontFamily={SANS}>
                  {s.text.length > 20 ? s.text.slice(0, 19) + '…' : s.text}
                </text>
              </g>
            )
          }
          const x1 = lifeX(s.from)
          const x2 = lifeX(s.to)
          const self = x1 === x2
          const mid = (x1 + x2) / 2
          return (
            <g key={i}>
              <text
                x={self ? x1 + 6 : mid}
                y={y - 8}
                textAnchor={self ? 'start' : 'middle'}
                fill={INK_2}
                fontSize="11"
                fontFamily={SANS}
              >
                {s.text.length > 34 ? s.text.slice(0, 33) + '…' : s.text}
              </text>
              {self ? (
                <path
                  d={`M ${x1} ${y} h 30 v 16 h -30`}
                  fill="none"
                  stroke={INK_2}
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                  markerEnd="url(#arr)"
                />
              ) : (
                <line
                  x1={x1}
                  y1={y}
                  x2={x2}
                  y2={y}
                  stroke={INK_2}
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                  markerEnd="url(#arr)"
                />
              )}
            </g>
          )
        })}
        <defs>
          <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L7,3 L0,6 Z" fill={INK_2} />
          </marker>
        </defs>
      </svg>
    </div>
  )
}
