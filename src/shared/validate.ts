import { ContentSchema } from './schema'
import type { Content } from './types'

// Whole-store validation. Runs on the seed at startup and on every proposed
// change set before it can be applied, so the store can never hold a dangling
// reference or a malformed record.

const COLLECTION_KIND: Record<string, string> = {
  areas: 'area',
  drills: 'problem',
  courses: 'course',
  chapters: 'chapter',
  lessons: 'lesson',
  patterns: 'pattern',
  companies: 'company',
}

const child = (node: unknown, seg: PropertyKey): unknown =>
  node && typeof node === 'object' ? (node as Record<PropertyKey, unknown>)[seg] : undefined

function identOf(v: unknown): string | undefined {
  const o = (v && typeof v === 'object' ? v : {}) as { key?: unknown; id?: unknown }
  return typeof o.key === 'string' ? o.key : typeof o.id === 'string' ? o.id : undefined
}

/** Turn a schema path like [companies, 0, questions, 1, answer] into
 *  "company goodscore › round goodscore-lld… › answer". */
function describePath(c: Content, path: readonly PropertyKey[]): string {
  const parts: string[] = []
  let node: unknown = c
  let collection = ''
  for (const seg of path) {
    const next = child(node, seg)
    if (typeof seg === 'number') {
      const ident = identOf(next)
      const kind =
        collection === 'questions' ? (child(next, 'round') !== undefined ? 'round' : 'question')
        : COLLECTION_KIND[collection]
      if (kind && ident) parts.push(`${kind} ${ident}`)
      else if (parts[parts.length - 1] === collection) parts[parts.length - 1] = `${collection}[${seg}]`
      else parts.push(`${collection}[${seg}]`)
    } else if (collection === 'packs') {
      parts.push(`pack ${String(seg)}`)
      collection = ''
    } else {
      const name = String(seg)
      if (name in COLLECTION_KIND || name === 'questions' || name === 'packs') collection = name
      else {
        parts.push(name)
        collection = name
      }
    }
    node = next
  }
  return parts.join(' › ') || 'store'
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const v of values) (seen.has(v) ? dup : seen).add(v)
  return [...dup]
}

export function validateContent(c: Content): string[] {
  const errors: string[] = []

  const parsed = ContentSchema.safeParse(c)
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 40))
      errors.push(`${describePath(c, issue.path)}: ${issue.message}`)
    // Structural errors make the reference checks below unreliable.
    return errors
  }

  const problemIds = c.areas.flatMap((a) => a.drills.map((d) => d.id))
  const problemSet = new Set(problemIds)
  const patternKeys = new Set(c.patterns.map((p) => p.key))
  const areaKeys = new Set(c.areas.map((a) => a.key))

  const unique: [string, string[]][] = [
    ['area key', c.areas.map((a) => a.key)],
    ['problem id', problemIds],
    ['course key', c.courses.map((x) => x.key)],
    ['chapter id', c.courses.flatMap((x) => x.chapters.map((ch) => ch.id))],
    ['lesson id', c.courses.flatMap((x) => x.chapters.flatMap((ch) => ch.lessons.map((l) => l.id)))],
    ['pattern key', c.patterns.map((p) => p.key)],
    ['company key', c.companies.map((x) => x.key)],
    ['round id', c.companies.flatMap((x) => x.questions.map((g) => g.id))],
    ['question id', c.companies.flatMap((x) => x.questions.flatMap((g) => g.questions.map((q) => q.id)))],
  ]
  for (const [what, list] of unique)
    for (const d of duplicates(list)) errors.push(`duplicate ${what} "${d}"`)

  for (const [key, pack] of Object.entries(c.packs)) {
    if (pack.id !== key) errors.push(`pack ${key}: its id field is "${pack.id}"`)
    if (!problemSet.has(key)) errors.push(`pack ${key}: no problem with that id`)
  }

  for (const course of c.courses) {
    if (course.problemAreaKey && !areaKeys.has(course.problemAreaKey))
      errors.push(`course ${course.key}: problemAreaKey "${course.problemAreaKey}" is not an area`)
    for (const id of course.suppressedProblemIds ?? [])
      if (!problemSet.has(id)) errors.push(`course ${course.key}: suppressed problem "${id}" does not exist`)
    for (const ch of course.chapters)
      for (const id of ch.problemIds ?? [])
        if (!problemSet.has(id)) errors.push(`chapter ${ch.id}: problem "${id}" does not exist`)
  }

  for (const pat of c.patterns) {
    for (const id of pat.problemIds)
      if (!problemSet.has(id)) errors.push(`pattern ${pat.key}: problem "${id}" does not exist`)
    for (const d of duplicates(pat.problemIds)) errors.push(`pattern ${pat.key}: problem "${d}" listed twice`)
    for (const ct of pat.contrasts ?? []) {
      if (!patternKeys.has(ct.key)) errors.push(`pattern ${pat.key}: contrast "${ct.key}" is not a pattern`)
      if (ct.key === pat.key) errors.push(`pattern ${pat.key}: contrasts with itself`)
    }
  }

  for (const co of c.companies) {
    for (const rp of co.dsaPatterns ?? [])
      if (!patternKeys.has(rp.key)) errors.push(`company ${co.key}: round pattern "${rp.key}" is not a pattern`)
    for (const d of duplicates((co.dsaPatterns ?? []).map((rp) => rp.key)))
      errors.push(`company ${co.key}: round pattern "${d}" listed twice`)
    for (const g of co.questions)
      for (const q of g.questions)
        for (const key of q.patterns ?? [])
          if (!patternKeys.has(key)) errors.push(`question ${q.id}: pattern "${key}" does not exist`)
  }

  return errors
}
