import type { Frame, Scene, Tone } from './types'
import { arr, frame, range } from './util'

// Scenes: arrays, pointers, lists, stacks, hashing, prefix sums, DP tables.
// Each frames() function runs the real algorithm and records what it does.

/* ------------------------------------------------------------------ two pointers */
const twoPointers: Scene = {
  id: 'two-pointers',
  pattern: 'two-pointers',
  title: 'Two pointers',
  setup: 'Sorted array, find a pair that sums to 14.',
  code: [
    'l, r = 0, len(nums) - 1',
    'while l < r:',
    '    s = nums[l] + nums[r]',
    '    if s == target: return [l, r]',
    '    if s < target: l += 1',
    '    else:          r -= 1',
  ],
  frames() {
    const nums = [1, 3, 4, 6, 8, 11, 15]
    const target = 14
    const out: Frame[] = []
    let l = 0
    let r = nums.length - 1
    out.push(frame('Start with one pointer at each end. The array is sorted, so the sum tells us which pointer to move.', [arr(nums, { pointers: [{ name: 'L', at: l }, { name: 'R', at: r }] })], { line: 0 }))
    while (l < r) {
      const s = nums[l] + nums[r]
      const tones = { [l]: 'on', [r]: 'on' } as Record<number, Tone>
      if (s === target) {
        out.push(frame(`${nums[l]} + ${nums[r]} = ${s}. That is the target. Done in ${out.length} steps, no nested loop.`, [arr(nums, { tones: { [l]: 'hit', [r]: 'hit' }, pointers: [{ name: 'L', at: l }, { name: 'R', at: r }] })], { line: 3, vars: [['sum', s], ['target', target]] }))
        break
      }
      out.push(frame(`${nums[l]} + ${nums[r]} = ${s}, which is ${s < target ? 'too small' : 'too big'}.`, [arr(nums, { tones, pointers: [{ name: 'L', at: l }, { name: 'R', at: r }] })], { line: 2, vars: [['sum', s], ['target', target]] }))
      if (s < target) {
        out.push(frame(`Too small: the left value is the problem, every pair with ${nums[l]} and a smaller right value is smaller still. Move L right.`, [arr(nums, { tones: { ...range(0, l, 'done'), [r]: 'on' }, pointers: [{ name: 'L', at: l + 1 }, { name: 'R', at: r }] })], { line: 4 }))
        l++
      } else {
        out.push(frame(`Too big: the right value is the problem. Move R left.`, [arr(nums, { tones: { ...range(r, nums.length - 1, 'done'), [l]: 'on' }, pointers: [{ name: 'L', at: l }, { name: 'R', at: r - 1 }] })], { line: 5 }))
        r--
      }
    }
    return out
  },
}

/* ------------------------------------------------------------------ sliding window */
const slidingWindow: Scene = {
  id: 'sliding-window',
  pattern: 'sliding-window',
  title: 'Sliding window',
  setup: 'Longest substring without repeating characters in "abcabcbb".',
  code: [
    'seen, l, best = set(), 0, 0',
    'for r, ch in enumerate(s):',
    '    while ch in seen:',
    '        seen.remove(s[l]); l += 1',
    '    seen.add(ch)',
    '    best = max(best, r - l + 1)',
  ],
  frames() {
    const s = 'abcabcbb'.split('')
    const out: Frame[] = []
    const seen = new Set<string>()
    let l = 0
    let best = 0
    const show = (r: number, note: string, line: number, hit?: number) =>
      frame(
        note,
        [
          arr(s, {
            window: r >= l ? [l, r] : undefined,
            tones: { ...range(l, r, 'on'), ...(hit !== undefined ? { [hit]: 'hit' } : {}) },
            pointers: [{ name: 'L', at: l }, { name: 'R', at: Math.min(r, s.length - 1) }],
          }),
        ],
        { line, vars: [['window', [...seen].join('') || '-'], ['best', best]] },
      )
    out.push(frame('The window is the stretch between L and R. Grow R one character at a time; shrink from L only when the window becomes invalid.', [arr(s, { pointers: [{ name: 'L', at: 0 }, { name: 'R', at: 0 }] })], { line: 0, vars: [['best', 0]] }))
    for (let r = 0; r < s.length; r++) {
      const ch = s[r]
      if (seen.has(ch)) {
        let hit = l
        while (s[hit] !== ch) hit++
        out.push(show(r, `'${ch}' is already in the window (at index ${hit}). The window is invalid, so shrink from the left.`, 2, hit))
        while (seen.has(ch)) {
          seen.delete(s[l])
          l++
        }
        out.push(show(r - 1 >= l ? r : r, `Drop characters until '${ch}' is gone. L moves to ${l}.`, 3))
      }
      seen.add(ch)
      best = Math.max(best, r - l + 1)
      out.push(show(r, `Add '${ch}'. Window "${s.slice(l, r + 1).join('')}" has length ${r - l + 1}. Best so far: ${best}.`, 5))
    }
    out.push(frame(`Each index enters the window once and leaves at most once, so the whole scan is O(n). Answer: ${best}.`, [arr(s, { tones: range(1, 3, 'hit') })], { vars: [['best', best]] }))
    return out
  },
}

/* ------------------------------------------------------------------ fast and slow */
const fastSlow: Scene = {
  id: 'fast-slow-pointers',
  pattern: 'fast-slow-pointers',
  title: 'Fast and slow pointers',
  setup: 'Does this linked list contain a cycle? (6 points back to 3)',
  code: [
    'slow = fast = head',
    'while fast and fast.next:',
    '    slow = slow.next',
    '    fast = fast.next.next',
    '    if slow is fast: return True',
    'return False',
  ],
  frames() {
    const vals = [1, 2, 3, 4, 5, 6]
    const next: (number | null)[] = [1, 2, 3, 4, 5, 2]
    const out: Frame[] = []
    let slow = 0
    let fast = 0
    const list = (note: string, line: number, met = false) =>
      frame(
        note,
        [
          {
            kind: 'list',
            items: vals.map((v, i) => ({ v, tone: met && i === slow ? ('hit' as Tone) : i === slow || i === fast ? ('on' as Tone) : undefined })),
            next,
            pointers: slow === fast ? [{ name: 'S,F', at: slow }] : [{ name: 'S', at: slow }, { name: 'F', at: fast }],
          },
        ],
        { line },
      )
    out.push(list('Both pointers start at the head. Slow moves one node per step, fast moves two.', 0))
    for (let step = 1; step < 12; step++) {
      slow = next[slow]!
      fast = next[next[fast]!]!
      if (slow === fast) {
        out.push(list(`Step ${step}: both land on node ${vals[slow]}. Inside a cycle the fast pointer gains one node per step on the slow one, so they must meet. Cycle found.`, 4, true))
        break
      }
      out.push(list(`Step ${step}: slow is at ${vals[slow]}, fast is at ${vals[fast]}. Not equal, keep going.`, 3))
    }
    return out
  },
}

/* ------------------------------------------------------------------ list reversal */
const reversal: Scene = {
  id: 'inplace-linkedlist-reversal',
  pattern: 'inplace-linkedlist-reversal',
  title: 'In-place list reversal',
  setup: 'Reverse 1 -> 2 -> 3 -> 4 -> 5 without extra memory.',
  code: [
    'prev, curr = None, head',
    'while curr:',
    '    nxt = curr.next     # remember the rest',
    '    curr.next = prev    # flip the arrow',
    '    prev, curr = curr, nxt',
    'return prev',
  ],
  frames() {
    const vals = [1, 2, 3, 4, 5]
    const next: (number | null)[] = [1, 2, 3, 4, null]
    const out: Frame[] = []
    let prev: number | null = null
    let curr: number | null = 0
    const snap = (note: string, line: number, nxt: number | null) => {
      const ptrs = [] as { name: string; at: number }[]
      if (prev !== null) ptrs.push({ name: 'prev', at: prev })
      if (curr !== null) ptrs.push({ name: 'curr', at: curr })
      if (nxt !== null && nxt !== undefined) ptrs.push({ name: 'nxt', at: nxt })
      out.push(
        frame(note, [{ kind: 'list', items: vals.map((v, i) => ({ v, tone: (i === curr ? 'on' : prev !== null && i <= prev && next[i] !== i + 1 ? 'done' : undefined) as Tone | undefined })), next: [...next], pointers: ptrs }], { line }),
      )
    }
    snap('Three names do the work: prev (already reversed), curr (the node being flipped) and nxt (the rest of the list, saved before we break the link).', 0, null)
    while (curr !== null) {
      const nxt: number | null = next[curr]
      snap(`Save curr.next before touching it: nxt is ${nxt === null ? 'null' : vals[nxt]}.`, 2, nxt)
      next[curr] = prev
      snap(`Flip the arrow: node ${vals[curr]} now points at ${prev === null ? 'null' : vals[prev]}.`, 3, nxt)
      prev = curr
      curr = nxt
      snap(curr === null ? 'curr fell off the end. prev is the new head.' : 'Slide the window: prev and curr each move one node forward.', 4, null)
    }
    return out
  },
}

/* ------------------------------------------------------------------ binary search */
const binarySearch: Scene = {
  id: 'modified-binary-search',
  pattern: 'modified-binary-search',
  title: 'Binary search',
  setup: 'Find 23 in a sorted array. Each probe halves the search space.',
  code: [
    'lo, hi = 0, len(a) - 1',
    'while lo <= hi:',
    '    mid = (lo + hi) // 2',
    '    if a[mid] == x: return mid',
    '    if a[mid] < x: lo = mid + 1',
    '    else:          hi = mid - 1',
  ],
  frames() {
    const a = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
    const x = 23
    const out: Frame[] = []
    let lo = 0
    let hi = a.length - 1
    const dead = (lo: number, hi: number): Record<number, Tone> => ({ ...range(0, lo - 1, 'dim'), ...range(hi + 1, a.length - 1, 'dim') })
    out.push(frame('The answer is somewhere in [lo, hi]. Everything outside is ruled out.', [arr(a, { window: [lo, hi], pointers: [{ name: 'lo', at: lo }, { name: 'hi', at: hi }] })], { line: 0 }))
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      out.push(frame(`Probe the middle: a[${mid}] = ${a[mid]}.`, [arr(a, { window: [lo, hi], tones: { ...dead(lo, hi), [mid]: 'on' }, pointers: [{ name: 'lo', at: lo }, { name: 'mid', at: mid }, { name: 'hi', at: hi }] })], { line: 2, vars: [['mid', mid], ['a[mid]', a[mid]]] }))
      if (a[mid] === x) {
        out.push(frame(`a[${mid}] = ${x}. Found after ${out.length} probes; a linear scan would have taken ${mid + 1}.`, [arr(a, { tones: { ...dead(lo, hi), [mid]: 'hit' }, pointers: [{ name: 'mid', at: mid }] })], { line: 3 }))
        break
      }
      if (a[mid] < x) {
        lo = mid + 1
        out.push(frame(`${a[mid]} < ${x}: the target is to the right. Discard the left half, lo = ${lo}.`, [arr(a, { window: [lo, hi], tones: dead(lo, hi), pointers: [{ name: 'lo', at: lo }, { name: 'hi', at: hi }] })], { line: 4 }))
      } else {
        hi = mid - 1
        out.push(frame(`${a[mid]} > ${x}: the target is to the left. hi = ${hi}.`, [arr(a, { window: [lo, hi], tones: dead(lo, hi), pointers: [{ name: 'lo', at: lo }, { name: 'hi', at: hi }] })], { line: 5 }))
      }
    }
    return out
  },
}

/* ------------------------------------------------------------------ monotonic stack */
const monotonic: Scene = {
  id: 'monotonic-stack',
  pattern: 'monotonic-stack',
  title: 'Monotonic stack',
  setup: 'For each value, find the next greater value to its right.',
  code: [
    'ans, st = [-1] * n, []',
    'for i, v in enumerate(a):',
    '    while st and a[st[-1]] < v:',
    '        ans[st.pop()] = v',
    '    st.append(i)',
  ],
  frames() {
    const a = [2, 1, 2, 4, 3]
    const ans: (number | string)[] = a.map(() => '-')
    const st: number[] = []
    const out: Frame[] = []
    const snap = (i: number, note: string, line: number, popped?: number) =>
      out.push(
        frame(
          note,
          [
            arr(a, { title: 'values', tones: { [i]: 'on', ...(popped !== undefined ? { [popped]: 'hit' } : {}) }, pointers: [{ name: 'i', at: i }] }),
            { kind: 'stack', title: 'stack (indices waiting for a bigger value)', items: st.map((k) => `${a[k]}`) },
            arr(ans, { title: 'answer', indices: false, tones: Object.fromEntries(ans.map((v, k) => [k, v === '-' ? undefined : 'done'])) as Record<number, Tone | undefined> }),
          ],
          { line },
        ),
      )
    for (let i = 0; i < a.length; i++) {
      snap(i, `Look at ${a[i]}.`, 1)
      while (st.length && a[st[st.length - 1]] < a[i]) {
        const k = st.pop()!
        ans[k] = a[i]
        snap(i, `${a[k]} on the stack is smaller than ${a[i]}: ${a[i]} is its next greater value. Pop it and record the answer.`, 3, k)
      }
      st.push(i)
      snap(i, `Push ${a[i]}. The stack stays non-increasing from bottom to top, which is why it is called monotonic.`, 4)
    }
    out.push(frame(`What is left on the stack never found a bigger value (answer stays -1). Each index is pushed and popped once: O(n).`, [arr(a, { title: 'values' }), arr(ans.map((v) => (v === '-' ? -1 : v)), { title: 'answer', indices: false })]))
    return out
  },
}

/* ------------------------------------------------------------------ stack (matching) */
const stackMatch: Scene = {
  id: 'stack',
  pattern: 'stack',
  title: 'Stack: matching brackets',
  setup: 'Is "{[()]}" balanced?',
  code: [
    "pairs = {')': '(', ']': '[', '}': '{'}",
    'st = []',
    'for ch in s:',
    '    if ch in pairs:',
    '        if not st or st.pop() != pairs[ch]: return False',
    '    else: st.append(ch)',
    'return not st',
  ],
  frames() {
    const s = '{[()]}'.split('')
    const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
    const st: string[] = []
    const out: Frame[] = []
    const snap = (i: number, note: string, line: number, tone: Tone = 'on') =>
      out.push(frame(note, [arr(s, { tones: { ...range(0, i - 1, 'done'), [i]: tone }, pointers: [{ name: 'i', at: i }] }), { kind: 'stack', title: 'open brackets', items: [...st] }], { line }))
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]
      if (ch in pairs) {
        const top = st.pop()
        snap(i, `${ch} closes a bracket. The most recent open one is ${top}, which ${top === pairs[ch] ? 'matches' : 'does not match'}.`, 4, 'hit')
      } else {
        st.push(ch)
        snap(i, `${ch} opens a bracket. Push it: the last thing opened must be the first thing closed.`, 5)
      }
    }
    out.push(frame('The stack is empty, so every opener was closed in the right order. Balanced.', [arr(s, { tones: range(0, s.length - 1, 'done') }), { kind: 'stack', title: 'open brackets', items: [] }], { line: 6 }))
    return out
  },
}

/* ------------------------------------------------------------------ hashing */
const hashing: Scene = {
  id: 'hashing',
  pattern: 'hashing',
  title: 'Hash map: two sum',
  setup: 'Unsorted array, find two numbers that add to 13.',
  code: [
    'seen = {}',
    'for i, v in enumerate(nums):',
    '    if target - v in seen:',
    '        return [seen[target - v], i]',
    '    seen[v] = i',
  ],
  frames() {
    const nums = [3, 8, 2, 11, 5]
    const target = 13
    const seen = new Map<number, number>()
    const out: Frame[] = []
    const kv = () => ({ kind: 'kv' as const, title: 'seen: value -> index', entries: [...seen.entries()].map(([k, v]) => [String(k), String(v)] as [string, string]) })
    out.push(frame('A hash map answers "have I seen the number I need?" in O(1), so one pass is enough.', [arr(nums), kv()], { line: 0 }))
    for (let i = 0; i < nums.length; i++) {
      const need = target - nums[i]
      if (seen.has(need)) {
        out.push(frame(`${nums[i]} needs ${need}, and ${need} is in the map at index ${seen.get(need)}. Pair found: indices ${seen.get(need)} and ${i}.`, [arr(nums, { tones: { [i]: 'hit', [seen.get(need)!]: 'hit' } }), kv()], { line: 3 }))
        break
      }
      out.push(frame(`${nums[i]} needs ${need}. Not in the map yet.`, [arr(nums, { tones: { ...range(0, i - 1, 'done'), [i]: 'on' } , pointers: [{ name: 'i', at: i }] }), kv()], { line: 2, vars: [['need', need]] }))
      seen.set(nums[i], i)
      out.push(frame(`Remember ${nums[i]} at index ${i} for later elements.`, [arr(nums, { tones: range(0, i, 'done'), pointers: [{ name: 'i', at: i }] }), kv()], { line: 4 }))
    }
    return out
  },
}

/* ------------------------------------------------------------------ prefix sums */
const prefix: Scene = {
  id: 'prefix-sum',
  pattern: 'prefix-sum',
  title: 'Prefix sums',
  setup: 'Answer sum(nums[2..5]) in O(1) after one pass.',
  code: [
    'pre = [0]',
    'for v in nums: pre.append(pre[-1] + v)',
    '# sum of nums[i..j] inclusive',
    'return pre[j + 1] - pre[i]',
  ],
  frames() {
    const nums = [3, 1, 4, 1, 5, 9, 2, 6]
    const pre = [0]
    const out: Frame[] = []
    out.push(frame('Build a running total once. pre[k] is the sum of the first k numbers.', [arr(nums, { title: 'nums' }), arr([0], { title: 'pre', indices: true })], { line: 0 }))
    for (let i = 0; i < nums.length; i++) {
      pre.push(pre[i] + nums[i])
      out.push(frame(`pre[${i + 1}] = pre[${i}] + nums[${i}] = ${pre[i]} + ${nums[i]} = ${pre[i + 1]}.`, [arr(nums, { title: 'nums', tones: { [i]: 'on' } }), arr(pre, { title: 'pre', tones: { [i + 1]: 'on' } })], { line: 1 }))
    }
    out.push(frame('Query sum(nums[2..5]): the total up to index 5 minus the total before index 2.', [arr(nums, { title: 'nums', window: [2, 5], tones: range(2, 5, 'on') }), arr(pre, { title: 'pre', tones: { 6: 'hit', 2: 'hit' } })], { line: 3, vars: [['pre[6]', pre[6]], ['pre[2]', pre[2]]] }))
    out.push(frame(`${pre[6]} - ${pre[2]} = ${pre[6] - pre[2]}. Any range costs one subtraction, however long it is.`, [arr(nums, { title: 'nums', window: [2, 5], tones: range(2, 5, 'hit') }), arr(pre, { title: 'pre', tones: { 6: 'hit', 2: 'hit' } })], { line: 3 }))
    return out
  },
}

/* ------------------------------------------------------------------ linear dp */
const linearDp: Scene = {
  id: 'linear-dp',
  pattern: 'linear-dp',
  title: 'Linear DP: coin change',
  setup: 'Fewest coins from [1, 2, 5] that make 11.',
  code: [
    'dp = [0] + [inf] * amount',
    'for a in range(1, amount + 1):',
    '    for c in coins:',
    '        if c <= a: dp[a] = min(dp[a], dp[a - c] + 1)',
    'return dp[amount]',
  ],
  frames() {
    const coins = [1, 2, 5]
    const amount = 11
    const dp: number[] = [0]
    const out: Frame[] = []
    const show = (a: number, note: string, from?: number) => {
      const vals = Array.from({ length: amount + 1 }, (_, i) => (i < dp.length ? dp[i] : '?'))
      out.push(frame(note, [arr(vals, { title: 'dp[a] = fewest coins to make a', tones: { ...range(0, dp.length - 1, 'done'), [a]: 'on', ...(from !== undefined ? { [from]: 'hit' } : {}) }, pointers: [{ name: 'a', at: a }] })], { line: 3 }))
    }
    out.push(frame('dp[a] is the answer for amount a. dp[0] = 0: zero coins make zero. Every later cell is built from earlier ones.', [arr(Array.from({ length: amount + 1 }, (_, i) => (i === 0 ? 0 : '?')), { title: 'dp[a] = fewest coins to make a', tones: { 0: 'done' } })], { line: 0 }))
    for (let a = 1; a <= amount; a++) {
      let best = Infinity
      let via = 0
      for (const c of coins) if (c <= a && dp[a - c] + 1 < best) { best = dp[a - c] + 1; via = c }
      dp[a] = best
      show(a, `dp[${a}] = min over coins of dp[${a} - coin] + 1. Best is coin ${via}: dp[${a - via}] + 1 = ${best}.`, a - via)
    }
    out.push(frame(`dp[${amount}] = ${dp[amount]}: 5 + 5 + 1. The table did ${amount * coins.length} cheap lookups instead of trying every combination.`, [arr(dp, { title: 'dp[a] = fewest coins to make a', tones: { ...range(0, amount - 1, 'done'), [amount]: 'hit' } })], { line: 4 }))
    return out
  },
}

/* ------------------------------------------------------------------ 2D dp (LCS) */
const gridDp: Scene = {
  id: 'grid-string-dp',
  pattern: 'grid-string-dp',
  title: 'Two-string DP: longest common subsequence',
  setup: 'LCS of "ABCB" and "BDCB".',
  code: [
    'dp = [[0] * (m + 1) for _ in range(n + 1)]',
    'for i in range(1, n + 1):',
    '    for j in range(1, m + 1):',
    '        if a[i-1] == b[j-1]:',
    '            dp[i][j] = dp[i-1][j-1] + 1',
    '        else:',
    '            dp[i][j] = max(dp[i-1][j], dp[i][j-1])',
  ],
  frames() {
    const a = 'ABCB'
    const b = 'BDCB'
    const n = a.length
    const m = b.length
    const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0))
    const out: Frame[] = []
    const table = (filled: number, focus: [number, number][]) => ({
      kind: 'grid' as const,
      title: 'dp[i][j] = LCS of the first i letters of A and first j of B',
      cols: ['', ...b.split('')],
      rows: ['', ...a.split('')],
      cells: dp.map((row, i) => row.map((v, j) => ({ v: i * (m + 1) + j <= filled ? v : '', tone: (focus.some(([r, c]) => r === i && c === j) ? 'on' : i * (m + 1) + j < filled ? 'done' : undefined) as Tone | undefined }))),
      focus,
    })
    out.push(frame('Row 0 and column 0 are the empty prefix: LCS is 0. Every other cell compares one letter of A with one letter of B.', [table(m, [])], { line: 0 }))
    let count = m + 1
    for (let i = 1; i <= n; i++)
      for (let j = 1; j <= m; j++) {
        const same = a[i - 1] === b[j - 1]
        dp[i][j] = same ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
        count = i * (m + 1) + j
        out.push(
          frame(
            same
              ? `${a[i - 1]} = ${b[j - 1]}: the letters match, so extend the diagonal: dp[${i - 1}][${j - 1}] + 1 = ${dp[i][j]}.`
              : `${a[i - 1]} != ${b[j - 1]}: take the better of skipping a letter of A (above, ${dp[i - 1][j]}) or of B (left, ${dp[i][j - 1]}) = ${dp[i][j]}.`,
            [table(count, [[i, j]])],
            { line: same ? 4 : 6 },
          ),
        )
      }
    out.push(frame(`The bottom-right cell is the answer: LCS length ${dp[n][m]}. Reading the arrows back gives the subsequence itself.`, [table(count + 1, [[n, m]])], { line: 6 }))
    return out
  },
}

/* ------------------------------------------------------------------ cyclic sort */
const cyclicSort: Scene = {
  id: 'cyclic-sort',
  pattern: 'cyclic-sort',
  title: 'Cyclic sort',
  setup: 'Numbers 1..5 in scrambled order: send each value home.',
  code: [
    'i = 0',
    'while i < len(nums):',
    '    j = nums[i] - 1          # where nums[i] belongs',
    '    if nums[i] != nums[j]: nums[i], nums[j] = nums[j], nums[i]',
    '    else: i += 1',
  ],
  frames() {
    const nums = [3, 1, 5, 4, 2]
    const out: Frame[] = []
    let i = 0
    out.push(frame('Value v belongs at index v - 1. Keep swapping the value at i to its home until the right value arrives, then advance.', [arr(nums, { pointers: [{ name: 'i', at: 0 }] })], { line: 0 }))
    while (i < nums.length) {
      const j = nums[i] - 1
      if (nums[i] !== nums[j]) {
        out.push(frame(`${nums[i]} belongs at index ${j}. Swap nums[${i}] with nums[${j}].`, [arr(nums, { tones: { [i]: 'on', [j]: 'hit' }, pointers: [{ name: 'i', at: i }] })], { line: 3 }))
        ;[nums[i], nums[j]] = [nums[j], nums[i]]
        out.push(frame(`Now ${nums[j]} is home. Look at i = ${i} again.`, [arr(nums, { tones: { [j]: 'done' }, pointers: [{ name: 'i', at: i }] })], { line: 1 }))
      } else {
        out.push(frame(`nums[${i}] = ${nums[i]} is already home. Advance.`, [arr(nums, { tones: range(0, i, 'done'), pointers: [{ name: 'i', at: i }] })], { line: 4 }))
        i++
      }
    }
    out.push(frame('Sorted in place with O(1) extra space. Each swap puts one value home for good, so there are at most n swaps.', [arr(nums, { tones: range(0, nums.length - 1, 'hit') })]))
    return out
  },
}

/* ------------------------------------------------------------------ merge intervals */
const mergeIntervals: Scene = {
  id: 'merge-intervals',
  pattern: 'merge-intervals',
  title: 'Merge intervals',
  setup: 'Merge [1,3] [2,6] [8,10] [9,12] [15,18].',
  code: [
    'intervals.sort()',
    'out = [intervals[0]]',
    'for s, e in intervals[1:]:',
    '    if s <= out[-1][1]: out[-1][1] = max(out[-1][1], e)',
    '    else: out.append([s, e])',
  ],
  frames() {
    const iv: [number, number][] = [[1, 3], [2, 6], [8, 10], [9, 12], [15, 18]]
    const label = (p: [number, number]) => `${p[0]}-${p[1]}`
    const out: Frame[] = []
    const merged: [number, number][] = [[...iv[0]]]
    const panels = (i: number, tone: Tone) => [
      arr(iv.map(label), { title: 'sorted by start', tones: { ...range(0, i - 1, 'done'), [i]: tone }, indices: false }),
      arr(merged.map(label), { title: 'merged', indices: false, tones: { [merged.length - 1]: 'hit' } }),
    ]
    out.push(frame('After sorting by start, overlapping intervals are always neighbours, so one left-to-right pass is enough.', panels(0, 'on'), { line: 1 }))
    for (let i = 1; i < iv.length; i++) {
      const [s, e] = iv[i]
      const last = merged[merged.length - 1]
      if (s <= last[1]) {
        out.push(frame(`[${s},${e}] starts at ${s}, inside [${last[0]},${last[1]}] (${s} <= ${last[1]}). They overlap.`, panels(i, 'on'), { line: 3 }))
        last[1] = Math.max(last[1], e)
        out.push(frame(`Merge: extend the end to max(${last[1]}, ${e}). The merged interval is now ${last[0]}-${last[1]}.`, panels(i, 'done'), { line: 3 }))
      } else {
        out.push(frame(`[${s},${e}] starts after ${last[1]}: a gap. Close the last interval and start a new one.`, panels(i, 'on'), { line: 4 }))
        merged.push([s, e])
        out.push(frame(`New interval ${s}-${e} added.`, panels(i, 'done'), { line: 4 }))
      }
    }
    return out
  },
}

/* ------------------------------------------------------------------ matrix spiral */
const matrix: Scene = {
  id: 'matrix',
  pattern: 'matrix',
  title: 'Matrix: spiral order',
  setup: 'Walk a 3 x 4 grid in a spiral by shrinking four boundaries.',
  code: [
    'top, bot, left, right = 0, m - 1, 0, n - 1',
    'while top <= bot and left <= right:',
    '    row top: left..right; top += 1',
    '    col right: top..bot; right -= 1',
    '    row bot: right..left; bot -= 1',
    '    col left: bot..top; left += 1',
  ],
  frames() {
    const R = 3
    const C = 4
    const order: [number, number][] = []
    let top = 0
    let bot = R - 1
    let left = 0
    let right = C - 1
    while (top <= bot && left <= right) {
      for (let c = left; c <= right; c++) order.push([top, c])
      top++
      for (let r = top; r <= bot; r++) order.push([r, right])
      right--
      if (top <= bot) { for (let c = right; c >= left; c--) order.push([bot, c]); bot-- }
      if (left <= right) { for (let r = bot; r >= top; r--) order.push([r, left]); left++ }
    }
    const out: Frame[] = []
    const grid = (k: number) => ({
      kind: 'grid' as const,
      title: 'visited order',
      cells: Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => {
        const at = order.findIndex(([rr, cc]) => rr === r && cc === c)
        return { v: at < k ? at + 1 : '', tone: (at === k - 1 ? 'on' : at < k ? 'done' : undefined) as Tone | undefined }
      })),
    })
    out.push(frame('Four boundaries (top, bottom, left, right) close in as each side of the ring is walked.', [grid(0)], { line: 0 }))
    for (let k = 1; k <= order.length; k++) out.push(frame(`Visit (${order[k - 1][0]}, ${order[k - 1][1]}) as cell number ${k}.`, [grid(k), { kind: 'kv', title: 'output so far', entries: [['count', `${k}/${order.length}`]] }], { line: Math.min(5, 2 + Math.floor((k - 1) / 4) % 4) }))
    return out
  },
}

/* ------------------------------------------------------------------ xor */
const xor: Scene = {
  id: 'bitwise-xor',
  pattern: 'bitwise-xor',
  title: 'XOR cancels pairs',
  setup: 'Every number appears twice except one. Find it in O(1) space.',
  code: ['x = 0', 'for v in nums:', '    x ^= v', 'return x'],
  frames() {
    const nums = [4, 1, 2, 1, 2]
    const out: Frame[] = []
    let x = 0
    const bits = (n: number) => n.toString(2).padStart(3, '0').split('')
    out.push(frame('a ^ a = 0 and a ^ 0 = a. XOR every number together: pairs cancel, the single one survives.', [arr(nums), arr(bits(0), { title: 'x in binary', indices: false })], { line: 0 }))
    for (let i = 0; i < nums.length; i++) {
      const before = x
      x ^= nums[i]
      out.push(frame(`x = ${before} ^ ${nums[i]} = ${x}  (${bits(before).join('')} ^ ${bits(nums[i]).join('')} = ${bits(x).join('')}).`, [arr(nums, { tones: { ...range(0, i - 1, 'done'), [i]: 'on' }, pointers: [{ name: 'i', at: i }] }), arr(bits(x), { title: 'x in binary', indices: false, tones: range(0, 2, i === nums.length - 1 ? 'hit' : 'on') })], { line: 2, vars: [['x', x]] }))
    }
    return out
  },
}

/* ------------------------------------------------------------------ bit tricks */
const bitTricks: Scene = {
  id: 'bit-manipulation',
  pattern: 'bit-manipulation',
  title: 'Count set bits: n & (n - 1)',
  setup: 'n & (n - 1) clears the lowest set bit, so the loop runs once per 1.',
  code: ['count = 0', 'while n:', '    n &= n - 1', '    count += 1', 'return count'],
  frames() {
    let n = 0b101100
    const out: Frame[] = []
    const bits = (v: number) => v.toString(2).padStart(6, '0').split('')
    let count = 0
    out.push(frame(`n = ${n} = ${bits(n).join('')}. Count the ones.`, [arr(bits(n), { title: 'n', indices: false })], { line: 0, vars: [['count', 0]] }))
    while (n) {
      const next = n & (n - 1)
      const low = bits(n).length - 1 - [...bits(n)].reverse().findIndex((b) => b === '1')
      out.push(frame(`n - 1 flips the lowest 1 and the zeros below it. AND-ing with n leaves that bit cleared.`, [arr(bits(n), { title: 'n', indices: false, tones: { [low]: 'on' } }), arr(bits(n - 1), { title: 'n - 1', indices: false }), arr(bits(next), { title: 'n & (n - 1)', indices: false, tones: { [low]: 'hit' } })], { line: 2, vars: [['count', count]] }))
      n = next
      count++
    }
    out.push(frame(`n reached 0 after ${count} rounds: three 1 bits. Cost is the number of set bits, not the number of bits.`, [arr(bits(0), { title: 'n', indices: false })], { line: 4, vars: [['count', count]] }))
    return out
  },
}

export const SCENES_A: Scene[] = [
  twoPointers,
  slidingWindow,
  fastSlow,
  reversal,
  binarySearch,
  monotonic,
  stackMatch,
  hashing,
  prefix,
  linearDp,
  gridDp,
  cyclicSort,
  mergeIntervals,
  matrix,
  xor,
  bitTricks,
]
