// Progress file import: parse, validate and merge. Pure functions, no DOM, so
// scripts/verify-progress.ts runs them directly in Node.
import type { LessonProgress, ProblemProgress, ProgressState, RecallCard } from './store/progressSlice'

export interface ImportReport {
  lessons: number
  problems: number
  cards: number
  /** Records dropped because a field had the wrong type or an unknown value. */
  skipped: string[]
}

export type ParseResult = { ok: true; progress: ProgressState; report: ImportReport } | { ok: false; error: string }

const LESSON_STATUS = new Set(['unread', 'read'])
const PROBLEM_STATUS = new Set(['none', 'attempted', 'solved', 'revisit'])
const MAX_BOX = 5

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isDate = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const optStr = (v: unknown) => v === undefined || typeof v === 'string'

function lessonOf(v: unknown): LessonProgress | string {
  if (!isObj(v)) return 'not an object'
  if (!LESSON_STATUS.has(v.status as string)) return `status "${String(v.status)}"`
  if (!optStr(v.notes)) return 'notes is not text'
  return { status: v.status as LessonProgress['status'], updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : '', ...(typeof v.notes === 'string' ? { notes: v.notes } : {}) }
}

function problemOf(v: unknown): ProblemProgress | string {
  if (!isObj(v)) return 'not an object'
  if (!PROBLEM_STATUS.has(v.status as string)) return `status "${String(v.status)}"`
  if (!optStr(v.notes) || !optStr(v.code)) return 'notes or code is not text'
  if (v.seconds !== undefined && !(typeof v.seconds === 'number' && v.seconds >= 0)) return 'seconds is not a positive number'
  if (v.solvedAt !== undefined && !isDate(v.solvedAt)) return 'solvedAt is not a date'
  const out: ProblemProgress = { status: v.status as ProblemProgress['status'], updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : '' }
  if (typeof v.notes === 'string') out.notes = v.notes
  if (typeof v.code === 'string') out.code = v.code
  if (typeof v.seconds === 'number') out.seconds = v.seconds
  if (typeof v.solvedAt === 'string') out.solvedAt = v.solvedAt
  return out
}

function cardOf(v: unknown): RecallCard | string {
  if (!isObj(v)) return 'not an object'
  if (!(Number.isInteger(v.box) && (v.box as number) >= 0 && (v.box as number) <= MAX_BOX)) return `box ${String(v.box)}`
  if (!isDate(v.due)) return 'due is not a date'
  if (!(Number.isInteger(v.seen) && (v.seen as number) >= 0)) return `seen ${String(v.seen)}`
  return { box: v.box as number, due: v.due as string, seen: v.seen as number }
}

function section<T>(raw: unknown, name: string, of: (v: unknown) => T | string, skipped: string[]): Record<string, T> {
  const out: Record<string, T> = {}
  if (raw === undefined) return out
  if (!isObj(raw)) {
    skipped.push(`${name}: not an object`)
    return out
  }
  for (const [id, v] of Object.entries(raw)) {
    const r = of(v)
    if (typeof r === 'string') skipped.push(`${name} ${id}: ${r}`)
    else out[id] = r
  }
  return out
}

/** Reads an Export file, or the app's own progress.json (redux-persist format). */
export function parseProgress(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `The file is not valid JSON: ${(e as Error).message}` }
  }
  if (isObj(data) && typeof data['persist:prep-v2'] === 'string') {
    try {
      const outer = JSON.parse(data['persist:prep-v2']) as Record<string, string>
      data = Object.fromEntries(['lessons', 'problems', 'recall'].filter((k) => k in outer).map((k) => [k, JSON.parse(outer[k])]))
    } catch {
      return { ok: false, error: 'The file looks like a Prep data file, but its progress entry is damaged.' }
    }
  }
  if (!isObj(data) || !['lessons', 'problems', 'recall'].some((k) => k in data))
    return { ok: false, error: 'This is not a Prep progress file. It needs a lessons, problems or recall section.' }
  const skipped: string[] = []
  const progress: ProgressState = {
    lessons: section(data.lessons, 'lesson', lessonOf, skipped),
    problems: section(data.problems, 'problem', problemOf, skipped),
    recall: section(data.recall, 'card', cardOf, skipped),
  }
  return {
    ok: true,
    progress,
    report: {
      lessons: Object.keys(progress.lessons).length,
      problems: Object.keys(progress.problems).length,
      cards: Object.keys(progress.recall).length,
      skipped,
    },
  }
}

const newer = (a: string, b: string) => (Date.parse(a) || 0) > (Date.parse(b) || 0)

/** Merge an imported file into current progress. Nothing the learner has is
 *  dropped: a record is replaced only by a newer one (by updatedAt), and a card
 *  only by one reviewed more often. Records only in the file are added. */
export function mergeProgress(current: ProgressState, incoming: ProgressState): ProgressState {
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
  for (const [id, c] of Object.entries(incoming.recall)) if (!recall[id] || c.seen > recall[id].seen) recall[id] = c
  return { lessons, problems, recall }
}

export function describeImport(r: ImportReport): string {
  const parts = [`${r.lessons} lessons`, `${r.problems} problems`, `${r.cards} review cards`]
  const head = `Imported ${parts.join(', ')}. Newer entries replaced older ones; nothing was removed.`
  if (!r.skipped.length) return head
  const sample = r.skipped.slice(0, 3).join('; ')
  return `${head} Skipped ${r.skipped.length} invalid ${r.skipped.length === 1 ? 'entry' : 'entries'} (${sample}${r.skipped.length > 3 ? '; ...' : ''}).`
}
