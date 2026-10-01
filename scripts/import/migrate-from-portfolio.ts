// Optional re-import: web portal modules → seed/content.json (the store the
// app copies into Application Support on first launch). Requires PORTFOLIO;
// see ./portal.ts. Overwrites the seed.
//
// Everything is carried over as-is. The one addition: company rounds and
// questions get stable ids (`<company>-<round slug>`, `<round id>-<n>`), which
// the assistant needs to address a single question.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { slugify, uniqueId } from '../../src/shared/locate'
import type { AskedQuestion, Company, Content } from '../../src/shared/types'
import { validateContent } from '../../src/shared/validate'
import { asJson, loadPortal, portfolioDir, type PortalCompany } from './portal'

function withIds(companies: PortalCompany[]): Company[] {
  const roundIds = new Set<string>()
  return companies.map((co) => ({
    ...co,
    questions: co.questions.map((g) => {
      const id = uniqueId(`${co.key}-${slugify(g.round)}`, roundIds)
      roundIds.add(id)
      return {
        id,
        round: g.round,
        questions: g.questions.map((q, i) => ({ id: `${id}-${i + 1}`, ...q }) as AskedQuestion),
      }
    }),
  })) as unknown as Company[]
}

const portfolio = portfolioDir()
const portal = asJson(await loadPortal(portfolio))
const content: Content = {
  schemaVersion: 1,
  areas: portal.AREAS,
  packs: portal.PACKS,
  courses: portal.COURSES,
  patterns: portal.PATTERNS,
  companies: withIds(portal.COMPANIES),
}

const problems = validateContent(content)
if (problems.length) {
  console.error(`seed failed validation (${problems.length}):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}

const out = path.join(process.cwd(), 'seed', 'content.json')
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(content, null, 1)}\n`)

const lessons = content.courses.reduce((n, c) => n + c.chapters.reduce((m, ch) => m + ch.lessons.length, 0), 0)
const questions = content.companies.reduce((n, c) => n + c.questions.reduce((m, g) => m + g.questions.length, 0), 0)
console.log(
  [
    `seed written from ${portfolio}:`,
    `  ${content.areas.length} areas, ${content.areas.reduce((n, a) => n + a.drills.length, 0)} drills, ${Object.keys(content.packs).length} runnable packs`,
    `  ${content.courses.length} courses, ${content.courses.reduce((n, c) => n + c.chapters.length, 0)} chapters, ${lessons} lessons`,
    `  ${content.patterns.length} patterns, ${content.companies.length} companies, ${questions} questions`,
    '  integrity: 0 problems',
  ].join('\n'),
)
