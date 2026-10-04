import { useEffect, useMemo, useState } from 'react'
import { LABEL_FONT, prefersReducedMotion, textWidth, useFontsReady, useInView, useWidth, wrapText } from './hooks'

// ```flow — boxes and arrows with a travelling packet.
//
//   dir: LR
//   user: User | actor
//   user -> llm : question
//
// Layered layout (longest path), orthogonal stepped edges, back edges routed
// under the diagram. The packet steps through the edges so the reader can
// follow the data in order; it plays while the diagram is on screen.

type Kind = 'step' | 'actor' | 'model' | 'store' | 'tool' | 'gate'
interface FNode {
  id: string
  label: string
  kind: Kind
}
interface FEdge {
  from: string
  to: string
  label?: string
  dashed: boolean
}
export interface FlowSpec {
  dir: 'LR' | 'TB'
  nodes: FNode[]
  edges: FEdge[]
}

const KINDS = new Set<Kind>(['step', 'actor', 'model', 'store', 'tool', 'gate'])

export function parseFlow(src: string): FlowSpec | null {
  const nodes: FNode[] = []
  const edges: FEdge[] = []
  let dir: 'LR' | 'TB' = 'LR'
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    let m = /^dir\s*:\s*(LR|TB)$/i.exec(line)
    if (m) {
      dir = m[1].toUpperCase() as 'LR' | 'TB'
      continue
    }
    m = /^([\w-]+)\s*(-->|->)\s*([\w-]+)(?:\s*:\s*(.+))?$/.exec(line)
    if (m) {
      edges.push({ from: m[1], to: m[3], label: m[4]?.trim(), dashed: m[2] === '-->' })
      continue
    }
    m = /^([\w-]+)\s*:\s*(.+?)(?:\s*\|\s*(\w+))?$/.exec(line)
    if (m) {
      const kind = (m[3]?.toLowerCase() ?? 'step') as Kind
      nodes.push({ id: m[1], label: m[2].trim(), kind: KINDS.has(kind) ? kind : 'step' })
    }
  }
  const ids = new Set(nodes.map((n) => n.id))
  if (nodes.length === 0 || edges.some((e) => !ids.has(e.from) || !ids.has(e.to))) return null
  return { dir, nodes, edges }
}

interface Placed {
  node: FNode
  lines: string[]
  // abstract coordinates: m = along the flow, c = across it
  m: number
  c: number
  mSize: number
  cSize: number
  layer: number
}
interface Routed {
  edge: FEdge
  d: string
  label?: { x: number; y: number; lines: string[]; w: number }
  back: boolean
}

const LINE_H = 20
const PAD = 24
const LABEL_TRACK = 1.2

function layoutFlow(spec: FlowSpec, W: number, compact = false) {
  const { nodes, edges, dir } = spec
  const n = nodes.length
  const idx = new Map(nodes.map((nd, i) => [nd.id, i]))
  const out: number[][] = nodes.map(() => [])
  const indeg = new Array<number>(n).fill(0)
  edges.forEach((e, i) => {
    out[idx.get(e.from)!].push(i)
    indeg[idx.get(e.to)!]++
  })

  // back edges by DFS
  const state = new Array<number>(n).fill(0)
  const back = new Set<number>()
  const visit = (u: number) => {
    state[u] = 1
    for (const ei of out[u]) {
      const v = idx.get(edges[ei].to)!
      if (state[v] === 1) back.add(ei)
      else if (state[v] === 0) visit(v)
    }
    state[u] = 2
  }
  nodes.forEach((_, i) => indeg[i] === 0 && state[i] === 0 && visit(i))
  nodes.forEach((_, i) => state[i] === 0 && visit(i))

  // longest-path layers over forward edges
  const layer = new Array<number>(n).fill(0)
  for (let it = 0; it < n; it++) {
    let changed = false
    edges.forEach((e, i) => {
      if (back.has(i)) return
      const a = idx.get(e.from)!
      const b = idx.get(e.to)!
      if (layer[b] < layer[a] + 1) {
        layer[b] = layer[a] + 1
        changed = true
      }
    })
    if (!changed) break
  }
  const L = Math.max(...layer) + 1

  // order within layers: declaration order, then barycentre sweeps
  const cols: number[][] = Array.from({ length: L }, () => [])
  nodes.forEach((_, i) => cols[layer[i]].push(i))
  const pos = new Array<number>(n).fill(0)
  const reindex = () => cols.forEach((c) => c.forEach((v, k) => (pos[v] = k)))
  reindex()
  const preds = nodes.map(() => [] as number[])
  const succs = nodes.map(() => [] as number[])
  edges.forEach((e, i) => {
    if (back.has(i)) return
    const a = idx.get(e.from)!
    const b = idx.get(e.to)!
    preds[b].push(a)
    succs[a].push(b)
  })
  const bary = (v: number, nb: number[]) => (nb.length ? nb.reduce((s, u) => s + pos[u], 0) / nb.length : pos[v])
  for (let sweep = 0; sweep < 3; sweep++) {
    for (let l = 1; l < L; l++) {
      cols[l].sort((a, b) => bary(a, preds[a]) - bary(b, preds[b]) || a - b)
      reindex()
    }
    for (let l = L - 2; l >= 0; l--) {
      cols[l].sort((a, b) => bary(a, succs[a]) - bary(b, succs[b]) || a - b)
      reindex()
    }
  }

  // sizes
  const labelLines = edges.map((e) => (e.label ? wrapText(e.label.toUpperCase(), compact ? 84 : 112, LABEL_FONT, LABEL_TRACK) : []))
  const widthOf = (ls: string[]) => Math.max(0, ...ls.map((l) => textWidth(l, LABEL_FONT, LABEL_TRACK))) + 12
  const isLane = (i: number) => back.has(i) || layer[idx.get(edges[i].to)!] - layer[idx.get(edges[i].from)!] !== 1
  // Only labels that sit between two neighbouring columns widen the gap; a
  // label on a lane (a loop or a skip edge) has free space to itself.
  const labelW = Math.max(0, ...labelLines.map((ls, i) => (isLane(i) ? 0 : widthOf(ls) - 12)))
  const backLabelW = Math.max(0, ...labelLines.map((ls, i) => (back.has(i) ? widthOf(ls) : 0)))
  const topLabelW = Math.max(0, ...labelLines.map((ls, i) => (!back.has(i) && isLane(i) ? widthOf(ls) : 0)))
  const gap = dir === 'LR' ? (compact ? Math.min(100, Math.max(56, Math.ceil(labelW) + 24)) : Math.min(140, Math.max(72, Math.ceil(labelW) + 32))) : 72
  const longest = Math.max(...nodes.map((nd) => textWidth(nd.label)))
  const maxCross = Math.max(...cols.map((c) => c.length))
  let nodeW: number
  if (dir === 'LR') {
    const fit = Math.floor((W - PAD * 2 - (L - 1) * gap) / L)
    nodeW = Math.max(compact ? 84 : 96, Math.min(fit, Math.min(208, Math.ceil(longest) + 32)))
  } else {
    const fit = Math.floor((W - PAD * 2 - (maxCross - 1) * 32) / maxCross)
    nodeW = Math.max(96, Math.min(fit, Math.min(224, Math.ceil(longest) + 32)))
  }
  const placedBase = nodes.map((nd, i) => {
    const lines = wrapText(nd.label, nodeW - 28)
    return { node: nd, lines, layer: layer[i], h: Math.max(48, lines.length * LINE_H + 24) }
  })

  const laneTop = edges.filter((e, i) => !back.has(i) && layer[idx.get(e.to)!] - layer[idx.get(e.from)!] > 1).length
  const laneBottom = back.size
  const tb = dir === 'TB'
  const padLow = PAD + laneTop * 8 + (tb ? topLabelW : 0)
  const padHigh = PAD + laneBottom * 8 + (tb ? backLabelW : 0)

  // abstract coordinates: m along layers, c across them
  const mSize = dir === 'LR' ? nodeW : 0
  const placed: Placed[] = []
  if (dir === 'LR') {
    const colH = cols.map((c) => c.reduce((s, v) => s + placedBase[v].h, 0) + (c.length - 1) * 28)
    const H = Math.max(...colH)
    cols.forEach((col, l) => {
      let y = padLow + (H - colH[l]) / 2
      col.forEach((v) => {
        const pb = placedBase[v]
        placed[v] = { node: pb.node, lines: pb.lines, layer: l, m: PAD + l * (nodeW + gap), mSize, c: y, cSize: pb.h }
        y += pb.h + 28
      })
    })
    const width = PAD * 2 + L * nodeW + (L - 1) * gap
    const height = padLow + H + padHigh
    return finish(spec, placed, back, idx, layer, gap, labelLines, width, height, padLow, padHigh)
  }
  // TB: layers are rows
  const rowH = cols.map((c) => Math.max(...c.map((v) => placedBase[v].h)))
  const totalW = maxCross * nodeW + (maxCross - 1) * 32
  let y = PAD
  cols.forEach((col, l) => {
    const rowW = col.length * nodeW + (col.length - 1) * 32
    let x = padLow + (totalW - rowW) / 2
    col.forEach((v) => {
      const pb = placedBase[v]
      placed[v] = { node: pb.node, lines: pb.lines, layer: l, m: y + (rowH[l] - pb.h) / 2, mSize: pb.h, c: x, cSize: nodeW }
      x += nodeW + 32
    })
    y += rowH[l] + gap
  })
  const width = padLow + totalW + padHigh
  const height = y - gap + PAD
  return finish(spec, placed, back, idx, layer, gap, labelLines, width, height, padLow, padHigh)
}

function finish(
  spec: FlowSpec,
  placed: Placed[],
  back: Set<number>,
  idx: Map<string, number>,
  layer: number[],
  gap: number,
  labelLines: string[][],
  width: number,
  height: number,
  padLow: number,
  padHigh: number,
) {
  const { dir, edges } = spec
  const toXY = (m: number, c: number) => (dir === 'LR' ? [m, c] : [c, m])
  const pt = (m: number, c: number) => toXY(m, c).map((v) => Math.round(v)).join(' ')
  let topLane = 0
  let bottomLane = 0
  const outCount = new Map<string, number>()
  const inCount = new Map<string, number>()
  edges.forEach((e, i) => {
    if (back.has(i)) return
    outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1)
    inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1)
  })
  const routed: Routed[] = edges.map((edge, i) => {
    const a = placed[idx.get(edge.from)!]
    const b = placed[idx.get(edge.to)!]
    const isBack = back.has(i)
    const span = layer[idx.get(edge.to)!] - layer[idx.get(edge.from)!]
    const aC = a.c + a.cSize / 2
    const bC = b.c + b.cSize / 2
    const lines = labelLines[i]
    const lw = lines.length ? Math.max(...lines.map((l) => textWidth(l, LABEL_FONT, LABEL_TRACK))) + 12 : 0
    let d: string
    let lab: Routed['label']
    if (!isBack && span === 1) {
      const m1 = a.m + a.mSize
      const m2 = b.m
      const fanOut = (outCount.get(edge.from) ?? 0) > 1
      const fanIn = (inCount.get(edge.to) ?? 0) > 1
      const rise = fanOut ? m1 + 10 : fanIn ? m2 - 10 : m1 + (m2 - m1) / 2
      if (Math.abs(aC - bC) < 1) {
        d = `M${pt(m1, aC)}L${pt(m2, bC)}`
        const [lx, ly] = toXY((m1 + m2) / 2, aC)
        lab = lines.length ? { x: lx, y: ly, lines, w: lw } : undefined
      } else {
        d = `M${pt(m1, aC)}L${pt(rise, aC)}L${pt(rise, bC)}L${pt(m2, bC)}`
        // Labels sit where they cannot collide with a sibling edge's label:
        // fan-out edges on the run into their own target, fan-in edges on the
        // run out of their own source, otherwise on the riser.
        const [lx, ly] = fanOut ? toXY((rise + m2) / 2, bC) : fanIn ? toXY((m1 + rise) / 2, aC) : toXY(rise, (aC + bC) / 2)
        lab = lines.length ? { x: lx, y: ly, lines, w: lw } : undefined
      }
    } else if (isBack) {
      // out of the source's far side, around the bottom (LR) / right (TB), into the target's near side
      const lane = (dir === 'LR' ? height : width) - padHigh + 12 + bottomLane++ * 8
      const mA = a.m + a.mSize
      const mB = b.m
      const o = 14
      d = `M${pt(mA, aC)}L${pt(mA + o, aC)}L${pt(mA + o, lane)}L${pt(mB - o, lane)}L${pt(mB - o, bC)}L${pt(mB, bC)}`
      const [lx, ly] = dir === 'LR' ? toXY((mA + mB) / 2, lane) : toXY((mA + mB) / 2, lane + 8 + lw / 2)
      lab = lines.length ? { x: lx, y: ly, lines, w: lw } : undefined
    } else {
      const lane = padLow - 12 - topLane++ * 8
      const mA = a.m + a.mSize
      const mB = b.m
      const o = 14
      d = `M${pt(mA, aC)}L${pt(mA + o, aC)}L${pt(mA + o, lane)}L${pt(mB - o, lane)}L${pt(mB - o, bC)}L${pt(mB, bC)}`
      const [lx, ly] = dir === 'LR' ? toXY((mA + mB) / 2, lane) : toXY((mA + mB) / 2, lane - 8 - lw / 2)
      lab = lines.length ? { x: lx, y: ly, lines, w: lw } : undefined
    }
    return { edge, d, label: lab, back: isBack }
  })
  void gap
  return { placed, routed, width: Math.ceil(width), height: Math.ceil(height), dir }
}

function toRect(p: Placed, dir: 'LR' | 'TB') {
  return dir === 'LR'
    ? { x: p.m, y: p.c, w: p.mSize, h: p.cSize }
    : { x: p.c, y: p.m, w: p.cSize, h: p.mSize }
}

function NodeShape({ kind, x, y, w, h }: { kind: Kind; x: number; y: number; w: number; h: number }) {
  const base = { x, y, width: w, height: h, strokeWidth: 2, stroke: 'var(--ink)' }
  switch (kind) {
    case 'actor':
      return <rect {...base} fill="var(--paper)" strokeDasharray="4 4" />
    case 'model':
      return (
        <g>
          <rect {...base} fill="var(--surface)" />
          <rect x={x + 5} y={y + 5} width={w - 10} height={h - 10} fill="none" stroke="var(--hair-strong)" strokeWidth={1} />
        </g>
      )
    case 'store':
      return (
        <g>
          <rect {...base} fill="var(--surface)" />
          <path d={`M${x} ${y + 7}H${x + w}M${x} ${y + h - 7}H${x + w}`} stroke="var(--ink)" strokeWidth={1} />
        </g>
      )
    case 'tool':
      return (
        <g>
          <rect {...base} fill="var(--surface)" />
          <rect x={x} y={y} width={10} height={10} fill="var(--ink)" />
        </g>
      )
    case 'gate': {
      const c = 8
      const pts = `${x + c},${y} ${x + w - c},${y} ${x + w},${y + c} ${x + w},${y + h - c} ${x + w - c},${y + h} ${x + c},${y + h} ${x},${y + h - c} ${x},${y + c}`
      return <polygon points={pts} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} />
    }
    default:
      return <rect {...base} fill="var(--surface)" />
  }
}

export default function FlowDiagram({ spec, fallback }: { spec: FlowSpec; fallback: string }) {
  const fonts = useFontsReady()
  const [wrapRef, W] = useWidth<HTMLDivElement>()
  const [viewRef, inView] = useInView<HTMLDivElement>(false)
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  const [step, setStep] = useState(0)

  // Try the authored direction at full size, then compact, then stack it
  // top-to-bottom: a diagram should fit the column rather than scroll.
  const lay = useMemo(() => {
    if (!(W > 0 && fonts)) return null
    const tries: { dir: 'LR' | 'TB'; compact: boolean }[] =
      spec.dir === 'LR' ? [{ dir: 'LR', compact: false }, { dir: 'LR', compact: true }, { dir: 'TB', compact: false }] : [{ dir: 'TB', compact: false }]
    let out = layoutFlow(spec, W)
    for (const t of tries) {
      out = layoutFlow({ ...spec, dir: t.dir }, W, t.compact)
      if (out.width <= W) break
    }
    return out
  }, [spec, W, fonts])
  const order = useMemo(() => {
    // edges in the order the data moves: by source layer, then declaration
    if (!lay) return []
    const layerOf = new Map(lay.placed.map((p) => [p.node.id, p.layer]))
    return lay.routed
      .map((r, i) => ({ i, l: layerOf.get(r.edge.from) ?? 0, back: r.back }))
      .sort((a, b) => Number(a.back) - Number(b.back) || a.l - b.l || a.i - b.i)
      .map((o) => o.i)
  }, [lay])

  useEffect(() => {
    if (!playing || !inView || order.length === 0) return
    const t = window.setInterval(() => setStep((s) => (s + 1) % order.length), 1300)
    return () => clearInterval(t)
  }, [playing, inView, order.length])

  const active = order.length ? order[step % order.length] : -1
  const activeRoute = lay && active >= 0 ? lay.routed[active] : null
  const nodeById = new Map(spec.nodes.map((n) => [n.id, n]))

  return (
    <div ref={viewRef} className="diagram not-prose my-8">
      <div ref={wrapRef} className="w-full overflow-x-auto">
        {lay ? (
          <svg
            width={lay.width}
            height={lay.height}
            viewBox={`0 0 ${lay.width} ${lay.height}`}
            role="img"
            aria-label={`Flow diagram: ${spec.edges.map((e) => `${nodeById.get(e.from)?.label} to ${nodeById.get(e.to)?.label}`).join('; ')}`}
            shapeRendering="crispEdges"
            className="mx-auto block"
          >
            <defs>
              <marker id="fl-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0 0L8 4L0 8z" fill="var(--ink)" />
              </marker>
              <marker id="fl-arrow-on" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0 0L8 4L0 8z" fill="var(--accent)" />
              </marker>
            </defs>
            {lay.routed.map((r, i) => {
              const on = i === active
              return (
                <path
                  key={`e${i}`}
                  d={r.d}
                  fill="none"
                  stroke={on ? 'var(--accent)' : 'var(--ink)'}
                  strokeOpacity={on ? 1 : 0.7}
                  strokeWidth={on ? 2 : 1}
                  strokeDasharray={r.edge.dashed ? '4 4' : undefined}
                  markerEnd={on ? 'url(#fl-arrow-on)' : 'url(#fl-arrow)'}
                />
              )
            })}
            {lay.placed.map((p) => {
              const r = toRect(p, lay.dir)
              const isEnd = activeRoute && (activeRoute.edge.from === p.node.id || activeRoute.edge.to === p.node.id)
              const lineH = LINE_H
              const top = r.y + (r.h - p.lines.length * lineH) / 2 + lineH / 2 + 5
              return (
                <g key={p.node.id}>
                  <NodeShape kind={p.node.kind} x={r.x} y={r.y} w={r.w} h={r.h} />
                  {isEnd && <rect x={r.x - 4} y={r.y - 4} width={r.w + 8} height={r.h + 8} fill="none" stroke="var(--accent)" strokeWidth={1} strokeDasharray="2 2" />}
                  {p.lines.map((ln, k) => (
                    <text key={k} x={r.x + r.w / 2} y={top + k * lineH - 4} textAnchor="middle" fontSize={16}>
                      {ln}
                    </text>
                  ))}
                </g>
              )
            })}
            {lay.routed.map((r, i) =>
              r.label ? (
                <g key={`l${i}`}>
                  <rect
                    x={r.label.x - r.label.w / 2}
                    y={r.label.y - (r.label.lines.length * 16) / 2 - 1}
                    width={r.label.w}
                    height={r.label.lines.length * 16 + 2}
                    fill="var(--paper)"
                  />
                  {r.label.lines.map((ln, k) => (
                    <text
                      key={k}
                      className="lbl"
                      x={r.label!.x}
                      y={r.label!.y - (r.label!.lines.length * 16) / 2 + 12 + k * 16}
                      textAnchor="middle"
                      fontSize={12}
                      style={i === active ? { fill: 'var(--accent)' } : undefined}
                    >
                      {ln}
                    </text>
                  ))}
                </g>
              ) : null,
            )}
            {activeRoute && playing && !prefersReducedMotion() && (
              <rect key={`pk${step}`} width={8} height={8} x={-4} y={-4} fill="var(--accent)">
                <animateMotion dur="1s" repeatCount="1" fill="freeze" path={activeRoute.d} calcMode="linear" />
              </rect>
            )}
          </svg>
        ) : (
          <pre className="p-4 text-[16px]">{fallback}</pre>
        )}
      </div>
      {lay && (
        <div className="flex items-center gap-3 border-t border-hair px-4 py-2">
          <button
            type="button"
            className="tool"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause flow' : 'Play flow'}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className="tool"
            onClick={() => {
              setPlaying(false)
              setStep((s) => (s + 1) % Math.max(order.length, 1))
            }}
            aria-label="Next step"
          >
            Step
          </button>
          <span className="label num">
            {order.length ? (step % order.length) + 1 : 0}/{order.length}
          </span>
          {activeRoute && (
            <span className="label min-w-0 flex-1 truncate text-ink" aria-live="off">
              {nodeById.get(activeRoute.edge.from)?.label} {'->'} {nodeById.get(activeRoute.edge.to)?.label}
              {activeRoute.edge.label ? `: ${activeRoute.edge.label}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
