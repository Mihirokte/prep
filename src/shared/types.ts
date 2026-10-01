// Content domain: every record the app renders and the assistant edits.
//
// Shapes match the web portal's modules one-to-one. The only additions are the
// `id` fields on company rounds and questions: the web data never needed them
// because nothing addressed a single question, but the assistant does.

// ---- practice: drills, grouped by area ----

export interface Drill {
  id: string
  title: string
  topic: string
  difficulty: string
  prompt: string
  link: string
  notes: string
  /** Detailed markdown walkthrough, revealed on demand. */
  solution?: string
}

export interface Area {
  key: string
  label: string
  drills: Drill[]
}

// ---- runnable DSA packs (statement, signature, starter code) ----

export interface TestCase {
  input: unknown[]
  expected: unknown
  kind: string
  source?: string
}

export interface Signature {
  name: string
  type?: string // 'class' for design problems
  params: { name: string; kind?: string }[]
  returns?: { kind?: string }
}

export interface Problem {
  id: string
  slug: string
  title: string
  difficulty: string
  topic?: string
  link: string
  description_md: string
  signature: Signature
  starter_code: string
  reference_solution?: string
  solution_source?: string
  mode?: string // 'inplace'
  inplace_arg?: number
  compare?: string // exact | unordered | unordered_deep | float | custom
  checker_code?: string
  /** Legacy: the retired test-based judge. Kept for the original 5 problems. */
  tests?: TestCase[]
}

// ---- study: course → chapter → lesson ----

export interface Lesson {
  id: string
  title: string
  minutes: number
  body: string // markdown; ```mermaid fences render as sequence diagrams
  /** Optional deeper dive, rendered as a collapsed "Go deeper" section. */
  deeper?: string
}

export interface Chapter {
  id: string
  title: string
  summary: string
  lessons: Lesson[]
  /** Drill ids this chapter's material prepares you for. */
  problemIds?: string[]
}

export interface Reference {
  label: string
  url: string
}

export interface Course {
  key: string
  label: string
  blurb: string
  /** Which drill area supplies this course's practice problems. */
  problemAreaKey?: string
  /** Drills fully taught by a lesson — hidden from practice and leftovers. */
  suppressedProblemIds?: string[]
  chapters: Chapter[]
  references?: Reference[]
}

// ---- patterns ----

export interface PatternContrast {
  /** key of the other pattern */
  key: string
  /** how to tell which one the problem wants */
  how: string
}

export interface Pattern {
  key: string
  name: string
  family: string
  /** One of the 16 canonical patterns. */
  canonical: boolean
  essence: string
  cues: string[]
  mechanism: string
  template: string
  complexity: string
  pitfalls: string[]
  contrasts?: PatternContrast[]
  /** Drill ids this pattern solves. */
  problemIds: string[]
}

// ---- company research ----

export interface AskedQuestion {
  id: string
  q: string
  answer: string
  related?: string[]
  /** Pattern keys this question exercises. */
  patterns?: string[]
}

export interface RoundPattern {
  key: string
  basis: 'reported' | 'implied'
  why: string
}

export interface QuestionGroup {
  id: string
  round: string
  questions: AskedQuestion[]
}

export interface PrepTopic {
  topic: string
  why: string
}

export interface Company {
  key: string
  name: string
  descriptor: string
  rolesCovered?: string
  coverage: 'good' | 'moderate' | 'thin'
  questions: QuestionGroup[]
  dsaPatterns?: RoundPattern[]
  lldPrep: PrepTopic[]
  specialNotes: string[]
  /** ISO date this company's data last changed. */
  updated: string
}

// ---- the whole store ----

export interface Content {
  schemaVersion: 1
  areas: Area[]
  packs: Record<string, Problem>
  courses: Course[]
  patterns: Pattern[]
  companies: Company[]
}
