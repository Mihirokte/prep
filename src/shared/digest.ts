import { type Entity, locate } from './locate'
import type { Content } from './types'

// What the assistant sees. The model gets no tools, so everything it needs
// must be in the prompt: a compact index of every record (ids and names), plus
// the full JSON of the records the command appears to be about.

export interface RecordRef {
  entity: Entity
  id: string
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** One line per record. ~30 KB for the whole store. */
export function buildIndex(c: Content): string {
  const out: string[] = []
  out.push('AREAS (key | label | problem count)')
  for (const a of c.areas) out.push(`${a.key} | ${a.label} | ${a.drills.length}`)

  out.push('', 'PROBLEMS (id | title | area | difficulty | topic | "pack" when it has a runnable pack)')
  for (const a of c.areas)
    for (const d of a.drills)
      out.push(`${d.id} | ${d.title} | ${a.key} | ${d.difficulty} | ${d.topic}${c.packs[d.id] ? ' | pack' : ''}`)

  out.push('', 'COURSES (key | label | practice area)')
  for (const co of c.courses) out.push(`${co.key} | ${co.label} | ${co.problemAreaKey ?? '-'}`)

  out.push('', 'CHAPTERS (id | course | title | practice problem count: ids)')
  for (const co of c.courses)
    for (const ch of co.chapters)
      out.push(`${ch.id} | ${co.key} | ${ch.title} | ${(ch.problemIds ?? []).length}: ${(ch.problemIds ?? []).join(',') || '-'}`)

  out.push('', 'LESSONS (id | chapter | title | minutes)')
  for (const co of c.courses)
    for (const ch of co.chapters) for (const l of ch.lessons) out.push(`${l.id} | ${ch.id} | ${l.title} | ${l.minutes}`)

  out.push('', 'PATTERNS (key | name | family | core16 | problem count: ids)')
  for (const p of c.patterns)
    out.push(
      `${p.key} | ${p.name} | ${p.family} | ${p.canonical ? 'yes' : 'no'} | ${p.problemIds.length}: ${p.problemIds.join(',') || '-'}`,
    )

  out.push('', 'COMPANIES (key | name | coverage | round pattern keys)')
  for (const co of c.companies)
    out.push(`${co.key} | ${co.name} | ${co.coverage} | ${(co.dsaPatterns ?? []).map((rp) => `${rp.key}(${rp.basis})`).join(',') || '-'}`)

  out.push('', 'ROUNDS (id | company | round name | question count)')
  for (const co of c.companies) for (const g of co.questions) out.push(`${g.id} | ${co.key} | ${g.round} | ${g.questions.length}`)

  out.push('', 'QUESTIONS (id | round | pattern keys | question, truncated)')
  for (const co of c.companies)
    for (const g of co.questions)
      for (const q of g.questions) out.push(`${q.id} | ${g.id} | ${(q.patterns ?? []).join(',') || '-'} | ${clip(q.q, 110)}`)

  return out.join('\n')
}

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `

/** Records a piece of text names, by id/key or by title. Most specific first. */
export function findMentions(c: Content, text: string): RecordRef[] {
  const hay = words(text)
  const ids = new Set(text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) ?? [])
  const names = (s: string) => {
    const n = words(s)
    return n.trim().length >= 3 && hay.includes(n)
  }
  const refs: RecordRef[] = []
  const seen = new Set<string>()
  const add = (entity: Entity, id: string) => {
    const k = `${entity}:${id}`
    if (seen.has(k)) return
    seen.add(k)
    refs.push({ entity, id })
  }

  for (const co of c.companies) {
    if (ids.has(co.key) || names(co.name) || names(co.key)) add('company', co.key)
    for (const g of co.questions) {
      if (ids.has(g.id)) add('round', g.id)
      for (const q of g.questions) if (ids.has(q.id)) add('question', q.id)
    }
  }
  for (const p of c.patterns) if (ids.has(p.key) || names(p.name) || names(p.key)) add('pattern', p.key)
  for (const a of c.areas) for (const d of a.drills) if (ids.has(d.id) || names(d.title)) add('problem', d.id)
  for (const co of c.courses) {
    if (ids.has(co.key) || names(co.label)) add('course', co.key)
    for (const ch of co.chapters) {
      if (ids.has(ch.id) || names(ch.title)) add('chapter', ch.id)
      for (const l of ch.lessons) if (ids.has(l.id) || names(l.title)) add('lesson', l.id)
    }
  }
  for (const a of c.areas) if (ids.has(a.key)) add('area', a.key)
  return refs
}

const lessonStub = (l: { id: string; title: string; minutes: number }) => ({ id: l.id, title: l.title, minutes: l.minutes })

/** Full record for the prompt. Courses and chapters list lessons without their
 *  bodies; ask for a lesson by id to see its text. */
export function recordFor(c: Content, ref: RecordRef): unknown {
  switch (ref.entity) {
    case 'area': {
      const a = locate.area(c, ref.id)?.area
      return a && { key: a.key, label: a.label, problemIds: a.drills.map((d) => d.id) }
    }
    case 'problem': {
      const loc = locate.problem(c, ref.id)
      return loc && { area: loc.area.key, ...loc.drill, pack: c.packs[ref.id] ?? null }
    }
    case 'pack':
      return c.packs[ref.id]
    case 'course': {
      const co = locate.course(c, ref.id)?.course
      return (
        co && {
          ...co,
          chapters: co.chapters.map((ch) => ({ ...ch, lessons: ch.lessons.map(lessonStub) })),
        }
      )
    }
    case 'chapter': {
      const loc = locate.chapter(c, ref.id)
      return loc && { course: loc.course.key, ...loc.chapter, lessons: loc.chapter.lessons.map(lessonStub) }
    }
    case 'lesson': {
      const loc = locate.lesson(c, ref.id)
      return loc && { course: loc.course.key, chapter: loc.chapter.id, ...loc.lesson }
    }
    case 'pattern':
      return locate.pattern(c, ref.id)?.pattern
    case 'company':
      return locate.company(c, ref.id)?.company
    case 'round': {
      const loc = locate.round(c, ref.id)
      return loc && { company: loc.company.key, ...loc.round }
    }
    case 'question': {
      const loc = locate.question(c, ref.id)
      return loc && { company: loc.company.key, round: loc.round.id, ...loc.question }
    }
  }
}

/** Render records up to a character budget; whatever does not fit is reported
 *  so the model can ask for it by id. */
export function renderRecords(c: Content, refs: RecordRef[], budget = 60_000): { text: string; omitted: RecordRef[] } {
  const parts: string[] = []
  const omitted: RecordRef[] = []
  let used = 0
  for (const ref of refs) {
    const rec = recordFor(c, ref)
    if (!rec) continue
    const json = JSON.stringify(rec)
    if (used + json.length > budget) {
      omitted.push(ref)
      continue
    }
    used += json.length
    parts.push(`### ${ref.entity} ${ref.id}\n${json}`)
  }
  return { text: parts.join('\n\n'), omitted }
}
