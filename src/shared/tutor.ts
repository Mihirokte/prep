// Tutor: lesson questions and code review. Pure types and checks only, so the
// graph in src/main/tutor.ts and scripts/verify-tutor.ts share one set of rules.
// The model proposes; these functions decide what is kept. Nothing reaches the
// learner unless it passes them.

import type { Lesson } from './types'

/** One multiple-choice question. `quote` is copied from the lesson and
 *  supports the right answer, so every question is grounded in the text. */
export interface McqQuestion {
  kind: 'mcq'
  q: string
  options: string[]
  answer: number
  why: string
  quote?: string
}

/** A recall card from the lesson's own ```recall block. */
export interface RecallQuestion {
  kind: 'recall'
  q: string
  a: string
}

export type Question = McqQuestion | RecallQuestion

export interface QuestionSet {
  lessonId: string
  source: 'lesson' | 'generated'
  /** ISO time the set was generated (generated sets only). */
  at?: string
  questions: Question[]
}

export interface ReviewIssue {
  /** Copied exactly from the learner's code. */
  snippet: string
  problem: string
  fix: string
}

export interface CodeReview {
  verdict: 'correct' | 'partial' | 'incorrect'
  summary: string
  pattern: { key: string | null; fits: boolean; note: string }
  issues: ReviewIssue[]
  edgeCases: string[]
  complexity: { time: string; space: string }
  next: string
}

// ---- the lesson's own questions ----

function fences(md: string): { lang: string; text: string }[] {
  return [...md.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1], text: m[2] }))
}

function recallPairs(src: string): RecallQuestion[] {
  const out: RecallQuestion[] = []
  let cur: { q: string; a: string; mode: 'q' | 'a' } | null = null
  for (const raw of src.split('\n')) {
    const q = /^Q\s*:\s*(.*)$/.exec(raw)
    const a = /^A\s*:\s*(.*)$/.exec(raw)
    if (q) {
      if (cur) out.push({ kind: 'recall', q: cur.q.trim(), a: cur.a.trim() })
      cur = { q: q[1], a: '', mode: 'q' }
    } else if (a && cur) {
      cur.a = a[1]
      cur.mode = 'a'
    } else if (cur && raw.trim()) {
      if (cur.mode === 'q') cur.q += ` ${raw.trim()}`
      else cur.a += ` ${raw.trim()}`
    }
  }
  if (cur) out.push({ kind: 'recall', q: cur.q.trim(), a: cur.a.trim() })
  return out.filter((p) => p.q && p.a)
}

function checkBlock(src: string): McqQuestion | null {
  let q = ''
  let why = ''
  let mode: 'q' | 'why' | 'opt' | null = null
  const opts: { text: string; right: boolean }[] = []
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const mq = /^Q\s*:\s*(.*)$/.exec(line)
    const mw = /^Why\s*:\s*(.*)$/i.exec(line)
    const mo = /^([-*])\s+(.+)$/.exec(line)
    if (mq) {
      q = mq[1]
      mode = 'q'
    } else if (mw) {
      why = mw[1]
      mode = 'why'
    } else if (mo && mode !== 'why') {
      opts.push({ text: mo[2].trim(), right: mo[1] === '*' })
      mode = 'opt'
    } else if (mode === 'q') q += ` ${line}`
    else if (mode === 'why') why += ` ${line}`
    else if (mode === 'opt') opts[opts.length - 1].text += ` ${line}`
  }
  const answer = opts.findIndex((o) => o.right)
  if (!q || !why || opts.length < 2 || opts.filter((o) => o.right).length !== 1) return null
  return { kind: 'mcq', q: q.trim(), options: opts.map((o) => o.text), answer, why: why.trim() }
}

/** The questions the lesson already carries: its check and recall blocks. */
export function lessonQuestions(lesson: Lesson): Question[] {
  const out: Question[] = []
  for (const md of [lesson.body, lesson.deeper ?? ''])
    for (const f of fences(md)) {
      if (f.lang === 'check') {
        const c = checkBlock(f.text)
        if (c) out.push(c)
      } else if (f.lang === 'recall') out.push(...recallPairs(f.text))
    }
  return out
}

/** Lesson markdown without its question blocks: the Read view and the
 *  grounding text both use this. */
export function stripQuestions(md: string): string {
  return md.replace(/```(recall|check)\n[\s\S]*?```\n?/g, '').replace(/\n{3,}/g, '\n\n')
}

/** The text a generated question may quote from. */
export function lessonSource(lesson: Lesson): string {
  return [lesson.title, stripQuestions(lesson.body), stripQuestions(lesson.deeper ?? '')].join('\n\n')
}

/** Lowercase, drop markdown punctuation, collapse whitespace. Quotes are
 *  compared in this form, so bold or a line break never breaks a match. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`*_#>|~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---- generated questions: grounding ----

export const QUESTION_TARGET = 8
export const QUESTION_MIN = 5

export interface GroundResult {
  kept: McqQuestion[]
  rejected: string[]
}

/** Keep only well-formed questions whose quote is in the lesson text.
 *  `already` are questions kept from an earlier round; duplicates of them drop. */
export function groundQuestions(raw: unknown, source: string, already: McqQuestion[] = []): GroundResult {
  const kept: McqQuestion[] = []
  const rejected: string[] = []
  const src = normalize(source)
  const seen = new Set(already.map((q) => normalize(q.q)))
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { questions?: unknown }).questions) ? (raw as { questions: unknown[] }).questions : []
  if (!list.length) rejected.push('no questions array in the output')
  list.forEach((item, i) => {
    const at = `question ${i + 1}`
    const x = (item ?? {}) as Record<string, unknown>
    const q = typeof x.q === 'string' ? x.q.trim() : ''
    const options = Array.isArray(x.options) ? x.options.filter((o): o is string => typeof o === 'string').map((o) => o.trim()) : []
    const answer = x.answer
    const why = typeof x.why === 'string' ? x.why.trim() : ''
    const quote = typeof x.quote === 'string' ? x.quote.trim() : ''
    if (q.length < 10 || q.length > 400) return rejected.push(`${at}: question text missing or too long`)
    if (options.length !== 4 || options.some((o) => !o)) return rejected.push(`${at}: needs exactly 4 options`)
    if (new Set(options.map(normalize)).size !== 4) return rejected.push(`${at}: two options are the same`)
    if (!Number.isInteger(answer) || (answer as number) < 0 || (answer as number) > 3) return rejected.push(`${at}: answer must be 0 to 3`)
    if (why.length < 20) return rejected.push(`${at}: the explanation is too short`)
    const nq = normalize(quote)
    if (nq.length < 20 || nq.length > 400) return rejected.push(`${at}: quote must be 20 to 400 characters`)
    if (!src.includes(nq)) return rejected.push(`${at}: the quote is not in the lesson ("${quote.slice(0, 60)}")`)
    const key = normalize(q)
    if (seen.has(key)) return rejected.push(`${at}: duplicate question`)
    seen.add(key)
    kept.push({ kind: 'mcq', q, options, answer: answer as number, why, quote })
  })
  return { kept, rejected }
}

// ---- code review: validation ----

const VERDICTS = new Set(['correct', 'partial', 'incorrect'])
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

export interface ReviewCheck {
  review: CodeReview | null
  errors: string[]
}

/** Accept a review only if every field is present and every issue points at
 *  code the learner actually wrote. `patternKeys` are the patterns that exist. */
export function checkReview(raw: unknown, code: string, patternKeys: string[]): ReviewCheck {
  const errors: string[] = []
  const x = (raw ?? {}) as Record<string, unknown>
  const verdict = str(x.verdict, 20)
  if (!VERDICTS.has(verdict)) errors.push(`verdict must be correct, partial or incorrect (got "${verdict}")`)
  const summary = str(x.summary, 1200)
  if (summary.length < 10) errors.push('summary is missing')
  const p = (x.pattern ?? {}) as Record<string, unknown>
  const key = typeof p.key === 'string' && p.key.trim() ? p.key.trim() : null
  if (key && !patternKeys.includes(key)) errors.push(`pattern.key "${key}" is not a known pattern`)
  const flat = squash(code)
  const issues: ReviewIssue[] = []
  for (const [i, it] of (Array.isArray(x.issues) ? x.issues : []).entries()) {
    const r = (it ?? {}) as Record<string, unknown>
    const snippet = str(r.snippet, 400)
    const issue = { snippet, problem: str(r.problem, 800), fix: str(r.fix, 800) }
    if (!issue.problem || !issue.fix) errors.push(`issue ${i + 1}: problem and fix are required`)
    else if (snippet && !flat.includes(squash(snippet))) errors.push(`issue ${i + 1}: snippet "${snippet.slice(0, 60)}" is not in the learner's code`)
    else issues.push(issue)
  }
  if (verdict !== 'correct' && verdict && issues.length === 0 && !errors.some((e) => e.startsWith('issue')))
    errors.push('a partial or incorrect verdict needs at least one issue')
  const c = (x.complexity ?? {}) as Record<string, unknown>
  const review: CodeReview = {
    verdict: verdict as CodeReview['verdict'],
    summary,
    pattern: { key, fits: p.fits === true, note: str(p.note, 600) },
    issues,
    edgeCases: (Array.isArray(x.edgeCases) ? x.edgeCases : []).map((e) => str(e, 300)).filter(Boolean).slice(0, 8),
    complexity: { time: str(c.time, 80), space: str(c.space, 80) },
    next: str(x.next, 600),
  }
  if (!review.complexity.time || !review.complexity.space) errors.push('complexity.time and complexity.space are required')
  return { review: errors.length ? null : review, errors }
}

/** Stable key for a review: same problem and same code give the same review. */
export function reviewKey(problemId: string, code: string, version: number): string {
  const s = `${version}|${problemId}|${code.replace(/[ \t]+$/gm, '').trim()}`
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619)
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822519)
  }
  return `${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`
}
