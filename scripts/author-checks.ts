// Add one mid-lesson ```check question to lessons that have none.
//
//   node scripts/run-ts.mjs scripts/author-checks.ts --courses=sd,lld,arch,ops,sec [--batch=5]
//
// agy writes the question; the script keeps it only if its supporting quote
// appears word for word in the lesson, it has 3 or 4 options with exactly one
// correct, and the block passes the same lint the renderer uses. The block is
// placed at the end of the section that holds the quote. Rebuild the seed with
// build-content.ts afterwards.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { lintBlocks } from '../src/shared/blocks'
import { findAgy, runAgy } from '../src/main/agy'

const root = process.cwd()
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const courses = (arg('courses') ?? 'sd,lld,arch,ops,sec').split(',')
const batchSize = Number(arg('batch') ?? 5)
const tmp = mkdtempSync(path.join(os.tmpdir(), 'prep-checks-'))

interface Item { file: string; id: string; title: string; body: string; raw: string }
const items: Item[] = []
for (const c of courses) {
  const def = JSON.parse(readFileSync(path.join(root, 'content-src', c, 'course.json'), 'utf8')) as { chapters: { lessons: string[] }[] }
  for (const id of def.chapters.flatMap((ch) => ch.lessons)) {
    const file = path.join(root, 'content-src', c, 'lessons', `${id}.md`)
    const raw = readFileSync(file, 'utf8')
    if (/```check/.test(raw)) continue
    const body = raw.split(/\n===DEEPER===\n/)[0]
    items.push({ file, id, title: /^title: (.*)$/m.exec(raw)?.[1] ?? id, body, raw })
  }
}
console.log(`${items.length} lessons without a check`)

const schemaFile = path.join(tmp, 'schema.json')
writeFileSync(
  schemaFile,
  JSON.stringify({
    type: 'object',
    required: ['checks'],
    properties: {
      checks: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'question', 'options', 'correct', 'why', 'quote'],
          properties: {
            id: { type: 'string' },
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            correct: { type: 'integer' },
            why: { type: 'string' },
            quote: { type: 'string' },
          },
        },
      },
    },
  }),
)

const norm = (s: string) => s.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
interface Check { id: string; question: string; options: string[]; correct: number; why: string; quote: string }

function place(it: Item, c: Check): string | null {
  const one = (s: string) => s.replace(/\s+/g, ' ').trim()
  if (c.options.length < 3 || c.options.length > 4) return null
  if (c.correct < 0 || c.correct >= c.options.length) return null
  if (new Set(c.options.map(norm)).size !== c.options.length) return null
  if (c.quote.split(/\s+/).length < 6 || !norm(it.body).includes(norm(c.quote))) return null
  const block = ['```check', `Q: ${one(c.question)}`, ...c.options.map((o, i) => `${i === c.correct ? '*' : '-'} ${one(o)}`), `Why: ${one(c.why)}`, '```'].join('\n')
  if (lintBlocks(block, it.id).errors.length) return null
  // Find the line that holds the start of the quote, then the end of its section.
  const lines = it.raw.split('\n')
  const head = norm(c.quote).split(' ').slice(0, 5).join(' ')
  let inFence = false
  let at = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) inFence = !inFence
    if (!inFence && norm(lines[i]).includes(head)) { at = i; break }
  }
  if (at < 0) return null
  inFence = false
  let end = lines.length
  for (let i = at + 1; i < lines.length; i++) {
    if (!inFence && (/^#{2,3} /.test(lines[i]) || /^```recall/.test(lines[i]) || lines[i] === '===DEEPER===')) { end = i; break }
    if (/^```/.test(lines[i])) inFence = !inFence
  }
  while (end > at + 1 && lines[end - 1].trim() === '') end--
  return [...lines.slice(0, end), '', block, ...lines.slice(end)].join('\n')
}

const bin = await findAgy()
if (!bin) throw new Error('agy not found')
let added = 0
const skipped: string[] = []
for (let i = 0; i < items.length; i += batchSize) {
  const batch = items.slice(i, i + batchSize)
  const prompt = [
    'For each lesson below, write ONE multiple-choice question that tests whether a reader can USE the main idea (apply it to a small scenario), not recall a phrase.',
    'Rules: 3 or 4 options, exactly one correct (give its 0-based index in correct). Wrong options must be plausible mistakes a learner makes. why: 2-3 sentences explaining the right answer and why the most tempting wrong option fails.',
    'quote: copy one sentence from the lesson, word for word, that supports the answer. Use only facts stated in the lesson. Plain text, no markdown.',
    '',
    ...batch.map((it) => `### id: ${it.id}\nTitle: ${it.title}\n${it.body.replace(/^---[\s\S]*?---\n/, '')}\n`),
  ].join('\n')
  let checks: Check[] = []
  try {
    const out = await runAgy(bin, prompt, { schemaFile, cwd: tmp, timeoutSec: 240, effort: 'low' }, () => {})
    checks = ((out.structured as { checks?: Check[] } | null)?.checks ?? [])
  } catch (e) {
    console.log(`batch ${i / batchSize + 1}: agy failed: ${(e as Error).message.split('\n')[0]}`)
    continue
  }
  for (const it of batch) {
    const c = checks.find((x) => x.id === it.id)
    const next = c ? place(it, c) : null
    if (!next) { skipped.push(it.id); continue }
    writeFileSync(it.file, next)
    added++
  }
  console.log(`batch ${i / batchSize + 1}: added ${added} so far`)
}
console.log(`added ${added}/${items.length}`)
if (skipped.length) console.log(`skipped: ${skipped.join(' ')}`)
