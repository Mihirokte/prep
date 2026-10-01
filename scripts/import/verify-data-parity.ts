// Optional: data parity between a web portal checkout and seed/content.json.
// Every record the web portal renders must be in the seed, unchanged. Compares
// collection by collection after a JSON round-trip, with the one intentional
// difference (round/question ids) stripped. Requires PORTFOLIO; see ./portal.ts.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { Content } from '../../src/shared/types'
import { validateContent } from '../../src/shared/validate'
import { asJson, loadPortal, portfolioDir } from './portal'

const portfolio = portfolioDir()
const portal = asJson(await loadPortal(portfolio))
const seed = JSON.parse(readFileSync(path.join(process.cwd(), 'seed', 'content.json'), 'utf8')) as Content

const withoutId = (q: object) => Object.fromEntries(Object.entries(q).filter(([k]) => k !== 'id'))
const stripIds = (c: Content['companies']) =>
  c.map((co) => ({
    ...co,
    questions: co.questions.map((g) => ({ round: g.round, questions: g.questions.map(withoutId) })),
  }))

const checks: [string, unknown, unknown, number][] = [
  ['areas + drills', portal.AREAS, seed.areas, seed.areas.reduce((n, a) => n + a.drills.length, 0)],
  ['runnable packs', portal.PACKS, seed.packs, Object.keys(seed.packs).length],
  ['courses + lessons', portal.COURSES, seed.courses, seed.courses.length],
  ['patterns', portal.PATTERNS, seed.patterns, seed.patterns.length],
  ['companies', portal.COMPANIES, stripIds(seed.companies), seed.companies.length],
]

let failed = 0
console.log(`data parity: ${portfolio} → seed/content.json`)
for (const [name, want, got, n] of checks) {
  const ok = isDeepStrictEqual(want, got)
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} (${n})`)
}

const ids = seed.companies.flatMap((c) => c.questions.flatMap((g) => [g.id, ...g.questions.map((q) => q.id)]))
console.log(`  PASS  added ids are unique (${ids.length}): ${new Set(ids).size === ids.length}`)
const problems = validateContent(seed)
console.log(`  ${problems.length ? 'FAIL' : 'PASS'}  integrity check (${problems.length} problems)`)
if (problems.length) console.log(`    - ${problems.join('\n    - ')}`)

process.exit(failed || problems.length || new Set(ids).size !== ids.length ? 1 : 0)
