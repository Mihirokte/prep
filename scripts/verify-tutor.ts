// Tutor checks. Run with `npm run verify:tutor`.
// 1. The pure rules: lesson questions, grounding, review validation.
// 2. Both LangGraph graphs with a scripted model: retries, limits, the cache.
// 3. With PREP_VERIFY_AGENT=1: the real Tutor through agy, on a temp folder.
import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Content } from '../src/shared/types'
import { checkReview, groundQuestions, lessonQuestions, lessonSource, stripQuestions } from '../src/shared/tutor'
import { buildQuestionsGraph, buildVerifyGraph, Tutor } from '../src/main/tutor'

const results: [string, boolean, string?][] = []
const check = (name: string, ok: boolean, detail = '') => results.push([name, ok, detail])

const seed = JSON.parse(readFileSync(path.join(process.cwd(), 'seed', 'content.json'), 'utf8')) as Content
const lessons = seed.courses.flatMap((c) => c.chapters.flatMap((ch) => ch.lessons))
const withCheck = lessons.find((l) => /```check\n/.test(l.body))!
const withRecall = lessons.find((l) => /```recall\n/.test(l.body))!

// ---- 1. rules ----
const own = lessonQuestions(withCheck)
check('a lesson\'s check block becomes a multiple-choice question', own.some((q) => q.kind === 'mcq'), withCheck.id)
check('a lesson\'s recall block becomes recall questions', lessonQuestions(withRecall).some((q) => q.kind === 'recall'), withRecall.id)
check('Read text has no question blocks', !/```(recall|check)/.test(stripQuestions(withCheck.body)))

const source = lessonSource(withRecall)
const sentence = stripQuestions(withRecall.body).split('\n').find((l) => l.length > 60 && !l.startsWith('#') && !l.startsWith('```') && !l.includes('|'))!.slice(0, 120)
const good = (q: string, quote = sentence) => ({ q, options: ['alpha one', 'beta two', 'gamma three', 'delta four'], answer: 2, why: 'Because the lesson says so in plain words.', quote })
const g = groundQuestions(
  { questions: [good('What does the lesson claim first?'), good('Invented quote question here?', 'this sentence is not in the lesson at all, nowhere'), { ...good('Three options only question?'), options: ['a', 'b', 'c'] }, good('What does the lesson claim first?')] },
  source,
)
check('grounding keeps a question whose quote is in the lesson', g.kept.length === 1, `${g.kept.length} kept`)
check('grounding rejects an invented quote, a 3-option question and a duplicate', g.rejected.length === 3, g.rejected.join(' | '))

const code = 'def f(nums):\n    seen = set()\n    for x in nums:\n        if x in seen: return True\n        seen.add(x)\n    return False'
const keys = seed.patterns.map((p) => p.key)
const review = (o: Record<string, unknown> = {}) => ({
  verdict: 'partial',
  summary: 'The idea is right, but one case is missed.',
  pattern: { key: keys[0], fits: true, note: '' },
  issues: [{ snippet: 'if x in seen: return True', problem: 'Fine here, example only.', fix: 'Keep it.' }],
  edgeCases: ['empty list'],
  complexity: { time: 'O(n)', space: 'O(n)' },
  next: 'Test the empty list.',
  ...o,
})
check('a review that quotes the code passes', checkReview(review(), code, keys).review !== null, checkReview(review(), code, keys).errors.join('; '))
check('a review that quotes code the learner did not write fails', checkReview(review({ issues: [{ snippet: 'while lo < hi', problem: 'x', fix: 'y' }] }), code, keys).review === null)
check('a review with an unknown pattern key fails', checkReview(review({ pattern: { key: 'made-up', fits: true, note: '' } }), code, keys).review === null)
check('a partial verdict with no issue fails', checkReview(review({ issues: [] }), code, keys).review === null)
check('a correct verdict with no issue passes', checkReview(review({ verdict: 'correct', issues: [] }), code, keys).review !== null)

// ---- 2. graphs with a scripted model ----
async function graphs() {
  const replies = [
    { questions: [good('First grounded question here?'), good('Second grounded question here?'), good('Bad one with fake quote?', 'nothing like this appears in the lesson text ever')] },
    { questions: [good('Third grounded question here?'), good('Fourth grounded question here?'), good('Fifth grounded question here?'), good('First grounded question here?')] },
  ]
  let calls = 0
  const qg = buildQuestionsGraph(async () => replies[calls++], 'unused')
  const q = await qg.invoke({ lesson: withRecall }, { recursionLimit: 20 })
  check('questions graph retries with the reasons and stops at 5 grounded', q.kept.length === 5 && q.attempts === 2 && calls === 2, `${q.kept.length} kept, ${q.attempts} attempts`)

  calls = 0
  const never = buildQuestionsGraph(async () => (calls++, { questions: [] }), 'unused')
  const n = await never.invoke({ lesson: withRecall }, { recursionLimit: 20 })
  check('questions graph gives up after 3 tries', n.attempts === 3 && calls === 3 && n.kept.length === 0)

  const pack = seed.packs[Object.keys(seed.packs)[0]]
  const cache: Record<string, ReturnType<typeof review> & Record<string, unknown>> = {}
  const vReplies = [review({ issues: [{ snippet: 'not in code', problem: 'x', fix: 'y' }] }), review({ verdict: 'correct', issues: [] })]
  calls = 0
  const vg = buildVerifyGraph(async () => vReplies[calls++], 'unused', { content: () => seed, cache: cache as never })
  const v = await vg.invoke({ problemId: pack.id, code }, { recursionLimit: 20 })
  check('verify graph rejects an invented snippet and retries', v.review?.verdict === 'correct' && v.attempts === 2, `${v.review?.verdict}, ${v.attempts} attempts`)
}

// ---- 3. real agy ----
async function real() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prep-tutor-'))
  const lines: string[] = []
  const t = new Tutor(dir, {}, () => seed, (s) => s && lines.push(s))
  await t.init()
  const lesson = withRecall
  let s = Date.now()
  const gen = await t.generateQuestions(lesson.id)
  const genSec = Math.round((Date.now() - s) / 1000)
  const src = lessonSource(lesson)
  const grounded = gen.ok && gen.set.questions.every((x) => x.kind === 'mcq' && groundQuestions({ questions: [x] }, src).kept.length === 1)
  check('real agy: generates at least 5 questions, every quote in the lesson', gen.ok && gen.set.questions.length >= 5 && grounded, gen.ok ? `${gen.set.questions.length} in ${genSec}s, ${gen.attempts} tries, ${gen.dropped} dropped` : gen.error)

  const id = Object.keys(seed.packs).find((k) => seed.packs[k].reference_solution)!
  const ref = seed.packs[id].reference_solution!
  s = Date.now()
  const right = await t.verify(id, ref)
  check('real agy: the reference solution is judged correct', right.ok && right.review.verdict === 'correct', right.ok ? `${right.review.verdict} in ${Math.round((Date.now() - s) / 1000)}s: ${right.review.summary.slice(0, 80)}` : right.error)
  s = Date.now()
  const again = await t.verify(id, ref)
  check('real agy: the same code returns the saved review at once', again.ok && again.cached && Date.now() - s < 2000)
  if (seed.packs['dsa-001']?.title === 'Contains Duplicate') {
    const pseudo = 'make an empty set called seen\nfor each number x in nums:\n    if x is in seen, return true\n    add x to seen\nreturn false'
    const p = await t.verify('dsa-001', pseudo)
    check('real agy: correct pseudocode is judged correct', p.ok && p.review.verdict === 'correct', p.ok ? `${p.review.verdict}, ${p.review.complexity.time}` : p.error)
  }
  const wrong = await t.verify(id, 'function solve(input):\n    return 0')
  check('real agy: a stub solution is judged incorrect with an issue', wrong.ok && wrong.review.verdict === 'incorrect' && wrong.review.issues.length > 0, wrong.ok ? `${wrong.review.verdict}: ${wrong.review.issues[0]?.problem.slice(0, 80)}` : wrong.error)
}

await graphs()
if (process.env.PREP_VERIFY_AGENT === '1') await real()
else console.log('NOTE  PREP_VERIFY_AGENT not set: skipping the real agy runs')
for (const [name, ok, detail] of results) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
const failed = results.filter(([, ok]) => !ok).length
console.log(`${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
