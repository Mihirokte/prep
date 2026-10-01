import { z } from 'zod'

// Runtime schemas for every record in the store. They mirror ./types.ts and are
// strict: an unknown key is an error, so a misspelt field in an assistant plan
// is rejected instead of silently stored.

const nonBlank = z.string().refine((s) => s.trim().length > 0, 'must not be blank')

/** Stable ids and keys: lowercase letters and digits, joined by single hyphens. */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const id = z.string().regex(ID_PATTERN, 'must be lowercase letters and digits joined by hyphens')

export const DrillSchema = z.strictObject({
  id,
  title: nonBlank,
  topic: z.string(),
  difficulty: z.string(),
  prompt: nonBlank,
  link: z.string(),
  notes: z.string(),
  solution: z.string().optional(),
})

export const AreaSchema = z.strictObject({
  key: id,
  label: nonBlank,
  drills: z.array(DrillSchema),
})

const TestCaseSchema = z.strictObject({
  input: z.array(z.unknown()),
  expected: z.unknown(),
  kind: z.string(),
  source: z.string().optional(),
})

const SignatureSchema = z.strictObject({
  name: nonBlank,
  type: z.string().optional(),
  params: z.array(z.strictObject({ name: nonBlank, kind: z.string().optional() })),
  returns: z.strictObject({ kind: z.string().optional() }).optional(),
})

export const ProblemSchema = z.strictObject({
  id,
  slug: z.string(),
  title: nonBlank,
  difficulty: z.string(),
  topic: z.string().optional(),
  link: z.string(),
  description_md: nonBlank,
  signature: SignatureSchema,
  starter_code: z.string(),
  reference_solution: z.string().optional(),
  solution_source: z.string().optional(),
  mode: z.string().optional(),
  inplace_arg: z.number().optional(),
  compare: z.string().optional(),
  checker_code: z.string().optional(),
  tests: z.array(TestCaseSchema).optional(),
})

export const LessonSchema = z.strictObject({
  id,
  title: nonBlank,
  minutes: z.number().positive(),
  body: nonBlank,
  deeper: z.string().optional(),
})

export const ChapterSchema = z.strictObject({
  id,
  title: nonBlank,
  summary: z.string(),
  lessons: z.array(LessonSchema),
  problemIds: z.array(id).optional(),
})

export const CourseSchema = z.strictObject({
  key: id,
  label: nonBlank,
  blurb: z.string(),
  problemAreaKey: id.optional(),
  suppressedProblemIds: z.array(id).optional(),
  chapters: z.array(ChapterSchema),
  references: z.array(z.strictObject({ label: nonBlank, url: nonBlank })).optional(),
})

export const PatternSchema = z.strictObject({
  key: id,
  name: nonBlank,
  family: nonBlank,
  canonical: z.boolean(),
  essence: nonBlank,
  cues: z.array(nonBlank).min(1),
  mechanism: nonBlank,
  template: nonBlank,
  complexity: nonBlank,
  pitfalls: z.array(nonBlank).min(1),
  contrasts: z.array(z.strictObject({ key: id, how: nonBlank })).optional(),
  problemIds: z.array(id),
})

export const QuestionSchema = z.strictObject({
  id,
  q: nonBlank,
  answer: nonBlank,
  related: z.array(nonBlank).optional(),
  patterns: z.array(id).optional(),
})

export const RoundSchema = z.strictObject({
  id,
  round: nonBlank,
  questions: z.array(QuestionSchema),
})

export const CompanySchema = z.strictObject({
  key: id,
  name: nonBlank,
  descriptor: z.string(),
  rolesCovered: z.string().optional(),
  coverage: z.enum(['good', 'moderate', 'thin']),
  questions: z.array(RoundSchema),
  dsaPatterns: z
    .array(z.strictObject({ key: id, basis: z.enum(['reported', 'implied']), why: nonBlank }))
    .optional(),
  lldPrep: z.array(z.strictObject({ topic: nonBlank, why: nonBlank })),
  specialNotes: z.array(nonBlank),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a YYYY-MM-DD date'),
})

export const ContentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  areas: z.array(AreaSchema),
  packs: z.record(z.string(), ProblemSchema),
  courses: z.array(CourseSchema),
  patterns: z.array(PatternSchema),
  companies: z.array(CompanySchema),
})
