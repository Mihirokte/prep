import { buildHomeAreas, type HomeArea } from '../areas'
import type { Area, Chapter, Company, Content, Course, Drill, Lesson, Pattern, Problem } from '../../shared/types'

// Every lookup the pages use, built once per store version. On the web these
// were module-level constants over bundled data; here the store can change at
// runtime (the assistant edits it), so they are derived from it instead.

export interface LeftoverGroup {
  topic: string
  drills: Drill[]
}

export interface PatternFamily {
  name: string
  patterns: Pattern[]
}

export interface Model {
  content: Content
  courses: Course[]
  areas: Area[]
  packs: Record<string, Problem>
  patterns: Pattern[]
  companies: Company[]
  patternFamilies: PatternFamily[]
  homeAreas: HomeArea[]
  findCourse(key: string): Course | undefined
  findLesson(courseKey: string, lessonId: string): { course: Course; chapter: Chapter; lesson: Lesson } | undefined
  drillById(id: string): Drill | undefined
  areaKeyOf(id: string): string | undefined
  drillsForArea(areaKey?: string): Drill[]
  isRunnable(id: string): boolean
  courseProblemLayout(course: Course): { perChapter: Record<string, Drill[]>; leftovers: LeftoverGroup[] }
  findPattern(key: string): Pattern | undefined
  patternsForProblem(problemId: string): Pattern[]
  relatedProblems(problemId: string, limit?: number): string[]
  findCompany(key: string): Company | undefined
}

/** Index order: families grouped, roughly easiest-to-hardest. */
const FAMILY_ORDER = [
  'Windows & pointers',
  'Arrays, hashing & matrix',
  'Stacks',
  'Linked lists',
  'Search & selection',
  'Trees & tries',
  'Graphs',
  'Recursion & combinatorics',
  'Dynamic programming',
  'Intervals & greedy',
  'Bits & math',
]

const DIFF_ORDER: Record<string, number> = { easy: 0, medium: 1, hard: 2 }

export function buildModel(content: Content): Model {
  const drills = new Map<string, { drill: Drill; areaKey: string }>()
  for (const a of content.areas) for (const d of a.drills) drills.set(d.id, { drill: d, areaKey: a.key })
  const courses = new Map(content.courses.map((c) => [c.key, c]))
  const patterns = new Map(content.patterns.map((p) => [p.key, p]))
  const companies = new Map(content.companies.map((c) => [c.key, c]))

  // problem id → the patterns that solve it
  const reverse = new Map<string, Pattern[]>()
  for (const pat of content.patterns)
    for (const id of pat.problemIds) {
      if (!reverse.has(id)) reverse.set(id, [])
      reverse.get(id)!.push(pat)
    }

  // Patterns grouped by family in FAMILY_ORDER; a family missing from the
  // order list is appended, so a new family can never silently vanish.
  const byFamily = new Map<string, Pattern[]>()
  for (const pat of content.patterns) {
    if (!byFamily.has(pat.family)) byFamily.set(pat.family, [])
    byFamily.get(pat.family)!.push(pat)
  }
  const patternFamilies: PatternFamily[] = []
  for (const name of FAMILY_ORDER) {
    const list = byFamily.get(name)
    if (list) {
      patternFamilies.push({ name, patterns: list })
      byFamily.delete(name)
    }
  }
  for (const [name, list] of byFamily) patternFamilies.push({ name, patterns: list })

  const drillsForArea = (areaKey?: string): Drill[] =>
    areaKey ? (content.areas.find((a) => a.key === areaKey)?.drills ?? []) : []

  const patternsForProblem = (problemId: string): Pattern[] => reverse.get(problemId) ?? []

  return {
    content,
    courses: content.courses,
    areas: content.areas,
    packs: content.packs,
    patterns: content.patterns,
    companies: content.companies,
    patternFamilies,
    homeAreas: buildHomeAreas(content.courses),

    findCourse: (key) => courses.get(key),

    findLesson(courseKey, lessonId) {
      const course = courses.get(courseKey)
      if (!course) return undefined
      for (const chapter of course.chapters) {
        const lesson = chapter.lessons.find((l) => l.id === lessonId)
        if (lesson) return { course, chapter, lesson }
      }
      return undefined
    },

    drillById: (id) => drills.get(id)?.drill,
    areaKeyOf: (id) => drills.get(id)?.areaKey,
    drillsForArea,
    isRunnable: (id) => Boolean(content.packs[id]),

    /** Textbook layout for a course: each chapter's claimed drills (in the order
     *  the chapter lists them), plus every remaining drill in the course's area
     *  grouped by topic and sorted by difficulty then title. */
    courseProblemLayout(course) {
      const all = drillsForArea(course.problemAreaKey)
      const suppressed = new Set(course.suppressedProblemIds ?? [])
      const byId = new Map(all.filter((d) => !suppressed.has(d.id)).map((d) => [d.id, d]))
      const claimed = new Set<string>()
      const perChapter: Record<string, Drill[]> = {}

      for (const ch of course.chapters) {
        const list: Drill[] = []
        for (const id of ch.problemIds ?? []) {
          const d = byId.get(id)
          if (d && !claimed.has(id)) {
            list.push(d)
            claimed.add(id)
          }
        }
        perChapter[ch.id] = list
      }

      const rest = all.filter((d) => !claimed.has(d.id) && !suppressed.has(d.id))
      const groups = new Map<string, Drill[]>()
      for (const d of rest) {
        const key = d.topic || 'other'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(d)
      }
      const leftovers: LeftoverGroup[] = [...groups.entries()]
        .map(([topic, list]) => ({
          topic,
          drills: [...list].sort(
            (a, b) =>
              (DIFF_ORDER[a.difficulty.toLowerCase()] ?? 9) - (DIFF_ORDER[b.difficulty.toLowerCase()] ?? 9) ||
              a.title.localeCompare(b.title),
          ),
        }))
        .sort((a, b) => a.topic.localeCompare(b.topic))

      return { perChapter, leftovers }
    },

    findPattern: (key) => patterns.get(key),
    patternsForProblem,

    /** Sibling problems that share a pattern with this one, nearest first
     *  (problems sharing the most patterns rank highest), excluding itself. */
    relatedProblems(problemId, limit = 8) {
      const score = new Map<string, number>()
      for (const pat of patternsForProblem(problemId))
        for (const id of pat.problemIds) {
          if (id === problemId) continue
          score.set(id, (score.get(id) ?? 0) + 1)
        }
      return [...score.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([id]) => id)
    },

    findCompany: (key) => companies.get(key),
  }
}
