// A small frame model for algorithm walk-throughs. A scene is a list of frames
// produced by actually running the algorithm, so every state shown is one the
// algorithm really reaches.

export type Tone = 'on' | 'done' | 'hit' | 'dim'

export interface Cell {
  v: string | number
  tone?: Tone
}

export interface Pointer {
  name: string
  at: number
}

export interface ArrayPanel {
  kind: 'array'
  title?: string
  cells: Cell[]
  pointers?: Pointer[]
  /** Inclusive index range drawn as a window frame. */
  window?: [number, number]
  /** Show 0..n-1 under the cells (default true). */
  indices?: boolean
}

export interface GridPanel {
  kind: 'grid'
  title?: string
  cells: Cell[][]
  /** Header labels for columns and rows (DP tables). */
  cols?: (string | number)[]
  rows?: (string | number)[]
  /** Cells to outline as the current focus. */
  focus?: [number, number][]
}

export interface GraphNode {
  id: string
  label: string
  x: number
  y: number
  tone?: Tone
  sub?: string
}
export interface GraphEdge {
  a: string
  b: string
  w?: number | string
  directed?: boolean
  tone?: Tone
}
export interface GraphPanel {
  kind: 'graph'
  title?: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  width: number
  height: number
}

export interface ListPanel {
  kind: 'list'
  title?: string
  items: Cell[]
  /** next[i] = index this node points to, or null. */
  next: (number | null)[]
  pointers?: Pointer[]
}

export interface StackPanel {
  kind: 'stack'
  title?: string
  items: (string | number)[]
  /** horizontal queue instead of a vertical stack */
  queue?: boolean
}

export interface KvPanel {
  kind: 'kv'
  title?: string
  entries: [string, string][]
}

export type Panel = ArrayPanel | GridPanel | GraphPanel | ListPanel | StackPanel | KvPanel

export interface Frame {
  note: string
  /** Pseudocode line to highlight (0-based). */
  line?: number
  panels: Panel[]
  vars?: [string, string | number][]
}

export interface Scene {
  id: string
  title: string
  /** Pattern key this scene teaches, when it is one of the pattern cards. */
  pattern?: string
  /** One line: the input and the question. */
  setup: string
  code: string[]
  frames: () => Frame[]
}

/** Binary tree from a level-order array (null = missing child), laid out by in-order index. */
export function binaryTreeLayout(
  values: (number | string | null)[],
  tones: Record<number, Tone | undefined> = {},
  dx = 56,
  dy = 60,
): { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  let order = 0
  let maxDepth = 0
  const walk = (i: number, depth: number) => {
    if (i >= values.length || values[i] === null) return
    maxDepth = Math.max(maxDepth, depth)
    walk(2 * i + 1, depth + 1)
    nodes.push({ id: String(i), label: String(values[i]), x: 28 + order * dx, y: 28 + depth * dy, tone: tones[i] })
    order++
    walk(2 * i + 2, depth + 1)
  }
  walk(0, 0)
  const has = new Set(nodes.map((n) => n.id))
  for (const n of nodes) {
    const i = Number(n.id)
    for (const c of [2 * i + 1, 2 * i + 2]) if (has.has(String(c))) edges.push({ a: n.id, b: String(c) })
  }
  return { nodes, edges, width: 56 + Math.max(0, order - 1) * dx, height: 56 + maxDepth * dy }
}
