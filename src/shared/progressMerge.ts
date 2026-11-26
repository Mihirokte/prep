// Pure merge rules for learner progress, shared by the renderer (imports and
// cross-device sync) and the main process (writes that arrive from the phone).
// Nothing is dropped: a record is replaced only by a newer one.

interface Stamped {
  updatedAt: string
}

export interface ProgressShape {
  lessons: Record<string, Stamped>
  problems: Record<string, Stamped & { seconds?: number; solvedAt?: string }>
  recall: Record<string, { seen: number }>
}

const newer = (a: string, b: string) => (Date.parse(a) || 0) > (Date.parse(b) || 0)

/** Merge incoming progress into current: a record is replaced only by a newer one
 *  (by updatedAt), a card only by one reviewed more often. Records only in
 *  incoming are added. Time spent keeps the larger value. */
export function mergeProgress<T extends ProgressShape>(current: T, incoming: T): T {
  const lessons = { ...current.lessons }
  for (const [id, l] of Object.entries(incoming.lessons)) if (!lessons[id] || newer(l.updatedAt, lessons[id].updatedAt)) lessons[id] = l
  const problems = { ...current.problems }
  for (const [id, p] of Object.entries(incoming.problems)) {
    const cur = problems[id]
    if (!cur) problems[id] = p
    else if (newer(p.updatedAt, cur.updatedAt))
      problems[id] = { ...p, seconds: Math.max(p.seconds ?? 0, cur.seconds ?? 0) || undefined, solvedAt: cur.solvedAt ?? p.solvedAt }
  }
  const recall = { ...(current.recall ?? {}) }
  for (const [id, c] of Object.entries(incoming.recall ?? {})) if (!recall[id] || c.seen > recall[id].seen) recall[id] = c
  return { ...current, lessons, problems, recall }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The key redux-persist stores the progress under, and the shape it writes:
 *  a JSON object whose every field is itself a JSON string. */
export const PROGRESS_KEY = 'persist:prep-v2'

export function parsePersisted(raw: string | null): ProgressShape | null {
  if (!raw) return null
  try {
    const outer: unknown = JSON.parse(raw)
    if (!isObj(outer)) return null
    const field = (name: string): Record<string, never> => {
      const v = outer[name]
      if (v === undefined) return {}
      const inner: unknown = typeof v === 'string' ? JSON.parse(v) : v
      if (!isObj(inner)) throw new Error(`${name} is not an object`)
      return inner as Record<string, never>
    }
    return { lessons: field('lessons'), problems: field('problems'), recall: field('recall') }
  } catch {
    return null
  }
}

/** Merge two persisted blobs. Anything unreadable on either side yields the
 *  other side unchanged, so a bad write can never wipe good progress. */
export function mergePersisted(currentRaw: string | null, incomingRaw: string): string {
  const current = parsePersisted(currentRaw)
  const incoming = parsePersisted(incomingRaw)
  if (!incoming) return currentRaw ?? incomingRaw
  if (!current) return incomingRaw
  const merged = mergeProgress(current, incoming)
  let persist: unknown = '{"version":1,"rehydrated":true}'
  try {
    const outer: unknown = JSON.parse(incomingRaw)
    if (isObj(outer) && outer._persist !== undefined) persist = outer._persist
  } catch {
    // keep the default envelope marker
  }
  return JSON.stringify({
    lessons: JSON.stringify(merged.lessons),
    problems: JSON.stringify(merged.problems),
    recall: JSON.stringify(merged.recall),
    _persist: persist,
  })
}
