// Assemble authored lessons (content-src/<course>/lessons/*.md) into the bundled
// seed. Idempotent: re-running replaces the course's chapters from the sources.
//
//   node scripts/run-ts.mjs scripts/build-content.ts            # build ai
//   node scripts/run-ts.mjs scripts/build-content.ts --check    # validate only
//   node scripts/run-ts.mjs scripts/build-content.ts --course=sd --extract   # seed -> content-src (once, to start authoring a course)
//
// Lesson file: front matter (id, chapter, title, minutes), the body, then an
// optional `===DEEPER===` section. Rich blocks are validated with the same
// rules the renderer uses, so a malformed diagram fails here, not on screen.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Chapter, Content, Lesson } from '../src/shared/types'
import { validateContent } from '../src/shared/validate'

const root = process.cwd()
const check = process.argv.includes('--check')
const courseKey = process.argv.find((a) => a.startsWith('--course='))?.slice(9) ?? 'ai'
const srcDir = path.join(root, 'content-src', courseKey)
const errors: string[] = []
const warnings: string[] = []

interface ChapterDef {
  id: string
  title: string
  summary: string
  lessons: string[]
  problemIds: string[]
}
interface CourseDef {
  course: string
  blurb?: string
  chapters: ChapterDef[]
}

if (process.argv.includes('--extract')) {
  const seedNow = JSON.parse(readFileSync(path.join(root, 'seed', 'content.json'), 'utf8')) as Content
  const c = seedNow.courses.find((x) => x.key === courseKey)
  if (!c) throw new Error(`seed has no course "${courseKey}"`)
  mkdirSync(path.join(srcDir, 'lessons'), { recursive: true })
  const outDef: CourseDef = {
    course: c.key,
    chapters: c.chapters.map((ch) => ({ id: ch.id, title: ch.title, summary: ch.summary, lessons: ch.lessons.map((l) => l.id), problemIds: ch.problemIds ?? [] })),
  }
  writeFileSync(path.join(srcDir, 'course.json'), JSON.stringify(outDef, null, 2) + '\n')
  for (const ch of c.chapters)
    for (const l of ch.lessons) {
      const head = `---\nid: ${l.id}\nchapter: ${ch.id}\ntitle: ${l.title}\nminutes: ${l.minutes}\n---\n`
      writeFileSync(path.join(srcDir, 'lessons', `${l.id}.md`), head + l.body + '\n' + (l.deeper ? `\n===DEEPER===\n${l.deeper}\n` : ''))
    }
  console.log(`extracted ${c.chapters.reduce((n, ch) => n + ch.lessons.length, 0)} lessons of ${c.key} to content-src/${c.key}`)
  process.exit(0)
}

const def = JSON.parse(readFileSync(path.join(srcDir, 'course.json'), 'utf8')) as CourseDef

function parseFile(file: string): { meta: Record<string, string>; body: string; deeper?: string } | null {
  const raw = readFileSync(file, 'utf8')
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw)
  if (!m) return null
  const meta: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = /^(\w+):\s*(.*)$/.exec(line)
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  const [body, deeper] = m[2].split(/\n===DEEPER===\n/)
  return { meta, body: body.trim(), deeper: deeper?.trim() || undefined }
}

const words = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length

function fences(md: string): { lang: string; text: string }[] {
  return [...md.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1], text: m[2] }))
}

function checkBlocks(id: string, md: string, where: string) {
  for (const { lang, text } of fences(md)) {
    const at = `${id} (${where}, ${lang})`
    if (lang === 'flow') {
      const nodes = new Set<string>()
      let edges = 0
      for (const raw of text.split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#') || /^dir\s*:/i.test(line)) continue
        const e = /^([\w-]+)\s*(-->|->)\s*([\w-]+)(?:\s*:\s*(.+))?$/.exec(line)
        if (e) {
          edges++
          for (const n of [e[1], e[3]]) if (!nodes.has(n)) errors.push(`${at}: edge uses undeclared node "${n}"`)
          if (e[4] && e[4].length > 24) warnings.push(`${at}: edge label over 24 chars: "${e[4]}"`)
          continue
        }
        const n = /^([\w-]+)\s*:\s*(.+?)(?:\s*\|\s*(\w+))?$/.exec(line)
        if (n) {
          nodes.add(n[1])
          if (n[2].length > 28) warnings.push(`${at}: node label over 28 chars: "${n[2]}"`)
          if (n[3] && !['step', 'actor', 'model', 'store', 'tool', 'gate'].includes(n[3].toLowerCase())) errors.push(`${at}: unknown node kind "${n[3]}"`)
        } else errors.push(`${at}: unparseable line "${line}"`)
      }
      if (nodes.size > 12) warnings.push(`${at}: ${nodes.size} nodes (max 12)`)
      if (edges === 0) errors.push(`${at}: no edges`)
    } else if (lang === 'stack' || lang === 'bars') {
      const rows = text.split('\n').filter((l) => l.includes('|') && !/^(title|unit):/i.test(l.trim()))
      if (rows.length < 2 || rows.length > 8) errors.push(`${at}: needs 2 to 8 rows, has ${rows.length}`)
      for (const r of rows) if (!Number.isFinite(Number(r.split('|')[1]?.trim().replace(/,/g, '')))) errors.push(`${at}: non-numeric value in "${r}"`)
    } else if (lang === 'steps') {
      const rows = text.split('\n').filter((l) => l.trim())
      if (rows.length < 3 || rows.length > 8) warnings.push(`${at}: ${rows.length} steps (3 to 8)`)
    } else if (lang === 'recall') {
      const q = (text.match(/^Q:/gm) ?? []).length
      const a = (text.match(/^A:/gm) ?? []).length
      if (q !== a || q < 2) errors.push(`${at}: ${q} questions, ${a} answers`)
    } else if (lang === 'mermaid') {
      const parts = (text.match(/^\s*participant\s/gm) ?? []).length
      if (parts > 6) warnings.push(`${at}: ${parts} participants (max 6)`)
      if (!/sequenceDiagram/.test(text)) errors.push(`${at}: not a sequenceDiagram`)
    }
  }
}

function checkProse(id: string, md: string) {
  let inFence = false
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) inFence = !inFence
    if (inFence) continue
    const h = /^(#{2,3})\s+(.+)$/.exec(line)
    if (h) {
      if (/['"`]/.test(h[2])) warnings.push(`${id}: heading has quote/apostrophe: "${h[2]}"`)
      if (h[2].split(/\s+/).length > 7) warnings.push(`${id}: long heading: "${h[2]}"`)
    }
  }
}

const seedFile = path.join(root, 'seed', 'content.json')
const seed = JSON.parse(readFileSync(seedFile, 'utf8')) as Content
const course = seed.courses.find((c) => c.key === def.course)
if (!course) throw new Error(`seed has no course "${def.course}"`)

const allIds = def.chapters.flatMap((c) => c.lessons)
const dup = allIds.filter((id, i) => allIds.indexOf(id) !== i)
if (dup.length) errors.push(`duplicate lesson ids in course.json: ${dup.join(', ')}`)

const chapters: Chapter[] = []
let totalWords = 0
for (const ch of def.chapters) {
  const lessons: Lesson[] = []
  for (const id of ch.lessons) {
    const file = path.join(srcDir, 'lessons', `${id}.md`)
    const fallback = path.join(srcDir, 'existing', `${id}.md`)
    const usedFallback = !existsSync(file)
    const parsed = usedFallback && !existsSync(fallback) ? null : parseFile(usedFallback ? fallback : file)
    if (!parsed) {
      errors.push(`${id}: no lesson file (and no original to fall back to)`)
      continue
    }
    if (usedFallback) warnings.push(`${id}: not written yet, keeping the original lesson`)
    const { meta, body, deeper } = parsed
    if (meta.id !== id) errors.push(`${id}: front matter id is "${meta.id}"`)
    if (!meta.title) errors.push(`${id}: missing title`)
    if (!usedFallback) {
      if (meta.chapter !== ch.id) errors.push(`${id}: front matter chapter "${meta.chapter}" but course.json puts it in ${ch.id}`)
      checkBlocks(id, body, 'body')
      if (deeper) checkBlocks(id, deeper, 'deeper')
      checkProse(id, body)
      const wb = words(body)
      const wd = deeper ? words(deeper) : 0
      if (courseKey === 'ai') {
        if (wb < 450 || wb > 1500) warnings.push(`${id}: body is ${wb} words`)
        if (!deeper) warnings.push(`${id}: no deeper section`)
      }
      if (!/```recall/.test(body)) warnings.push(`${id}: no recall block in the body`)
      if (!/```(flow|mermaid|stack|bars|steps)/.test(body)) warnings.push(`${id}: no diagram in the body`)
      totalWords += wb + wd
    }
    const minutes = Math.max(2, Math.round((words(body) + (deeper ? words(deeper) : 0)) / 180))
    lessons.push({ id, title: meta.title, minutes, body, ...(deeper ? { deeper } : {}) })
  }
  chapters.push({ id: ch.id, title: ch.title, summary: ch.summary, lessons, problemIds: ch.problemIds })
}

course.chapters = chapters
if (def.blurb) course.blurb = def.blurb

const problems = validateContent(seed)
for (const p of problems) errors.push(`store: ${p}`)

const count = chapters.reduce((n, c) => n + c.lessons.length, 0)
console.log(`${def.course}: ${chapters.length} chapters, ${count} lessons, ${totalWords} authored words`)
for (const w of warnings) console.log(`  warn  ${w}`)
for (const e of errors) console.log(`  ERROR ${e}`)
if (errors.length) process.exit(1)
if (!check) {
  writeFileSync(seedFile, JSON.stringify(seed))
  console.log(`wrote ${path.relative(root, seedFile)}`)
}
