// Seed integrity, self-contained: seed/content.json must satisfy every record
// schema, have unique ids, and have every cross-reference resolve. This is the
// data the app copies into Application Support on first launch, so a bad seed
// would ship to every fresh install. Run with `npm run verify:seed`.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Content } from '../src/shared/types'
import { validateContent } from '../src/shared/validate'

const file = path.join(process.cwd(), 'seed', 'content.json')
const seed = JSON.parse(readFileSync(file, 'utf8')) as Content

const drills = seed.areas.reduce((n, a) => n + a.drills.length, 0)
const lessons = seed.courses.reduce((n, c) => n + c.chapters.reduce((m, ch) => m + ch.lessons.length, 0), 0)
const questions = seed.companies.reduce((n, c) => n + c.questions.reduce((m, g) => m + g.questions.length, 0), 0)
const ids = seed.companies.flatMap((c) => c.questions.flatMap((g) => [g.id, ...g.questions.map((q) => q.id)]))
const uniqueIds = new Set(ids).size === ids.length
const problems = validateContent(seed)

console.log(`seed: ${path.relative(process.cwd(), file)} (schema v${seed.schemaVersion})`)
console.log(`  ${seed.areas.length} areas, ${drills} drills, ${Object.keys(seed.packs).length} runnable packs`)
console.log(`  ${seed.courses.length} courses, ${seed.courses.reduce((n, c) => n + c.chapters.length, 0)} chapters, ${lessons} lessons`)
console.log(`  ${seed.patterns.length} patterns, ${seed.companies.length} companies, ${questions} questions`)
console.log(`  ${uniqueIds ? 'PASS' : 'FAIL'}  round and question ids are unique (${ids.length})`)
console.log(`  ${problems.length ? 'FAIL' : 'PASS'}  integrity (${problems.length} problems)`)
if (problems.length) console.log(`    - ${problems.join('\n    - ')}`)

process.exit(problems.length || !uniqueIds ? 1 : 0)
