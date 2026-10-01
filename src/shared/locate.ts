import type {
  AskedQuestion,
  Area,
  Chapter,
  Company,
  Content,
  Course,
  Drill,
  Lesson,
  Pattern,
  QuestionGroup,
} from './types'

// Pure lookups over a Content tree. They work on plain objects and on immer
// drafts alike, so the change engine and the read-only callers share them.

export const ENTITIES = [
  'area',
  'problem',
  'pack',
  'course',
  'chapter',
  'lesson',
  'pattern',
  'company',
  'round',
  'question',
] as const
export type Entity = (typeof ENTITIES)[number]

export const locate = {
  area: (c: Content, key: string): { index: number; area: Area } | undefined => {
    const index = c.areas.findIndex((a) => a.key === key)
    return index < 0 ? undefined : { index, area: c.areas[index] }
  },
  problem: (c: Content, id: string): { area: Area; index: number; drill: Drill } | undefined => {
    for (const area of c.areas) {
      const index = area.drills.findIndex((d) => d.id === id)
      if (index >= 0) return { area, index, drill: area.drills[index] }
    }
    return undefined
  },
  course: (c: Content, key: string): { index: number; course: Course } | undefined => {
    const index = c.courses.findIndex((x) => x.key === key)
    return index < 0 ? undefined : { index, course: c.courses[index] }
  },
  chapter: (c: Content, id: string): { course: Course; index: number; chapter: Chapter } | undefined => {
    for (const course of c.courses) {
      const index = course.chapters.findIndex((ch) => ch.id === id)
      if (index >= 0) return { course, index, chapter: course.chapters[index] }
    }
    return undefined
  },
  lesson: (
    c: Content,
    id: string,
  ): { course: Course; chapter: Chapter; index: number; lesson: Lesson } | undefined => {
    for (const course of c.courses)
      for (const chapter of course.chapters) {
        const index = chapter.lessons.findIndex((l) => l.id === id)
        if (index >= 0) return { course, chapter, index, lesson: chapter.lessons[index] }
      }
    return undefined
  },
  pattern: (c: Content, key: string): { index: number; pattern: Pattern } | undefined => {
    const index = c.patterns.findIndex((p) => p.key === key)
    return index < 0 ? undefined : { index, pattern: c.patterns[index] }
  },
  company: (c: Content, key: string): { index: number; company: Company } | undefined => {
    const index = c.companies.findIndex((x) => x.key === key)
    return index < 0 ? undefined : { index, company: c.companies[index] }
  },
  round: (c: Content, id: string): { company: Company; index: number; round: QuestionGroup } | undefined => {
    for (const company of c.companies) {
      const index = company.questions.findIndex((g) => g.id === id)
      if (index >= 0) return { company, index, round: company.questions[index] }
    }
    return undefined
  },
  question: (
    c: Content,
    id: string,
  ): { company: Company; round: QuestionGroup; index: number; question: AskedQuestion } | undefined => {
    for (const company of c.companies)
      for (const round of company.questions) {
        const index = round.questions.findIndex((q) => q.id === id)
        if (index >= 0) return { company, round, index, question: round.questions[index] }
      }
    return undefined
  },
}

/** Does a record of this entity type exist? */
export function exists(c: Content, entity: Entity, id: string): boolean {
  if (entity === 'pack') return Object.prototype.hasOwnProperty.call(c.packs, id)
  return Boolean(locate[entity](c, id))
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** Human label for one record, e.g. "Two Sum" or "GoodScore — DSA". */
export function labelOf(c: Content, entity: Entity, id: string): string {
  switch (entity) {
    case 'area':
      return locate.area(c, id)?.area.label ?? id
    case 'problem':
      return locate.problem(c, id)?.drill.title ?? id
    case 'pack': {
      const title = c.packs[id]?.title ?? locate.problem(c, id)?.drill.title ?? id
      return `${title} (runnable pack)`
    }
    case 'course':
      return locate.course(c, id)?.course.label ?? id
    case 'chapter':
      return locate.chapter(c, id)?.chapter.title ?? id
    case 'lesson':
      return locate.lesson(c, id)?.lesson.title ?? id
    case 'pattern':
      return locate.pattern(c, id)?.pattern.name ?? id
    case 'company':
      return locate.company(c, id)?.company.name ?? id
    case 'round': {
      const r = locate.round(c, id)
      return r ? `${r.company.name} — ${r.round.round}` : id
    }
    case 'question': {
      const q = locate.question(c, id)
      return q ? clip(q.question.q, 90) : id
    }
  }
}

/** Every id currently used by an entity type (for uniqueness and next-id checks). */
export function idsOf(c: Content, entity: Entity): Set<string> {
  const out = new Set<string>()
  switch (entity) {
    case 'area':
      c.areas.forEach((a) => out.add(a.key))
      break
    case 'problem':
      c.areas.forEach((a) => a.drills.forEach((d) => out.add(d.id)))
      break
    case 'pack':
      Object.keys(c.packs).forEach((k) => out.add(k))
      break
    case 'course':
      c.courses.forEach((x) => out.add(x.key))
      break
    case 'chapter':
      c.courses.forEach((x) => x.chapters.forEach((ch) => out.add(ch.id)))
      break
    case 'lesson':
      c.courses.forEach((x) => x.chapters.forEach((ch) => ch.lessons.forEach((l) => out.add(l.id))))
      break
    case 'pattern':
      c.patterns.forEach((p) => out.add(p.key))
      break
    case 'company':
      c.companies.forEach((x) => out.add(x.key))
      break
    case 'round':
      c.companies.forEach((x) => x.questions.forEach((g) => out.add(g.id)))
      break
    case 'question':
      c.companies.forEach((x) => x.questions.forEach((g) => g.questions.forEach((q) => out.add(q.id))))
      break
  }
  return out
}

/** URL-safe slug, e.g. "LLD / machine coding (backend)" → "lld-machine-coding-backend". */
export function slugify(s: string, max = 48): string {
  const slug = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
  return slug || 'item'
}

/** `base` if unused, else `base-2`, `base-3`, … */
export function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}
