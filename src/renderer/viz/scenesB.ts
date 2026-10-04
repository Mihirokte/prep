import type { Frame, GraphEdge, GraphNode, Scene, Tone } from './types'
import { binaryTreeLayout } from './types'
import { arr, frame, range } from './util'

// Scenes: trees, graphs, heaps, backtracking, grids.

const TREE = [3, 9, 20, null, null, 15, 7]

/* ------------------------------------------------------------------ tree bfs */
const treeBfs: Scene = {
  id: 'tree-bfs',
  pattern: 'tree-bfs',
  title: 'Tree breadth-first search',
  setup: 'Level-order traversal: finish a level before starting the next.',
  code: [
    'q = deque([root]); out = []',
    'while q:',
    '    level = []',
    '    for _ in range(len(q)):',
    '        node = q.popleft(); level.append(node.val)',
    '        q.extend(c for c in (node.left, node.right) if c)',
    '    out.append(level)',
  ],
  frames() {
    const out: Frame[] = []
    const tones: Record<number, Tone | undefined> = {}
    const queue = [0]
    const levels: string[] = []
    const snap = (note: string, line: number) => {
      const t = binaryTreeLayout(TREE, tones)
      out.push(frame(note, [{ kind: 'graph', title: 'tree', ...t }, { kind: 'stack', title: 'queue', queue: true, items: queue.map((i) => String(TREE[i])) }, { kind: 'kv', title: 'levels', entries: levels.map((l, k) => [`level ${k}`, l] as [string, string]) }], { line }))
    }
    snap('Start with the root in the queue. The queue holds the current level, then its children behind it.', 0)
    while (queue.length) {
      const size = queue.length
      const level: number[] = []
      snap(`A new level begins: ${size} node${size > 1 ? 's' : ''} are in the queue, so process exactly ${size}.`, 3)
      for (let k = 0; k < size; k++) {
        const i = queue.shift()!
        tones[i] = 'on'
        level.push(TREE[i] as number)
        snap(`Pop ${TREE[i]}. Visit it.`, 4)
        const kids = [2 * i + 1, 2 * i + 2].filter((c) => c < TREE.length && TREE[c] !== null)
        queue.push(...kids)
        tones[i] = 'done'
        if (kids.length) snap(`Enqueue its children: ${kids.map((c) => TREE[c]).join(', ')}.`, 5)
      }
      levels.push(level.join(', '))
      snap(`Level done: [${level.join(', ')}].`, 6)
    }
    return out
  },
}

/* ------------------------------------------------------------------ tree dfs */
const treeDfs: Scene = {
  id: 'tree-dfs',
  pattern: 'tree-dfs',
  title: 'Tree depth-first search',
  setup: 'Maximum depth: each node asks its children, then answers.',
  code: [
    'def depth(node):',
    '    if not node: return 0',
    '    return 1 + max(depth(node.left), depth(node.right))',
  ],
  frames() {
    const out: Frame[] = []
    const tones: Record<number, Tone | undefined> = {}
    const stack: string[] = []
    const result: Record<number, number> = {}
    const snap = (note: string, line: number) => {
      const t = binaryTreeLayout(TREE, tones)
      out.push(frame(note, [{ kind: 'graph', title: 'tree', ...t }, { kind: 'stack', title: 'call stack', items: [...stack] }, { kind: 'kv', title: 'depth(node)', entries: Object.entries(result).map(([i, d]) => [String(TREE[Number(i)]), String(d)] as [string, string]) }], { line }))
    }
    const go = (i: number): number => {
      if (i >= TREE.length || TREE[i] === null) return 0
      tones[i] = 'on'
      stack.push(`depth(${TREE[i]})`)
      snap(`Call depth(${TREE[i]}). It cannot answer until both children have.`, 2)
      const l = go(2 * i + 1)
      const r = go(2 * i + 2)
      const d = 1 + Math.max(l, r)
      result[i] = d
      tones[i] = 'hit'
      snap(`depth(${TREE[i]}) = 1 + max(${l}, ${r}) = ${d}. Return it to the caller.`, 2)
      tones[i] = 'done'
      stack.pop()
      return d
    }
    snap('DFS goes all the way down one branch before backing up. The call stack is the "where am I" bookkeeping.', 0)
    go(0)
    return out
  },
}

/* ------------------------------------------------------------------ graph traversal (grid) */
const gridBfs: Scene = {
  id: 'graph-traversal',
  pattern: 'graph-traversal',
  title: 'Grid flood fill: count islands',
  setup: '1 is land. Each flood fill marks one whole island so it is counted once.',
  code: [
    'for r, c in every cell:',
    '    if grid[r][c] == 1:',
    '        islands += 1',
    '        flood(r, c)   # BFS/DFS, mark 1 -> 0',
    'return islands',
  ],
  frames() {
    const G = [
      [1, 1, 0, 0, 0],
      [1, 0, 0, 1, 1],
      [0, 0, 0, 1, 1],
      [1, 0, 0, 0, 0],
    ]
    const R = G.length
    const C = G[0].length
    const state: string[][] = G.map((row) => row.map((v) => (v ? 'land' : 'water')))
    const out: Frame[] = []
    let islands = 0
    const snap = (note: string, line: number, focus: [number, number][] = []) =>
      out.push(
        frame(note, [{ kind: 'grid', title: 'grid', cells: state.map((row) => row.map((s) => ({ v: s === 'water' ? '.' : s === 'land' ? 1 : 'x', tone: (s === 'land' ? undefined : s === 'water' ? 'dim' : s === 'edge' ? 'on' : 'done') as Tone | undefined }))), focus }], { line, vars: [['islands', islands]] }),
      )
    snap('Scan every cell. Water is dim. The first unvisited 1 we meet starts a new island.', 0)
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        if (state[r][c] !== 'land') continue
        islands++
        state[r][c] = 'edge'
        snap(`Found land at (${r}, ${c}): island number ${islands}. Flood it so we never count it again.`, 2, [[r, c]])
        let front: [number, number][] = [[r, c]]
        while (front.length) {
          const nextFront: [number, number][] = []
          for (const [y, x] of front)
            for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const ny = y + dy
              const nx = x + dx
              if (ny >= 0 && ny < R && nx >= 0 && nx < C && state[ny][nx] === 'land') {
                state[ny][nx] = 'edge'
                nextFront.push([ny, nx])
              }
            }
          front.forEach(([y, x]) => (state[y][x] = 'seen'))
          if (nextFront.length) snap(`Spread to the ${nextFront.length} connected land cell${nextFront.length > 1 ? 's' : ''} next to the frontier.`, 3, nextFront)
          front = nextFront
        }
        snap(`Island ${islands} is fully marked.`, 3)
      }
    snap(`No unvisited land left. Islands: ${islands}. Every cell was visited at most once: O(rows x cols).`, 4)
    return out
  },
}

/* ------------------------------------------------------------------ topological sort */
const DAG_NODES: GraphNode[] = [
  { id: 'A', label: 'A', x: 30, y: 50 },
  { id: 'B', label: 'B', x: 30, y: 130 },
  { id: 'C', label: 'C', x: 150, y: 20 },
  { id: 'D', label: 'D', x: 150, y: 90 },
  { id: 'E', label: 'E', x: 150, y: 160 },
  { id: 'F', label: 'F', x: 270, y: 90 },
]
const DAG_EDGES: [string, string][] = [['A', 'C'], ['A', 'D'], ['B', 'D'], ['B', 'E'], ['C', 'F'], ['D', 'F']]

const topo: Scene = {
  id: 'topological-sort',
  pattern: 'topological-sort',
  title: 'Topological sort (Kahn)',
  setup: 'Tasks with prerequisites. Arrows mean "must finish before".',
  code: [
    'indeg = count prerequisites per node',
    'q = [n for n in nodes if indeg[n] == 0]',
    'while q:',
    '    n = q.pop(0); order.append(n)',
    '    for m in graph[n]:',
    '        indeg[m] -= 1',
    '        if indeg[m] == 0: q.append(m)',
    'return order if len(order) == len(nodes) else []  # [] = cycle',
  ],
  frames() {
    const indeg: Record<string, number> = Object.fromEntries(DAG_NODES.map((n) => [n.id, 0]))
    for (const [, b] of DAG_EDGES) indeg[b]++
    const done = new Set<string>()
    const order: string[] = []
    const q = DAG_NODES.filter((n) => indeg[n.id] === 0).map((n) => n.id)
    const out: Frame[] = []
    let cur: string | null = null
    const snap = (note: string, line: number) =>
      out.push(
        frame(note, [
          {
            kind: 'graph',
            title: 'graph (number = unmet prerequisites)',
            width: 300,
            height: 190,
            nodes: DAG_NODES.map((n) => ({ ...n, sub: String(indeg[n.id]), tone: (cur === n.id ? 'on' : done.has(n.id) ? 'done' : q.includes(n.id) ? 'hit' : undefined) as Tone | undefined })),
            edges: DAG_EDGES.map(([a, b]) => ({ a, b, directed: true, tone: (done.has(a) ? 'dim' : undefined) as Tone | undefined })),
          },
          { kind: 'stack', title: 'ready queue', queue: true, items: [...q] },
          arr(order, { title: 'order', indices: false }),
        ], { line }),
      )
    snap('Nodes with zero unmet prerequisites are ready. Start the queue with them.', 1)
    while (q.length) {
      const n = q.shift()!
      cur = n
      order.push(n)
      snap(`Take ${n}: nothing blocks it. Append to the order.`, 3)
      for (const [a, b] of DAG_EDGES)
        if (a === n) {
          indeg[b]--
          snap(`${n} is finished, so ${b} has one fewer prerequisite (${indeg[b]} left).${indeg[b] === 0 ? ` ${b} is now ready.` : ''}`, indeg[b] === 0 ? 6 : 5)
          if (indeg[b] === 0) q.push(b)
        }
      done.add(n)
      cur = null
    }
    snap(`Order: ${order.join(' -> ')}. All ${DAG_NODES.length} nodes placed, so there was no cycle. If some were left over, a cycle would be blocking them.`, 7)
    return out
  },
}

/* ------------------------------------------------------------------ dijkstra */
const DJ_NODES: GraphNode[] = [
  { id: 'S', label: 'S', x: 30, y: 85 },
  { id: 'A', label: 'A', x: 140, y: 20 },
  { id: 'B', label: 'B', x: 140, y: 150 },
  { id: 'C', label: 'C', x: 260, y: 85 },
  { id: 'T', label: 'T', x: 370, y: 85 },
]
const DJ_EDGES: [string, string, number][] = [['S', 'A', 2], ['S', 'B', 5], ['A', 'B', 1], ['A', 'C', 6], ['B', 'C', 2], ['C', 'T', 1]]

const dijkstra: Scene = {
  id: 'weighted-shortest-path',
  pattern: 'weighted-shortest-path',
  title: 'Dijkstra',
  setup: 'Cheapest path from S to every node. Weights are non-negative.',
  code: [
    'dist = {S: 0}; pq = [(0, S)]',
    'while pq:',
    '    d, u = heappop(pq)',
    '    if d > dist[u]: continue   # stale entry',
    '    for v, w in graph[u]:',
    '        if d + w < dist.get(v, inf):',
    '            dist[v] = d + w; heappush(pq, (d + w, v))',
  ],
  frames() {
    const dist: Record<string, number> = { S: 0 }
    const done = new Set<string>()
    const pq: [number, string][] = [[0, 'S']]
    const out: Frame[] = []
    let cur: string | null = null
    let hot: string | null = null
    const snap = (note: string, line: number) =>
      out.push(
        frame(note, [
          {
            kind: 'graph',
            title: 'graph (number under a node = best known distance)',
            width: 400,
            height: 170,
            nodes: DJ_NODES.map((n) => ({ ...n, sub: dist[n.id] === undefined ? 'inf' : String(dist[n.id]), tone: (cur === n.id ? 'on' : hot === n.id ? 'hit' : done.has(n.id) ? 'done' : undefined) as Tone | undefined })),
            edges: DJ_EDGES.map(([a, b, w]) => ({ a, b, w, tone: (cur === a && hot === b ? 'hit' : undefined) as Tone | undefined })),
          },
          { kind: 'stack', title: 'priority queue (cheapest first)', queue: true, items: [...pq].sort((x, y) => x[0] - y[0]).map(([d, n]) => `${n}:${d}`) },
        ], { line }),
      )
    snap('Start at S with distance 0. The queue always hands us the cheapest frontier node next.', 0)
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0])
      const [d, u] = pq.shift()!
      if (d > dist[u]) continue
      cur = u
      hot = null
      snap(`Pop ${u} with distance ${d}. No cheaper route to ${u} can exist: every other frontier node costs at least as much.`, 2)
      for (const [a, b, w] of DJ_EDGES) {
        const [from, to] = a === u ? [a, b] : b === u ? [b, a] : [null, null]
        if (!from || !to || done.has(to)) continue
        hot = to
        const old = dist[to]
        if (d + w < (old ?? Infinity)) {
          dist[to] = d + w
          pq.push([d + w, to])
          snap(`Relax ${u} -> ${to} (weight ${w}): ${d} + ${w} = ${d + w} beats ${old === undefined ? 'infinity' : old}. Update and queue ${to}.`, 6)
        } else {
          snap(`${u} -> ${to}: ${d} + ${w} = ${d + w} is no better than ${dist[to]}. Skip.`, 5)
        }
      }
      done.add(u)
      cur = null
      hot = null
    }
    snap(`Done. Distances: ${DJ_NODES.map((n) => `${n.id}=${dist[n.id]}`).join(', ')}. The cheapest route to T is S -> A -> B -> C -> T.`, 6)
    return out
  },
}

/* ------------------------------------------------------------------ union-find */
const unionFind: Scene = {
  id: 'union-find',
  pattern: 'union-find',
  title: 'Union-Find',
  setup: 'Six people, merge friend groups, ask who is connected.',
  code: [
    'parent = list(range(n))',
    'def find(x):',
    '    while parent[x] != x:',
    '        parent[x] = parent[parent[x]]   # path halving',
    '        x = parent[x]',
    '    return x',
    'def union(a, b): parent[find(a)] = find(find(b))',
  ],
  frames() {
    const n = 6
    const parent = Array.from({ length: n }, (_, i) => i)
    const out: Frame[] = []
    const find = (x: number) => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]]
        x = parent[x]
      }
      return x
    }
    const roots = () => new Set(parent.map((_, i) => find(i))).size
    const snap = (note: string, line: number, hot: number[] = []) => {
      const tones: Record<number, Tone | undefined> = {}
      parent.forEach((p, i) => {
        tones[i] = hot.includes(i) ? 'hit' : p === i ? 'on' : 'done'
      })
      out.push(frame(note, [arr(Array.from({ length: n }, (_, i) => i), { title: 'person', tones }), arr(parent, { title: 'parent (a root points at itself)', indices: false, tones })], { line, vars: [['groups', roots()]] }))
    }
    snap('Everyone starts as their own root. parent[i] = i.', 0)
    for (const [a, b] of [[0, 1], [2, 3], [1, 3], [4, 5], [3, 5]]) {
      const ra = find(a)
      const rb = find(b)
      snap(`union(${a}, ${b}): the roots are ${ra} and ${rb}.`, 6, [a, b])
      if (ra !== rb) {
        parent[ra] = rb
        snap(`Different roots, so point ${ra} at ${rb}. The two groups are now one.`, 6, [ra, rb])
      } else snap(`Same root already, nothing to merge.`, 6)
    }
    snap(`Everyone shares root ${find(0)}: find(0) == find(5). Each find is almost constant time thanks to path halving.`, 1)
    return out
  },
}

/* ------------------------------------------------------------------ subsets / backtracking */
const subsets: Scene = {
  id: 'subsets',
  pattern: 'subsets',
  title: 'Backtracking: all subsets',
  setup: 'Choose or skip each of [1, 2, 3]; undo after exploring.',
  code: [
    'def go(i, path):',
    '    if i == len(nums): out.append(path[:]); return',
    '    path.append(nums[i]); go(i + 1, path)   # choose',
    '    path.pop();          go(i + 1, path)   # undo, then skip',
  ],
  frames() {
    const nums = [1, 2, 3]
    const out: Frame[] = []
    const path: number[] = []
    const found: string[] = []
    const snap = (i: number, note: string, line: number) =>
      out.push(frame(note, [arr(nums, { title: 'decision at index i', tones: { ...range(0, i - 1, 'done'), ...(i < nums.length ? { [i]: 'on' } : {}) }, pointers: i < nums.length ? [{ name: 'i', at: i }] : [] }), { kind: 'stack', title: 'path (choices so far)', queue: true, items: [...path] }, { kind: 'kv', title: `results (${found.length}/8)`, entries: found.map((f, k) => [String(k + 1), f] as [string, string]) }], { line }))
    const go = (i: number) => {
      if (i === nums.length) {
        found.push(`[${path.join(',')}]`)
        snap(i, `Every element decided: record [${path.join(', ')}].`, 1)
        return
      }
      path.push(nums[i])
      snap(i, `Choose ${nums[i]}: add it to the path, then decide the next element.`, 2)
      go(i + 1)
      path.pop()
      snap(i, `Back from that branch: undo ${nums[i]} (pop), then try skipping it.`, 3)
      go(i + 1)
    }
    go(0)
    out.push(frame('2 choices per element over 3 elements = 2^3 = 8 subsets. Backtracking walked every leaf exactly once and reused one path list by undoing moves.', [{ kind: 'kv', title: 'results (8/8)', entries: found.map((f, k) => [String(k + 1), f] as [string, string]) }]))
    return out
  },
}

/* ------------------------------------------------------------------ top k */
const topK: Scene = {
  id: 'top-k-elements',
  pattern: 'top-k-elements',
  title: 'Top K with a min-heap',
  setup: 'Keep the 3 largest numbers from a stream.',
  code: [
    'heap = []',
    'for v in stream:',
    '    heappush(heap, v)',
    '    if len(heap) > k: heappop(heap)   # evict the smallest',
    'return heap',
  ],
  frames() {
    const stream = [5, 1, 9, 3, 7, 2, 8]
    const k = 3
    const heap: number[] = []
    const out: Frame[] = []
    const show = (i: number, note: string, line: number, evicted?: number) =>
      out.push(frame(note, [arr(stream, { title: 'stream', tones: { ...range(0, i - 1, 'done'), [i]: 'on' } }), arr([...heap].sort((a, b) => a - b), { title: `heap, size <= ${k} (smallest first)`, indices: false, tones: { 0: 'hit' } }), ...(evicted !== undefined ? [{ kind: 'kv' as const, title: 'evicted', entries: [['value', String(evicted)]] as [string, string][] }] : [])], { line }))
    for (let i = 0; i < stream.length; i++) {
      heap.push(stream[i])
      heap.sort((a, b) => a - b)
      if (heap.length > k) {
        const ev = heap.shift()!
        show(i, `Push ${stream[i]}. The heap has ${k + 1} items, one too many, so pop the smallest (${ev}). It can never be in the top ${k}.`, 3, ev)
      } else show(i, `Push ${stream[i]}. Fewer than ${k} items, keep it.`, 2)
    }
    out.push(frame(`The heap holds the ${k} largest values: ${heap.join(', ')}. Memory stayed O(k) and each item cost O(log k), not a full sort.`, [arr([...heap], { title: 'answer', indices: false, tones: range(0, k - 1, 'hit') })], { line: 4 }))
    return out
  },
}

/* ------------------------------------------------------------------ two heaps */
const twoHeaps: Scene = {
  id: 'two-heaps',
  pattern: 'two-heaps',
  title: 'Two heaps: running median',
  setup: 'Stream 5, 15, 1, 3. Median after each number.',
  code: [
    'lo = max-heap (smaller half), hi = min-heap (larger half)',
    'push into lo, move lo.top to hi',
    'if len(hi) > len(lo): move hi.top back to lo',
    'median = lo.top if odd else (lo.top + hi.top) / 2',
  ],
  frames() {
    const lo: number[] = []
    const hi: number[] = []
    const out: Frame[] = []
    const show = (note: string, line: number, med?: number | string) =>
      out.push(frame(note, [{ kind: 'stack', title: 'lo: max-heap (smaller half, top on the right)', queue: true, items: [...lo].sort((a, b) => a - b) }, { kind: 'stack', title: 'hi: min-heap (larger half, top on the left)', queue: true, items: [...hi].sort((a, b) => a - b) }], { line, vars: med !== undefined ? [['median', med]] : undefined }))
    show('The median sits between two halves. Keep the smaller half in a max-heap and the larger half in a min-heap; their tops are the middle values.', 0)
    for (const v of [5, 15, 1, 3]) {
      lo.push(v)
      lo.sort((a, b) => a - b)
      const top = lo.pop()!
      hi.push(top)
      hi.sort((a, b) => a - b)
      if (hi.length > lo.length) lo.push(hi.shift()!)
      lo.sort((a, b) => a - b)
      const med = lo.length > hi.length ? lo[lo.length - 1] : (lo[lo.length - 1] + hi[0]) / 2
      show(`Add ${v}: it goes through lo to hi so the halves stay ordered, then the sizes are rebalanced. Median is ${med}.`, 3, med)
    }
    return out
  },
}

/* ------------------------------------------------------------------ k-way merge */
const kWay: Scene = {
  id: 'k-way-merge',
  pattern: 'k-way-merge',
  title: 'K-way merge',
  setup: 'Merge three sorted lists with a min-heap holding one head per list.',
  code: [
    'heap = [(lst[0], i, 0) for i, lst in enumerate(lists)]',
    'heapify(heap)',
    'while heap:',
    '    v, i, j = heappop(heap); out.append(v)',
    '    if j + 1 < len(lists[i]): heappush(heap, (lists[i][j+1], i, j+1))',
  ],
  frames() {
    const lists = [[1, 4, 7], [2, 5, 8], [3, 6, 9]]
    const ptr = [0, 0, 0]
    const merged: number[] = []
    const out: Frame[] = []
    const show = (note: string, line: number, picked?: number) =>
      out.push(frame(note, [...lists.map((l, i) => arr(l, { title: `list ${i + 1}`, indices: false, tones: { ...range(0, ptr[i] - 1, 'done'), ...(picked === i ? { [ptr[i] - 1]: 'hit' } : {}) }, pointers: ptr[i] < l.length ? [{ name: 'head', at: ptr[i] }] : [] })), arr(merged, { title: 'merged', indices: false })], { line }))
    show('The heap holds only the current head of each list. The smallest of those is the next value overall.', 0)
    while (ptr.some((p, i) => p < lists[i].length)) {
      let best = -1
      lists.forEach((l, i) => { if (ptr[i] < l.length && (best < 0 || l[ptr[i]] < lists[best][ptr[best]])) best = i })
      merged.push(lists[best][ptr[best]])
      ptr[best]++
      show(`Pop ${merged[merged.length - 1]} from list ${best + 1}, then push that list's next head.`, 3, best)
    }
    return out
  },
}

/* ------------------------------------------------------------------ greedy */
const greedy: Scene = {
  id: 'greedy',
  pattern: 'greedy',
  title: 'Greedy: jump game',
  setup: 'Each value is the max jump length. Can you reach the last index?',
  code: [
    'reach = 0',
    'for i, jump in enumerate(nums):',
    '    if i > reach: return False   # stranded',
    '    reach = max(reach, i + jump)',
    'return True',
  ],
  frames() {
    const nums = [2, 3, 1, 1, 4]
    const out: Frame[] = []
    let reach = 0
    out.push(frame('Track only one number: the furthest index reachable so far. No backtracking, no table.', [arr(nums, { pointers: [{ name: 'reach', at: 0 }] })], { line: 0, vars: [['reach', 0]] }))
    for (let i = 0; i < nums.length; i++) {
      reach = Math.max(reach, i + nums[i])
      out.push(frame(`At index ${i} you can jump ${nums[i]}, so reach = max(previous, ${i} + ${nums[i]}) = ${Math.min(reach, 99)}.`, [arr(nums, { window: [0, Math.min(reach, nums.length - 1)], tones: { [i]: 'on' }, pointers: [{ name: 'reach', at: Math.min(reach, nums.length - 1) }] })], { line: 3, vars: [['i', i], ['reach', reach]] }))
      if (reach >= nums.length - 1) {
        out.push(frame(`reach ${reach} >= last index ${nums.length - 1}. Reachable. One pass, O(n), because the locally best "furthest reach" is always safe to keep.`, [arr(nums, { tones: { [nums.length - 1]: 'hit' }, window: [0, nums.length - 1] })], { line: 4 }))
        break
      }
    }
    return out
  },
}

/* ------------------------------------------------------------------ knapsack */
const knapsack: Scene = {
  id: 'knapsack-dp',
  pattern: 'knapsack-dp',
  title: '0/1 knapsack',
  setup: 'Capacity 7. Items (weight, value): (1,1) (3,4) (4,5) (5,7).',
  code: [
    'dp = [[0] * (cap + 1) for _ in range(n + 1)]',
    'for i, (w, v) in enumerate(items, 1):',
    '    for c in range(cap + 1):',
    '        dp[i][c] = dp[i-1][c]                  # skip it',
    '        if c >= w: dp[i][c] = max(dp[i][c], dp[i-1][c-w] + v)   # take it',
  ],
  frames() {
    const items = [[1, 1], [3, 4], [4, 5], [5, 7]]
    const cap = 7
    const dp = Array.from({ length: items.length + 1 }, () => Array<number>(cap + 1).fill(0))
    const out: Frame[] = []
    const table = (rowsDone: number, focus: [number, number][]) => ({
      kind: 'grid' as const,
      title: 'dp[i][c] = best value using the first i items with capacity c',
      cols: Array.from({ length: cap + 1 }, (_, c) => c),
      rows: ['-', ...items.map((it) => `${it[0]}/${it[1]}`)],
      cells: dp.map((row, i) => row.map((v, c) => ({ v: i <= rowsDone ? v : '', tone: (focus.some(([r, k]) => r === i && k === c) ? 'on' : i <= rowsDone ? 'done' : undefined) as Tone | undefined }))),
      focus,
    })
    out.push(frame('Row 0: no items, value 0 at every capacity. Each new row decides one more item: skip it (copy the cell above) or take it (value plus the best for the leftover room).', [table(0, [])], { line: 0 }))
    for (let i = 1; i <= items.length; i++) {
      const [w, v] = items[i - 1]
      for (let c = 0; c <= cap; c++) {
        dp[i][c] = dp[i - 1][c]
        if (c >= w) dp[i][c] = Math.max(dp[i][c], dp[i - 1][c - w] + v)
      }
      out.push(frame(`Item ${i} (weight ${w}, value ${v}): for each capacity take max(skip, take). Skip copies the row above; take looks ${w} columns back in the row above.`, [table(i, [[i, cap]])], { line: 4 }))
    }
    out.push(frame(`Best value at capacity ${cap}: ${dp[items.length][cap]}. Looping c downward lets a 1-D array replace the table, because each item must be used at most once.`, [table(items.length, [[items.length, cap]])], { line: 4 }))
    return out
  },
}

/* ------------------------------------------------------------------ trie */
const trie: Scene = {
  id: 'trie',
  pattern: 'trie',
  title: 'Trie',
  setup: 'Insert "car", "cat", "dog" and look up a prefix.',
  code: [
    'node = root',
    'for ch in word:',
    '    node = node.children.setdefault(ch, Node())',
    'node.end = True',
  ],
  frames() {
    interface T { ch: string; kids: T[]; end: boolean; id: string }
    const root: T = { ch: '*', kids: [], end: false, id: 'r' }
    const out: Frame[] = []
    let cnt = 0
    const layout = (hot: string[], note: string, line: number) => {
      const nodes: GraphNode[] = []
      const edges: GraphEdge[] = []
      let leaf = 0
      const place = (t: T, d: number): number => {
        const xs = t.kids.map((k) => place(k, d + 1))
        const x = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : 30 + leaf++ * 64
        nodes.push({ id: t.id, label: t.ch, x, y: 28 + d * 56, tone: (hot.includes(t.id) ? 'hit' : t.end ? 'done' : undefined) as Tone | undefined })
        t.kids.forEach((k) => edges.push({ a: t.id, b: k.id }))
        return x
      }
      place(root, 0)
      const depth = Math.max(...nodes.map((n) => n.y))
      out.push(frame(note, [{ kind: 'graph', title: 'trie (shaded = a word ends here)', nodes, edges, width: Math.max(...nodes.map((n) => n.x)) + 30, height: depth + 30 }], { line }))
    }
    layout([], 'A trie stores words by shared prefix. Each edge is one letter; a shaded node marks where a word ends.', 0)
    for (const w of ['car', 'cat', 'dog']) {
      let node = root
      const path: string[] = ['r']
      for (const ch of w) {
        let kid = node.kids.find((k) => k.ch === ch)
        const fresh = !kid
        if (!kid) {
          kid = { ch, kids: [], end: false, id: `n${cnt++}` }
          node.kids.push(kid)
        }
        node = kid
        path.push(node.id)
        layout(path, fresh ? `Insert "${w}": no '${ch}' edge here yet, create it.` : `Insert "${w}": the '${ch}' edge already exists (shared prefix), follow it for free.`, 2)
      }
      node.end = true
      layout(path, `Mark the end of "${w}".`, 3)
    }
    const walk: string[] = ['r']
    let node = root
    for (const ch of 'ca') {
      node = node.kids.find((k) => k.ch === ch)!
      walk.push(node.id)
    }
    layout(walk, 'startsWith("ca"): walk two edges. The cost is the length of the prefix, no matter how many words are stored. Everything under this node starts with "ca".', 2)
    return out
  },
}

export const SCENES_B: Scene[] = [treeBfs, treeDfs, gridBfs, topo, dijkstra, unionFind, subsets, topK, twoHeaps, kWay, greedy, knapsack, trie]
