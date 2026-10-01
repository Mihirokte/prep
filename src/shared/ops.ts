import { current, isDraft, produce } from 'immer'
import { ENTITIES, type Entity, exists, idsOf, labelOf, locate, slugify, uniqueId } from './locate'
import { validateContent } from './validate'
import type { Content } from './types'

// The assistant's operation language and the pure engine that applies it.
//
// A plan is a list of operations. applyOps() runs all of them against an
// immutable Content, then validates the whole result; either every operation
// lands and the store stays consistent, or nothing does and the caller gets
// the reasons. No I/O happens here.

export const RELATIONS = [
  'pattern-problem',
  'question-pattern',
  'company-pattern',
  'chapter-problem',
  'pattern-contrast',
] as const
export type Relation = (typeof RELATIONS)[number]

export const OP_KINDS = [
  'create',
  'update',
  'delete',
  'move',
  'add_items',
  'remove_items',
  'link',
  'unlink',
] as const
export type OpKind = (typeof OP_KINDS)[number]

type Data = Record<string, unknown>

export type Op =
  | { op: 'create'; entity: Entity; id: string; parent?: string; index?: number; data: Data }
  | { op: 'update'; entity: Entity; id: string; data: Data }
  | { op: 'delete'; entity: Entity; id: string }
  | { op: 'move'; entity: Entity; id: string; parent?: string; index?: number }
  | { op: 'add_items'; entity: Entity; id: string; field: string; items: unknown[] }
  | { op: 'remove_items'; entity: Entity; id: string; field: string; items: unknown[] }
  | { op: 'link'; relation: Relation; from: string; to: string; data?: Data }
  | { op: 'unlink'; relation: Relation; from: string; to: string }

export interface FieldChange {
  field: string
  before?: string
  after?: string
}

/** One line of the reviewable preview. */
export interface Change {
  kind: 'create' | 'update' | 'delete' | 'move' | 'link' | 'unlink'
  entity: Entity | 'mapping'
  id: string
  label: string
  fields?: FieldChange[]
  notes?: string[]
}

export type PlanResult =
  | { ok: true; content: Content; changes: Change[] }
  | { ok: false; errors: string[] }

// ---------------------------------------------------------------------------
// Wire format: what the model returns. Structured-output schemas cannot carry
// free-form objects portably, so record data travels as JSON strings.

export interface WireOp {
  op: string
  entity?: string
  id?: string
  parent?: string
  index?: number
  field?: string
  relation?: string
  from?: string
  to?: string
  data_json?: string
  items_json?: string
}

const isEntity = (v: unknown): v is Entity => ENTITIES.includes(v as Entity)
const isRelation = (v: unknown): v is Relation => RELATIONS.includes(v as Relation)
const isObject = (v: unknown): v is Data => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

function parseJson(raw: string | undefined, what: string): unknown {
  if (raw === undefined || raw.trim() === '') return undefined
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new Error(`${what} is not valid JSON (${e instanceof Error ? e.message : String(e)})`)
  }
}

/** Convert and shape-check the model's operations. */
export function decodeOps(wire: WireOp[]): { ops: Op[]; errors: string[] } {
  const ops: Op[] = []
  const errors: string[] = []
  wire.forEach((w, i) => {
    const where = `operation ${i + 1} (${w.op ?? '?'} ${w.entity ?? w.relation ?? ''} ${w.id ?? w.from ?? ''})`.replace(/\s+\)/, ')')
    try {
      const kind = w.op as OpKind
      if (!OP_KINDS.includes(kind)) throw new Error(`unknown op "${w.op}"`)
      if (kind === 'link' || kind === 'unlink') {
        if (!isRelation(w.relation)) throw new Error(`relation must be one of ${RELATIONS.join(', ')}`)
        if (!w.from || !w.to) throw new Error('link/unlink need both "from" and "to"')
        if (kind === 'unlink') return void ops.push({ op: 'unlink', relation: w.relation, from: w.from, to: w.to })
        const data = parseJson(w.data_json, 'data_json')
        if (data !== undefined && !isObject(data)) throw new Error('data_json must encode an object')
        return void ops.push({ op: 'link', relation: w.relation, from: w.from, to: w.to, data })
      }
      if (!isEntity(w.entity)) throw new Error(`entity must be one of ${ENTITIES.join(', ')}`)
      const id = (w.id ?? '').trim()
      if (kind !== 'create' && !id) throw new Error('"id" is required')
      const index = typeof w.index === 'number' && Number.isFinite(w.index) ? Math.trunc(w.index) : undefined
      const parent = w.parent?.trim() || undefined
      switch (kind) {
        case 'create': {
          const data = parseJson(w.data_json, 'data_json') ?? {}
          if (!isObject(data)) throw new Error('data_json must encode an object')
          return void ops.push({ op: 'create', entity: w.entity, id, parent, index, data })
        }
        case 'update': {
          const data = parseJson(w.data_json, 'data_json')
          if (!isObject(data) || Object.keys(data).length === 0)
            throw new Error('data_json must encode an object with the fields to change')
          return void ops.push({ op: 'update', entity: w.entity, id, data })
        }
        case 'delete':
          return void ops.push({ op: 'delete', entity: w.entity, id })
        case 'move':
          if (parent === undefined && index === undefined) throw new Error('move needs "parent", "index" or both')
          return void ops.push({ op: 'move', entity: w.entity, id, parent, index })
        case 'add_items':
        case 'remove_items': {
          if (!w.field) throw new Error('"field" is required')
          const items = parseJson(w.items_json, 'items_json')
          if (!Array.isArray(items) || items.length === 0) throw new Error('items_json must encode a non-empty array')
          return void ops.push({ op: kind, entity: w.entity, id, field: w.field, items })
        }
      }
    } catch (e) {
      errors.push(`${where}: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
  return { ops, errors }
}

// ---------------------------------------------------------------------------
// Engine

class OpError extends Error {}
function fail(msg: string): never {
  throw new OpError(msg)
}

const ID_FIELD: Record<Entity, 'key' | 'id'> = {
  area: 'key',
  problem: 'id',
  pack: 'id',
  course: 'key',
  chapter: 'id',
  lesson: 'id',
  pattern: 'key',
  company: 'key',
  round: 'id',
  question: 'id',
}

/** Child collections are edited through their own entity, never replaced wholesale. */
const CHILDREN: Partial<Record<Entity, { field: string; entity: Entity }>> = {
  area: { field: 'drills', entity: 'problem' },
  course: { field: 'chapters', entity: 'chapter' },
  chapter: { field: 'lessons', entity: 'lesson' },
  company: { field: 'questions', entity: 'round' },
  round: { field: 'questions', entity: 'question' },
}

/** Fields add_items/remove_items may touch. A value names the key that
 *  identifies an object item; null means a list of plain values. */
export const LIST_FIELDS: Partial<Record<Entity, Record<string, string | null>>> = {
  pattern: { cues: null, pitfalls: null, problemIds: null, contrasts: 'key' },
  company: { specialNotes: null, lldPrep: 'topic', dsaPatterns: 'key' },
  question: { related: null, patterns: null },
  course: { references: 'url', suppressedProblemIds: null },
  chapter: { problemIds: null },
}

const RELATION_LABEL: Record<Relation, string> = {
  'pattern-problem': 'pattern → problem',
  'question-pattern': 'question → pattern',
  'company-pattern': 'company round → pattern',
  'chapter-problem': 'chapter → practice problem',
  'pattern-contrast': 'pattern → contrasting pattern',
}

const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

function show(v: unknown): string {
  if (v === undefined) return '—'
  if (typeof v === 'string') return clip(v)
  const plain = isDraft(v) ? current(v) : v
  return clip(JSON.stringify(plain))
}

function recordOf(d: Content, entity: Entity, id: string): Data | undefined {
  switch (entity) {
    case 'area':
      return locate.area(d, id)?.area as unknown as Data
    case 'problem':
      return locate.problem(d, id)?.drill as unknown as Data
    case 'pack':
      return d.packs[id] as unknown as Data
    case 'course':
      return locate.course(d, id)?.course as unknown as Data
    case 'chapter':
      return locate.chapter(d, id)?.chapter as unknown as Data
    case 'lesson':
      return locate.lesson(d, id)?.lesson as unknown as Data
    case 'pattern':
      return locate.pattern(d, id)?.pattern as unknown as Data
    case 'company':
      return locate.company(d, id)?.company as unknown as Data
    case 'round':
      return locate.round(d, id)?.round as unknown as Data
    case 'question':
      return locate.question(d, id)?.question as unknown as Data
  }
}

const must = <T>(v: T | undefined, what: string): T => v ?? fail(`${what} does not exist`)
const at = (len: number, index?: number) =>
  index === undefined ? len : Math.max(0, Math.min(len, index < 0 ? len + index + 1 : index))

interface Ctx {
  changes: Change[]
  touchedCompanies: Set<string>
  explicitlyDated: Set<string>
}

/** Company that owns a round or question id, for the "updated" stamp. */
function companyOf(d: Content, entity: Entity, id: string): string | undefined {
  if (entity === 'company') return id
  if (entity === 'round') return locate.round(d, id)?.company.key
  if (entity === 'question') return locate.question(d, id)?.company.key
  return undefined
}

// ---- nested children on create ----

function asList(raw: unknown, what: string): Data[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) fail(`${what} must be a list`)
  return (raw as unknown[]).map((x, i) => (isObject(x) ? { ...x } : fail(`${what}[${i}] must be an object`)))
}

function nextNumbered(prefix: string, taken: Set<string>): string {
  let max = 0
  for (const id of taken) {
    const m = id.startsWith(`${prefix}-`) ? /^(\d+)$/.exec(id.slice(prefix.length + 1)) : null
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}-${max + 1}`
}

function lessonsFrom(raw: unknown, courseKey: string, taken: Set<string>): Data[] {
  return asList(raw, 'lessons').map((l) => {
    const id = typeof l.id === 'string' && l.id ? l.id : uniqueId(`${courseKey}-${slugify(String(l.title ?? 'lesson'))}`, taken)
    taken.add(id)
    return withReadTime({ ...l, id })
  })
}

function chaptersFrom(raw: unknown, courseKey: string, d: Content): Data[] {
  const chapterIds = idsOf(d, 'chapter')
  const lessonIds = idsOf(d, 'lesson')
  return asList(raw, 'chapters').map((ch) => {
    const id = typeof ch.id === 'string' && ch.id ? ch.id : uniqueId(`${courseKey}-${slugify(String(ch.title ?? 'chapter'))}`, chapterIds)
    chapterIds.add(id)
    return { summary: '', ...ch, id, lessons: lessonsFrom(ch.lessons, courseKey, lessonIds) }
  })
}

function questionsFrom(raw: unknown, roundId: string, taken: Set<string>): Data[] {
  return asList(raw, 'questions').map((q) => {
    const id = typeof q.id === 'string' && q.id ? q.id : nextNumbered(roundId, taken)
    taken.add(id)
    return { ...q, id }
  })
}

function roundsFrom(raw: unknown, companyKey: string, d: Content): Data[] {
  const roundIds = idsOf(d, 'round')
  const questionIds = idsOf(d, 'question')
  return asList(raw, 'rounds').map((r) => {
    const id = typeof r.id === 'string' && r.id ? r.id : uniqueId(`${companyKey}-${slugify(String(r.round ?? 'round'))}`, roundIds)
    roundIds.add(id)
    return { ...r, id, questions: questionsFrom(r.questions, id, questionIds) }
  })
}

/** A lesson with no stated read time gets one from its length (~200 wpm). */
function withReadTime(l: Data): Data {
  if (typeof l.minutes === 'number') return l
  const words = `${l.body ?? ''} ${l.deeper ?? ''}`.split(/\s+/).filter(Boolean).length
  return { ...l, minutes: Math.max(1, Math.round(words / 200)) }
}

const today = (): string => new Date().toISOString().slice(0, 10)

// ---- create ----

function deriveId(d: Content, entity: Entity, parent: string | undefined, data: Data): string {
  const name = String(data.name ?? data.title ?? data.label ?? data.round ?? 'item')
  switch (entity) {
    case 'problem': {
      const area = parent ?? 'dsa'
      return nextNumbered(area, idsOf(d, 'problem')).replace(/-(\d+)$/, (_, n: string) => `-${n.padStart(3, '0')}`)
    }
    case 'chapter':
    case 'lesson': {
      const course =
        entity === 'chapter' ? parent : parent ? locate.chapter(d, parent)?.course.key : undefined
      return uniqueId(`${course ?? 'lesson'}-${slugify(name)}`, idsOf(d, entity))
    }
    case 'round':
      return uniqueId(`${parent ?? 'round'}-${slugify(name)}`, idsOf(d, 'round'))
    case 'question':
      return nextNumbered(parent ?? 'question', idsOf(d, 'question'))
    default:
      return uniqueId(slugify(name), idsOf(d, entity))
  }
}

function createRecord(d: Content, op: Extract<Op, { op: 'create' }>, ctx: Ctx) {
  const { entity } = op
  const data: Data = { ...op.data }
  const inlineId = data[ID_FIELD[entity]]
  delete data.id
  delete data.key
  let parent = op.parent
  // A problem's area is implied by its id prefix when not given ("dsa-149" → dsa).
  if (entity === 'problem' && !parent && op.id) parent = /^(.+)-\d+$/.exec(op.id)?.[1]
  const id = op.id || (typeof inlineId === 'string' && inlineId) || deriveId(d, entity, parent, data)
  if (exists(d, entity, id)) fail(`${entity} "${id}" already exists — use update instead`)
  const notes: string[] = []

  switch (entity) {
    case 'area': {
      const drills = asList(data.drills, 'drills')
      d.areas.splice(at(d.areas.length, op.index), 0, { ...data, key: id, drills } as never)
      break
    }
    case 'problem': {
      const area = must(parent ? locate.area(d, parent)?.area : undefined, `area "${parent ?? '(none given)'}"`)
      const rec: Data = { topic: '', difficulty: '', link: '', notes: '', ...data, id }
      if (!rec.prompt && area.key === 'dsa' && rec.title)
        rec.prompt = `Solve "${rec.title}" (${rec.difficulty}, ${rec.topic}). State the recognition cue that points to this pattern, implement an optimal solution, and state time/space complexity.`
      area.drills.splice(at(area.drills.length, op.index), 0, rec as never)
      break
    }
    case 'pack': {
      const drill = must(locate.problem(d, id)?.drill, `problem "${id}"`)
      const slug = /leetcode\.com\/problems\/([^/]+)/.exec(String(data.link ?? drill.link))?.[1] ?? slugify(drill.title)
      d.packs[id] = {
        slug,
        title: drill.title,
        difficulty: drill.difficulty,
        topic: drill.topic,
        link: drill.link,
        starter_code: '',
        ...data,
        id,
      } as never
      break
    }
    case 'course': {
      const chapters = chaptersFrom(data.chapters, id, d)
      d.courses.splice(at(d.courses.length, op.index), 0, { blurb: '', ...data, key: id, chapters } as never)
      break
    }
    case 'chapter': {
      const course = must(parent ? locate.course(d, parent)?.course : undefined, `course "${parent ?? '(none given)'}"`)
      const lessons = lessonsFrom(data.lessons, course.key, idsOf(d, 'lesson'))
      course.chapters.splice(at(course.chapters.length, op.index), 0, { summary: '', ...data, id, lessons } as never)
      break
    }
    case 'lesson': {
      const chapter = must(parent ? locate.chapter(d, parent)?.chapter : undefined, `chapter "${parent ?? '(none given)'}"`)
      chapter.lessons.splice(at(chapter.lessons.length, op.index), 0, withReadTime({ ...data, id }) as never)
      break
    }
    case 'pattern': {
      d.patterns.splice(at(d.patterns.length, op.index), 0, {
        canonical: false,
        problemIds: [],
        ...data,
        key: id,
      } as never)
      break
    }
    case 'company': {
      const rounds = roundsFrom(data.questions ?? data.rounds, id, d)
      delete data.rounds
      d.companies.splice(at(d.companies.length, op.index), 0, {
        descriptor: '',
        coverage: 'thin',
        lldPrep: [],
        specialNotes: [],
        ...data,
        key: id,
        questions: rounds,
        updated: today(),
      } as never)
      ctx.touchedCompanies.add(id)
      break
    }
    case 'round': {
      const company = must(parent ? locate.company(d, parent)?.company : undefined, `company "${parent ?? '(none given)'}"`)
      const questions = questionsFrom(data.questions, id, idsOf(d, 'question'))
      company.questions.splice(at(company.questions.length, op.index), 0, { ...data, id, questions } as never)
      ctx.touchedCompanies.add(company.key)
      break
    }
    case 'question': {
      const loc = must(parent ? locate.round(d, parent) : undefined, `round "${parent ?? '(none given)'}"`)
      loc.round.questions.splice(at(loc.round.questions.length, op.index), 0, { ...data, id } as never)
      ctx.touchedCompanies.add(loc.company.key)
      break
    }
  }

  const fields = Object.entries(op.data)
    .filter(([k]) => k !== 'id' && k !== 'key')
    .map(([field, v]) => ({ field, after: show(v) }))
  ctx.changes.push({ kind: 'create', entity, id, label: labelOf(d, entity, id), fields, notes })
}

// ---- update ----

/** Drill fields a runnable pack duplicates; kept in step on update. */
const MIRRORED = ['title', 'difficulty', 'topic', 'link'] as const

function updateRecord(d: Content, op: Extract<Op, { op: 'update' }>, ctx: Ctx) {
  const { entity, id } = op
  const rec = must(recordOf(d, entity, id), `${entity} "${id}"`)
  const child = CHILDREN[entity]
  const fields: FieldChange[] = []
  const notes: string[] = []
  const pack = entity === 'problem' ? (d.packs[id] as unknown as Data | undefined) : undefined

  for (const [field, value] of Object.entries(op.data)) {
    if (field === 'id' || field === 'key') {
      if (value === id) continue
      fail(`${entity} ids cannot change; create the new record and delete "${id}"`)
    }
    if (child && field === child.field)
      fail(`${entity}.${field} is edited through ${child.entity} operations (create, update, delete, move), not replaced`)
    if (entity === 'company' && field === 'rounds') fail('rounds are edited through round operations')
    const before = rec[field]
    if (value === null) delete rec[field]
    else rec[field] = value
    fields.push({ field, before: show(before), after: value === null ? '—' : show(value) })
    if (pack && (MIRRORED as readonly string[]).includes(field) && value !== null && pack[field] === before) {
      pack[field] = value
      notes.push(`also updated ${field} in its runnable pack`)
    }
    if (entity === 'company' && field === 'updated') ctx.explicitlyDated.add(id)
  }

  const co = companyOf(d, entity, id)
  if (co) ctx.touchedCompanies.add(co)
  ctx.changes.push({ kind: 'update', entity, id, label: labelOf(d, entity, id), fields, notes })
}

// ---- delete (cascading) ----

function scrubProblem(d: Content, id: string, tally: Record<string, number>) {
  if (d.packs[id]) {
    delete d.packs[id]
    tally.packs = (tally.packs ?? 0) + 1
  }
  for (const p of d.patterns) {
    const i = p.problemIds.indexOf(id)
    if (i >= 0) {
      p.problemIds.splice(i, 1)
      tally.patterns = (tally.patterns ?? 0) + 1
    }
  }
  for (const c of d.courses) {
    for (const ch of c.chapters)
      if (ch.problemIds?.includes(id)) {
        ch.problemIds = ch.problemIds.filter((x) => x !== id)
        tally.chapters = (tally.chapters ?? 0) + 1
      }
    if (c.suppressedProblemIds?.includes(id)) c.suppressedProblemIds = c.suppressedProblemIds.filter((x) => x !== id)
  }
}

function tallyNotes(t: Record<string, number>): string[] {
  const out: string[] = []
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  if (t.problems) out.push(`deletes ${plural(t.problems, 'problem')}`)
  if (t.packs) out.push(`deletes ${plural(t.packs, 'runnable pack')}`)
  if (t.patterns) out.push(`removes it from ${plural(t.patterns, 'pattern mapping')}`)
  if (t.chapters) out.push(`removes it from ${plural(t.chapters, 'chapter practice list')}`)
  if (t.chaptersDeleted) out.push(`deletes ${plural(t.chaptersDeleted, 'chapter')}`)
  if (t.lessons) out.push(`deletes ${plural(t.lessons, 'lesson')}`)
  if (t.rounds) out.push(`deletes ${plural(t.rounds, 'round')}`)
  if (t.questions) out.push(`deletes ${plural(t.questions, 'question')}`)
  if (t.questionLinks) out.push(`unlinks it from ${plural(t.questionLinks, 'question')}`)
  if (t.companyLinks) out.push(`unlinks it from ${plural(t.companyLinks, 'company round')}`)
  if (t.contrasts) out.push(`removes ${plural(t.contrasts, 'contrast')} pointing at it`)
  if (t.courses) out.push(`clears the practice area of ${plural(t.courses, 'course')}`)
  return out
}

function deleteRecord(d: Content, op: Extract<Op, { op: 'delete' }>, ctx: Ctx) {
  const { entity, id } = op
  const label = labelOf(d, entity, id)
  const t: Record<string, number> = {}

  switch (entity) {
    case 'problem': {
      const loc = must(locate.problem(d, id), `problem "${id}"`)
      loc.area.drills.splice(loc.index, 1)
      scrubProblem(d, id, t)
      break
    }
    case 'pack':
      if (!d.packs[id]) fail(`pack "${id}" does not exist`)
      delete d.packs[id]
      break
    case 'area': {
      const loc = must(locate.area(d, id), `area "${id}"`)
      for (const drill of [...loc.area.drills]) scrubProblem(d, drill.id, t)
      t.problems = loc.area.drills.length
      d.areas.splice(loc.index, 1)
      for (const c of d.courses)
        if (c.problemAreaKey === id) {
          delete c.problemAreaKey
          t.courses = (t.courses ?? 0) + 1
        }
      break
    }
    case 'course': {
      const loc = must(locate.course(d, id), `course "${id}"`)
      t.chaptersDeleted = loc.course.chapters.length
      t.lessons = loc.course.chapters.reduce((n, ch) => n + ch.lessons.length, 0)
      d.courses.splice(loc.index, 1)
      break
    }
    case 'chapter': {
      const loc = must(locate.chapter(d, id), `chapter "${id}"`)
      t.lessons = loc.chapter.lessons.length
      loc.course.chapters.splice(loc.index, 1)
      break
    }
    case 'lesson': {
      const loc = must(locate.lesson(d, id), `lesson "${id}"`)
      loc.chapter.lessons.splice(loc.index, 1)
      break
    }
    case 'pattern': {
      const loc = must(locate.pattern(d, id), `pattern "${id}"`)
      d.patterns.splice(loc.index, 1)
      for (const co of d.companies) {
        if (co.dsaPatterns?.some((rp) => rp.key === id)) {
          co.dsaPatterns = co.dsaPatterns.filter((rp) => rp.key !== id)
          t.companyLinks = (t.companyLinks ?? 0) + 1
          ctx.touchedCompanies.add(co.key)
        }
        for (const g of co.questions)
          for (const q of g.questions)
            if (q.patterns?.includes(id)) {
              q.patterns = q.patterns.filter((k) => k !== id)
              t.questionLinks = (t.questionLinks ?? 0) + 1
              ctx.touchedCompanies.add(co.key)
            }
      }
      for (const p of d.patterns)
        if (p.contrasts?.some((ct) => ct.key === id)) {
          p.contrasts = p.contrasts.filter((ct) => ct.key !== id)
          t.contrasts = (t.contrasts ?? 0) + 1
        }
      break
    }
    case 'company': {
      const loc = must(locate.company(d, id), `company "${id}"`)
      t.rounds = loc.company.questions.length
      t.questions = loc.company.questions.reduce((n, g) => n + g.questions.length, 0)
      d.companies.splice(loc.index, 1)
      break
    }
    case 'round': {
      const loc = must(locate.round(d, id), `round "${id}"`)
      t.questions = loc.round.questions.length
      loc.company.questions.splice(loc.index, 1)
      ctx.touchedCompanies.add(loc.company.key)
      break
    }
    case 'question': {
      const loc = must(locate.question(d, id), `question "${id}"`)
      loc.round.questions.splice(loc.index, 1)
      ctx.touchedCompanies.add(loc.company.key)
      break
    }
  }
  ctx.changes.push({ kind: 'delete', entity, id, label, notes: tallyNotes(t) })
}

// ---- move ----

function moveWithin<T>(from: T[], fromIndex: number, to: T[], index?: number) {
  const [item] = from.splice(fromIndex, 1)
  to.splice(at(to.length, index), 0, item)
}

function moveRecord(d: Content, op: Extract<Op, { op: 'move' }>, ctx: Ctx) {
  const { entity, id, parent, index } = op
  let where = ''
  switch (entity) {
    case 'problem': {
      const loc = must(locate.problem(d, id), `problem "${id}"`)
      const target = parent ? must(locate.area(d, parent)?.area, `area "${parent}"`) : loc.area
      moveWithin(loc.area.drills, loc.index, target.drills, index)
      where = target.label
      break
    }
    case 'chapter': {
      const loc = must(locate.chapter(d, id), `chapter "${id}"`)
      const target = parent ? must(locate.course(d, parent)?.course, `course "${parent}"`) : loc.course
      moveWithin(loc.course.chapters, loc.index, target.chapters, index)
      where = target.label
      break
    }
    case 'lesson': {
      const loc = must(locate.lesson(d, id), `lesson "${id}"`)
      const target = parent ? must(locate.chapter(d, parent)?.chapter, `chapter "${parent}"`) : loc.chapter
      moveWithin(loc.chapter.lessons, loc.index, target.lessons, index)
      where = target.title
      break
    }
    case 'round': {
      const loc = must(locate.round(d, id), `round "${id}"`)
      const target = parent ? must(locate.company(d, parent)?.company, `company "${parent}"`) : loc.company
      moveWithin(loc.company.questions, loc.index, target.questions, index)
      ctx.touchedCompanies.add(loc.company.key).add(target.key)
      where = target.name
      break
    }
    case 'question': {
      const loc = must(locate.question(d, id), `question "${id}"`)
      const target = parent ? must(locate.round(d, parent), `round "${parent}"`) : { round: loc.round, company: loc.company }
      moveWithin(loc.round.questions, loc.index, target.round.questions, index)
      ctx.touchedCompanies.add(loc.company.key).add(target.company.key)
      where = `${target.company.name} — ${target.round.round}`
      break
    }
    case 'area':
    case 'course':
    case 'pattern':
    case 'company': {
      if (parent) fail(`${entity} records are top level and have no parent`)
      const list = (entity === 'area' ? d.areas : entity === 'course' ? d.courses : entity === 'pattern' ? d.patterns : d.companies) as { key: string }[]
      const i = list.findIndex((x) => x.key === id)
      if (i < 0) fail(`${entity} "${id}" does not exist`)
      moveWithin(list, i, list, index)
      where = 'top level'
      break
    }
    case 'pack':
      fail('packs belong to their problem and cannot be moved')
  }
  ctx.changes.push({
    kind: 'move',
    entity,
    id,
    label: labelOf(d, entity, id),
    notes: [`to ${where}${index === undefined ? '' : `, position ${index + 1}`}`],
  })
}

// ---- list items ----

function listFor(d: Content, op: { entity: Entity; id: string; field: string }): { list: unknown[]; match: string | null } {
  const spec = LIST_FIELDS[op.entity]
  if (!spec || !(op.field in spec)) {
    const allowed = Object.entries(LIST_FIELDS)
      .flatMap(([e, f]) => Object.keys(f ?? {}).map((k) => `${e}.${k}`))
      .join(', ')
    fail(`${op.entity}.${op.field} is not a list field (list fields: ${allowed})`)
  }
  const rec = must(recordOf(d, op.entity, op.id), `${op.entity} "${op.id}"`)
  if (rec[op.field] === undefined) rec[op.field] = []
  const list = rec[op.field]
  if (!Array.isArray(list)) fail(`${op.entity}.${op.field} is not a list`)
  return { list: list as unknown[], match: spec![op.field] }
}

function addItems(d: Content, op: Extract<Op, { op: 'add_items' }>, ctx: Ctx) {
  const { list, match } = listFor(d, op)
  const added: string[] = []
  for (const item of op.items) {
    if (match) {
      if (!isObject(item)) fail(`${op.field} items are objects with a "${match}" field`)
      if (list.some((x) => isObject(x) && x[match] === item[match]))
        fail(`${op.entity} ${op.id} already has a ${op.field} item with ${match} "${String(item[match])}" — use update`)
    } else if (list.includes(item)) continue
    list.push(item)
    added.push(show(item))
  }
  const co = companyOf(d, op.entity, op.id)
  if (co) ctx.touchedCompanies.add(co)
  if (added.length)
    ctx.changes.push({
      kind: 'update',
      entity: op.entity,
      id: op.id,
      label: labelOf(d, op.entity, op.id),
      fields: added.map((a) => ({ field: `${op.field} +`, after: a })),
    })
}

function removeItems(d: Content, op: Extract<Op, { op: 'remove_items' }>, ctx: Ctx) {
  const { list, match } = listFor(d, op)
  const indexes = new Set<number>()
  for (const item of op.items) {
    let i = -1
    if (typeof item === 'number') i = Number.isInteger(item) && item >= 0 && item < list.length ? item : -1
    else if (match) {
      const want = isObject(item) ? item[match] : item
      i = list.findIndex((x) => isObject(x) && x[match] === want)
    } else i = list.findIndex((x) => x === item || (typeof x === 'string' && typeof item === 'string' && x.trim() === item.trim()))
    if (i < 0)
      fail(
        `${op.entity} ${op.id}.${op.field} has no item ${JSON.stringify(item)}; current items by index: ${list
          .map((x, n) => `${n}: ${show(x)}`)
          .join(' | ')}`,
      )
    indexes.add(i)
  }
  const removed = [...indexes].sort((a, b) => b - a).map((i) => show(list.splice(i, 1)[0]))
  const co = companyOf(d, op.entity, op.id)
  if (co) ctx.touchedCompanies.add(co)
  ctx.changes.push({
    kind: 'update',
    entity: op.entity,
    id: op.id,
    label: labelOf(d, op.entity, op.id),
    fields: removed.reverse().map((r) => ({ field: `${op.field} −`, before: r })),
  })
}

// ---- mappings ----

function linkLabel(d: Content, relation: Relation, from: string, to: string): string {
  const [fe, te]: [Entity, Entity] =
    relation === 'pattern-problem' ? ['pattern', 'problem']
    : relation === 'question-pattern' ? ['question', 'pattern']
    : relation === 'company-pattern' ? ['company', 'pattern']
    : relation === 'chapter-problem' ? ['chapter', 'problem']
    : ['pattern', 'pattern']
  return `${labelOf(d, fe, from)} → ${labelOf(d, te, to)}`
}

function link(d: Content, op: Extract<Op, { op: 'link' }>, ctx: Ctx) {
  const { relation, from, to } = op
  const data = op.data ?? {}
  const notes = [RELATION_LABEL[relation]]
  switch (relation) {
    case 'pattern-problem': {
      const pat = must(locate.pattern(d, from)?.pattern, `pattern "${from}"`)
      must(locate.problem(d, to), `problem "${to}"`)
      if (pat.problemIds.includes(to)) return
      pat.problemIds.push(to)
      break
    }
    case 'question-pattern': {
      const loc = must(locate.question(d, from), `question "${from}"`)
      must(locate.pattern(d, to), `pattern "${to}"`)
      const list = (loc.question.patterns ??= [])
      if (list.includes(to)) return
      list.push(to)
      ctx.touchedCompanies.add(loc.company.key)
      break
    }
    case 'company-pattern': {
      const co = must(locate.company(d, from)?.company, `company "${from}"`)
      must(locate.pattern(d, to), `pattern "${to}"`)
      const basis = data.basis ?? 'implied'
      if (basis !== 'reported' && basis !== 'implied') fail('company-pattern "basis" must be "reported" or "implied"')
      const why = typeof data.why === 'string' ? data.why : ''
      const list = (co.dsaPatterns ??= [])
      const existing = list.find((rp) => rp.key === to)
      if (existing) {
        existing.basis = basis
        if (why) existing.why = why
        notes.push('updated the existing mapping')
      } else {
        if (!why.trim()) fail('company-pattern links need data_json {"basis": "reported" | "implied", "why": "what in the round points here"}')
        list.push({ key: to, basis, why })
      }
      notes.push(basis === 'reported' ? 'from a reported question' : 'from the reported topics')
      ctx.touchedCompanies.add(co.key)
      break
    }
    case 'chapter-problem': {
      const ch = must(locate.chapter(d, from)?.chapter, `chapter "${from}"`)
      must(locate.problem(d, to), `problem "${to}"`)
      const list = (ch.problemIds ??= [])
      if (list.includes(to)) return
      list.push(to)
      break
    }
    case 'pattern-contrast': {
      const pat = must(locate.pattern(d, from)?.pattern, `pattern "${from}"`)
      must(locate.pattern(d, to), `pattern "${to}"`)
      if (from === to) fail('a pattern cannot contrast with itself')
      const how = typeof data.how === 'string' ? data.how : ''
      const list = (pat.contrasts ??= [])
      const existing = list.find((ct) => ct.key === to)
      if (existing) {
        if (!how.trim()) return
        existing.how = how
        notes.push('updated the existing contrast')
      } else {
        if (!how.trim()) fail('pattern-contrast links need data_json {"how": "how to tell the two apart"}')
        list.push({ key: to, how })
      }
      break
    }
  }
  ctx.changes.push({ kind: 'link', entity: 'mapping', id: `${relation}:${from}:${to}`, label: linkLabel(d, relation, from, to), notes })
}

function unlink(d: Content, op: Extract<Op, { op: 'unlink' }>, ctx: Ctx) {
  const { relation, from, to } = op
  const label = linkLabel(d, relation, from, to)
  const gone = () => fail(`${from} and ${to} are not linked by ${relation}`)
  switch (relation) {
    case 'pattern-problem': {
      const pat = must(locate.pattern(d, from)?.pattern, `pattern "${from}"`)
      const i = pat.problemIds.indexOf(to)
      if (i < 0) gone()
      pat.problemIds.splice(i, 1)
      break
    }
    case 'question-pattern': {
      const loc = must(locate.question(d, from), `question "${from}"`)
      if (!loc.question.patterns?.includes(to)) gone()
      loc.question.patterns = loc.question.patterns!.filter((k) => k !== to)
      ctx.touchedCompanies.add(loc.company.key)
      break
    }
    case 'company-pattern': {
      const co = must(locate.company(d, from)?.company, `company "${from}"`)
      if (!co.dsaPatterns?.some((rp) => rp.key === to)) gone()
      co.dsaPatterns = co.dsaPatterns!.filter((rp) => rp.key !== to)
      ctx.touchedCompanies.add(co.key)
      break
    }
    case 'chapter-problem': {
      const ch = must(locate.chapter(d, from)?.chapter, `chapter "${from}"`)
      if (!ch.problemIds?.includes(to)) gone()
      ch.problemIds = ch.problemIds!.filter((x) => x !== to)
      break
    }
    case 'pattern-contrast': {
      const pat = must(locate.pattern(d, from)?.pattern, `pattern "${from}"`)
      if (!pat.contrasts?.some((ct) => ct.key === to)) gone()
      pat.contrasts = pat.contrasts!.filter((ct) => ct.key !== to)
      break
    }
  }
  ctx.changes.push({ kind: 'unlink', entity: 'mapping', id: `${relation}:${from}:${to}`, label, notes: [RELATION_LABEL[relation]] })
}

// ---------------------------------------------------------------------------

function describeOp(op: Op, i: number): string {
  if (op.op === 'link' || op.op === 'unlink') return `operation ${i + 1} (${op.op} ${op.relation} ${op.from} → ${op.to})`
  return `operation ${i + 1} (${op.op} ${op.entity} ${op.id || '(new)'})`
}

/** Apply a whole plan. All-or-nothing: any failing operation or any integrity
 *  error in the result rejects the plan and leaves `content` untouched. */
export function applyOps(content: Content, ops: Op[], date = today()): PlanResult {
  const errors: string[] = []
  const ctx: Ctx = { changes: [], touchedCompanies: new Set(), explicitlyDated: new Set() }

  const next = produce(content, (d) => {
    ops.forEach((op, i) => {
      try {
        switch (op.op) {
          case 'create':
            return createRecord(d as Content, op, ctx)
          case 'update':
            return updateRecord(d as Content, op, ctx)
          case 'delete':
            return deleteRecord(d as Content, op, ctx)
          case 'move':
            return moveRecord(d as Content, op, ctx)
          case 'add_items':
            return addItems(d as Content, op, ctx)
          case 'remove_items':
            return removeItems(d as Content, op, ctx)
          case 'link':
            return link(d as Content, op, ctx)
          case 'unlink':
            return unlink(d as Content, op, ctx)
        }
      } catch (e) {
        if (!(e instanceof OpError)) throw e
        errors.push(`${describeOp(op, i)}: ${e.message}`)
      }
    })
    for (const key of ctx.touchedCompanies) {
      if (ctx.explicitlyDated.has(key)) continue
      const co = locate.company(d as Content, key)?.company
      if (co) co.updated = date
    }
  })

  if (errors.length) return { ok: false, errors }
  errors.push(...validateContent(next))
  if (errors.length) return { ok: false, errors }
  return { ok: true, content: next, changes: ctx.changes }
}

/** One line per change, for the history log and the conversation transcript. */
export function summarizeChanges(changes: Change[]): string {
  return changes
    .map((c) =>
      c.entity === 'mapping' ? `${c.kind}ed ${c.label}` : `${c.kind === 'create' ? 'created' : c.kind === 'delete' ? 'deleted' : c.kind === 'move' ? 'moved' : 'updated'} ${c.entity} "${c.label}" (${c.id})`,
    )
    .join('; ')
}
