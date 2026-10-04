// Seed integrity, self-contained: seed/content.json must satisfy every record
// schema, have unique ids, and have every cross-reference resolve. This is the
// data the app copies into Application Support on first launch, so a bad seed
// would ship to every fresh install. Run with `npm run verify:seed`.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Content } from '../src/shared/types'
import { validateContent } from '../src/shared/validate'
import { entityHashes, mergeSeed } from '../src/shared/seedMerge'

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

// Carrying a newer seed into an existing store must keep the user's work.
const base = entityHashes(seed)
const lessonsOf = (c: Content) => c.courses.flatMap((co) => co.chapters.flatMap((ch) => ch.lessons))
const [lessonA, lessonB, lessonC] = lessonsOf(seed)
const userStore = structuredClone(seed)
lessonsOf(userStore)[0].body += '\nmy own edit'
// Delete the way the assistant does: the record goes and every reference to it with it.
const dropped = userStore.areas[0].drills.shift()!
delete userStore.packs[dropped.id]
for (const pat of userStore.patterns) pat.problemIds = pat.problemIds.filter((id) => id !== dropped.id)
for (const co of userStore.courses) for (const ch of co.chapters) ch.problemIds = (ch.problemIds ?? []).filter((id) => id !== dropped.id)
const mine = structuredClone(seed.companies[0])
mine.key = 'mine'
mine.name = 'Mine'
for (const g of mine.questions) {
  g.id = `mine-${g.id}`
  for (const q of g.questions) q.id = `mine-${q.id}`
}
userStore.companies.push(mine)
const newSeed = structuredClone(seed)
lessonsOf(newSeed)[0].body += '\nupstream edit'
lessonsOf(newSeed)[2].body += '\nupstream improvement'
newSeed.patterns.push({ ...structuredClone(seed.patterns[0]), key: 'brand-new', name: 'Brand New', problemIds: [] })
const merged = mergeSeed(userStore, newSeed, base)
const mergeChecks: [string, boolean][] = [
  ['an edited lesson keeps the user version', lessonsOf(merged)[0].body.endsWith('my own edit') && lessonA.id === lessonsOf(merged)[0].id],
  ['an untouched lesson takes the new seed', lessonsOf(merged)[2].body.endsWith('upstream improvement') && lessonC.id === lessonsOf(merged)[2].id],
  ['an untouched neighbour is unchanged', lessonsOf(merged)[1].body === lessonB.body],
  ['a deleted record stays deleted', !merged.areas[0].drills.some((d) => d.id === dropped.id)],
  ['a user-created company is kept', merged.companies.some((c) => c.key === 'mine')],
  ['a record new in the seed is added', merged.patterns.some((p) => p.key === 'brand-new')],
  ['the merged store is valid', validateContent(merged).length === 0],
]
for (const [name, ok] of mergeChecks) console.log(`  ${ok ? 'PASS' : 'FAIL'}  seed update: ${name}`)
if (!mergeChecks[6][1]) console.log(`    - ${validateContent(merged).slice(0, 5).join('\n    - ')}`)
const mergeOk = mergeChecks.every(([, ok]) => ok)

process.exit(problems.length || !uniqueIds || !mergeOk ? 1 : 0)
