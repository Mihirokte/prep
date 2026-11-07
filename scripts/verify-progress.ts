// Progress import and seed migration checks. Run with `npm run verify:progress`.
// 1. Progress files: valid files parse, bad files fail with a clear error,
//    invalid records are skipped and reported, and merge never drops learner state.
// 2. Seed migration: a store at every committed older seed revision, with
//    learner edits, deletions and created records, migrates to the current seed
//    without losing that work, and the result is valid.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Content } from '../src/shared/types'
import { validateContent } from '../src/shared/validate'
import { entityHashes, mergeSeed } from '../src/shared/seedMerge'
import { mergeProgress, parseProgress } from '../src/renderer/progressFile'
import type { ProgressState } from '../src/renderer/store/progressSlice'

const results: [string, boolean][] = []
const check = (name: string, ok: boolean) => results.push([name, ok])

// ---- 1. progress files ----
const good: ProgressState = {
  lessons: { 'l-1': { status: 'read', updatedAt: '2026-11-01T00:00:00Z', notes: 'mine' } },
  problems: { 'p-1': { status: 'solved', updatedAt: '2026-11-01T00:00:00Z', code: 'x = 1', seconds: 60, solvedAt: '2026-11-01T00:00:00Z' } },
  recall: { 'c-1': { box: 2, due: '2026-11-05T00:00:00Z', seen: 3 } },
}
const g = parseProgress(JSON.stringify(good))
check('an Export file parses with every record', g.ok && g.report.lessons === 1 && g.report.problems === 1 && g.report.cards === 1 && g.report.skipped.length === 0)

const persisted = { 'persist:prep-v2': JSON.stringify({ lessons: JSON.stringify(good.lessons), problems: JSON.stringify(good.problems), recall: JSON.stringify(good.recall), _persist: '{}' }) }
const pp = parseProgress(JSON.stringify(persisted))
check('the app progress.json format parses', pp.ok && pp.report.problems === 1 && pp.report.cards === 1)

const legacy = parseProgress(JSON.stringify({ lessons: good.lessons, problems: good.problems }))
check('an old file without recall parses', legacy.ok && legacy.report.cards === 0)

const notJson = parseProgress('{ not json')
check('invalid JSON fails with a clear error', !notJson.ok && notJson.error.includes('not valid JSON'))
const wrongShape = parseProgress(JSON.stringify({ hello: 1 }))
check('a non-progress file fails with a clear error', !wrongShape.ok && wrongShape.error.includes('not a Prep progress file'))
const damaged = parseProgress(JSON.stringify({ 'persist:prep-v2': '{broken' }))
check('a damaged app data file fails with a clear error', !damaged.ok && damaged.error.includes('damaged'))

const mixed = parseProgress(
  JSON.stringify({
    lessons: { ok: { status: 'read', updatedAt: '' }, bad: { status: 'done' } },
    problems: { ok: { status: 'attempted', updatedAt: '' }, bad: { status: 'solved', seconds: -4 } },
    recall: { ok: { box: 1, due: '2026-11-01T00:00:00Z', seen: 1 }, bad: { box: 9, due: 'x', seen: 1 } },
  }),
)
check('invalid records are skipped and reported', mixed.ok && mixed.report.lessons === 1 && mixed.report.problems === 1 && mixed.report.cards === 1 && mixed.report.skipped.length === 3)

const current: ProgressState = {
  lessons: { 'l-1': { status: 'read', updatedAt: '2026-11-03T00:00:00Z' }, 'l-2': { status: 'read', updatedAt: '2026-11-02T00:00:00Z' } },
  problems: { 'p-1': { status: 'revisit', updatedAt: '2026-10-01T00:00:00Z', seconds: 300, solvedAt: '2026-09-01T00:00:00Z' } },
  recall: { 'c-1': { box: 4, due: '2026-12-01T00:00:00Z', seen: 6 } },
}
const merged = mergeProgress(current, good)
check('merge keeps records only in current progress', merged.lessons['l-2']?.status === 'read')
check('merge keeps the newer lesson record', merged.lessons['l-1'].updatedAt === '2026-11-03T00:00:00Z')
check('merge takes a newer problem record', merged.problems['p-1'].status === 'solved' && merged.problems['p-1'].code === 'x = 1')
check('merge keeps the larger time and the first solve date', merged.problems['p-1'].seconds === 300 && merged.problems['p-1'].solvedAt === '2026-09-01T00:00:00Z')
check('merge keeps the more-reviewed card', merged.recall['c-1'].seen === 6)
check('merge into empty progress equals the file', JSON.stringify(mergeProgress({ lessons: {}, problems: {}, recall: {} }, good)) === JSON.stringify(good))

// ---- 2. seed migration from every committed older revision ----
const root = process.cwd()
const seed = JSON.parse(readFileSync(path.join(root, 'seed', 'content.json'), 'utf8')) as Content
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const commits = git('log', '--format=%h', '--', 'seed/content.json').trim().split('\n').filter(Boolean)
const lessonsOf = (c: Content) => c.courses.flatMap((co) => co.chapters.flatMap((ch) => ch.lessons))

for (const sha of commits) {
  const old = JSON.parse(git('show', `${sha}:seed/content.json`)) as Content
  const base = entityHashes(old)
  const store = structuredClone(old)
  // Learner work on the old revision: an edited lesson, a deleted drill, a created company.
  const edited = lessonsOf(store).find((l) => lessonsOf(seed).some((s) => s.id === l.id))
  if (edited) edited.body += '\nlearner note'
  const dropped = store.areas.find((a) => a.drills.length)?.drills.shift()
  if (dropped) {
    delete store.packs[dropped.id]
    for (const pat of store.patterns) pat.problemIds = pat.problemIds.filter((id) => id !== dropped.id)
    for (const co of store.courses) for (const ch of co.chapters) ch.problemIds = (ch.problemIds ?? []).filter((id) => id !== dropped.id)
  }
  if (store.companies[0]) {
    const mine = structuredClone(store.companies[0])
    mine.key = 'learner-co'
    mine.name = 'Learner Co'
    for (const grp of mine.questions) {
      grp.id = `learner-${grp.id}`
      for (const q of grp.questions) q.id = `learner-${q.id}`
    }
    store.companies.push(mine)
  }
  const out = mergeSeed(store, seed, base)
  const issues = validateContent(out)
  const outLessons = lessonsOf(out)
  const tag = `migrate from ${sha}`
  check(`${tag}: edited lesson keeps the learner version`, !edited || outLessons.find((l) => l.id === edited.id)?.body.endsWith('learner note') === true)
  check(`${tag}: deleted drill stays deleted`, !dropped || !out.areas.some((a) => a.drills.some((d) => d.id === dropped.id)))
  check(`${tag}: created company is kept`, out.companies.some((c) => c.key === 'learner-co'))
  check(`${tag}: every current lesson is present`, lessonsOf(seed).every((l) => outLessons.some((o) => o.id === l.id)))
  check(`${tag}: merged store is valid`, issues.length === 0)
  if (issues.length) console.log(`    - ${issues.slice(0, 5).join('\n    - ')}`)
}

for (const [name, ok] of results) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
const failed = results.filter(([, ok]) => !ok).length
console.log(`${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
