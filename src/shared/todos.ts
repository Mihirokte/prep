// The phone's to-do list. Stored in the progress file under its own key, so it
// syncs like progress does. Deleted items stay as tombstones for a while so a
// delete on one device is not undone by a stale copy on another.

export const TODOS_KEY = 'prep.todos.v1'
export const MAX_TODOS = 500
export const MAX_TODO_TEXT = 300
const TOMBSTONE_DAYS = 30

export interface Todo {
  id: string
  text: string
  done: boolean
  updatedAt: string
  deleted?: true
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseTodos(raw: string | null): Todo[] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    const out: Todo[] = []
    for (const t of v) {
      if (!isObj(t) || typeof t.id !== 'string' || typeof t.text !== 'string' || typeof t.updatedAt !== 'string') continue
      out.push({
        id: t.id,
        text: t.text.slice(0, MAX_TODO_TEXT),
        done: t.done === true,
        updatedAt: t.updatedAt,
        ...(t.deleted === true ? { deleted: true as const } : {}),
      })
    }
    return out
  } catch {
    return []
  }
}

const time = (s: string) => Date.parse(s) || 0

/** Newest copy of each item wins; old tombstones are dropped; order is creation order (ids start with a timestamp). */
export function mergeTodos(a: Todo[], b: Todo[], now = Date.now()): Todo[] {
  const byId = new Map<string, Todo>()
  for (const t of [...a, ...b]) {
    const cur = byId.get(t.id)
    if (!cur || time(t.updatedAt) > time(cur.updatedAt)) byId.set(t.id, t)
  }
  const cutoff = now - TOMBSTONE_DAYS * 86400000
  return [...byId.values()]
    .filter((t) => !(t.deleted && time(t.updatedAt) < cutoff))
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .slice(-MAX_TODOS)
}

export function mergeTodosRaw(currentRaw: string | null, incomingRaw: string, now = Date.now()): string {
  return JSON.stringify(mergeTodos(parseTodos(currentRaw), parseTodos(incomingRaw), now))
}

/** Ids sort by creation time: base-36 millisecond timestamp, then a random suffix. */
export function newTodoId(now = Date.now(), rand = Math.random()): string {
  return `${now.toString(36).padStart(9, '0')}-${Math.floor(rand * 36 ** 4).toString(36).padStart(4, '0')}`
}
