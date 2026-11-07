import type { Content, Lesson } from './types'

// Lint for the rich fenced blocks a lesson can carry (flow, stack, bars, steps,
// recall, mermaid). Pure, and the same rules the renderer parses by, so a
// malformed diagram is caught before it is written: by scripts/build-content.ts
// for authored lessons, and by the assistant for lessons it writes.

export interface BlockLint {
  errors: string[]
  warnings: string[]
}

export const FLOW_KINDS = ['step', 'actor', 'model', 'store', 'tool', 'gate'] as const

function fences(md: string): { lang: string; text: string }[] {
  return [...md.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1], text: m[2] }))
}

/** Check every rich block in one markdown text. `at` prefixes each message. */
export function lintBlocks(md: string, at: string): BlockLint {
  const errors: string[] = []
  const warnings: string[] = []
  for (const { lang, text } of fences(md)) {
    const where = `${at} (${lang})`
    if (lang === 'flow') {
      const nodes = new Set<string>()
      let edges = 0
      for (const raw of text.split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#') || /^dir\s*:/i.test(line)) continue
        const e = /^([\w-]+)\s*(-->|->)\s*([\w-]+)(?:\s*:\s*(.+))?$/.exec(line)
        if (e) {
          edges++
          for (const n of [e[1], e[3]]) if (!nodes.has(n)) errors.push(`${where}: edge uses undeclared node "${n}"`)
          if (e[4] && e[4].length > 24) warnings.push(`${where}: edge label over 24 chars: "${e[4]}"`)
          continue
        }
        const n = /^([\w-]+)\s*:\s*(.+?)(?:\s*\|\s*(\w+))?$/.exec(line)
        if (n) {
          nodes.add(n[1])
          if (n[2].length > 28) warnings.push(`${where}: node label over 28 chars: "${n[2]}"`)
          if (n[3] && !(FLOW_KINDS as readonly string[]).includes(n[3].toLowerCase()))
            errors.push(`${where}: unknown node kind "${n[3]}"`)
        } else errors.push(`${where}: unparseable line "${line}"`)
      }
      if (nodes.size > 12) warnings.push(`${where}: ${nodes.size} nodes (max 12)`)
      if (edges === 0) errors.push(`${where}: no edges`)
    } else if (lang === 'stack' || lang === 'bars') {
      const rows = text.split('\n').filter((l) => l.includes('|') && !/^(title|unit):/i.test(l.trim()))
      if (rows.length < 2 || rows.length > 8) errors.push(`${where}: needs 2 to 8 rows, has ${rows.length}`)
      for (const r of rows)
        if (!Number.isFinite(Number(r.split('|')[1]?.trim().replace(/,/g, ''))))
          errors.push(`${where}: non-numeric value in "${r}"`)
    } else if (lang === 'steps') {
      const rows = text.split('\n').filter((l) => l.trim())
      if (rows.length < 2) errors.push(`${where}: needs at least 2 steps, has ${rows.length}`)
      else if (rows.length < 3 || rows.length > 8) warnings.push(`${where}: ${rows.length} steps (3 to 8)`)
    } else if (lang === 'recall') {
      const q = (text.match(/^Q:/gm) ?? []).length
      const a = (text.match(/^A:/gm) ?? []).length
      if (q !== a || q < 2) errors.push(`${where}: ${q} questions, ${a} answers`)
    } else if (lang === 'mermaid') {
      const parts = (text.match(/^\s*participant\s/gm) ?? []).length
      if (parts > 6) warnings.push(`${where}: ${parts} participants (max 6)`)
      if (!/sequenceDiagram/.test(text)) errors.push(`${where}: not a sequenceDiagram`)
    } else if (lang === 'check') {
      const c = parseCheck(text)
      if (!c) errors.push(`${where}: needs "Q: ...", 2 to 5 option lines ("- wrong", "* right", exactly one "*") and "Why: ..."`)
      else {
        const lens = c.options.map((o) => o.text.split(/\s+/).length)
        if (Math.max(...lens) - Math.min(...lens) > 4) warnings.push(`${where}: option lengths differ a lot; the longest one gives the answer away`)
      }
    }
  }
  return { errors, warnings }
}

export interface CheckSpec {
  q: string
  options: { text: string; right: boolean }[]
  why: string
}

/** ```check — one question with options and an explanation:
 *  "Q: ...", then "- wrong" / "* right" lines (exactly one right), then "Why: ...". */
export function parseCheck(src: string): CheckSpec | null {
  let q = ''
  let why = ''
  let mode: 'q' | 'why' | 'opt' | null = null
  const options: { text: string; right: boolean }[] = []
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
      options.push({ text: mo[2].trim(), right: mo[1] === '*' })
      mode = 'opt'
    } else if (mode === 'q') q += ` ${line}`
    else if (mode === 'why') why += ` ${line}`
    else if (mode === 'opt') options[options.length - 1].text += ` ${line}`
  }
  const right = options.filter((o) => o.right).length
  if (!q.trim() || !why.trim() || options.length < 2 || options.length > 5 || right !== 1) return null
  return { q: q.trim(), options, why: why.trim() }
}

function lessonsById(c: Content): Map<string, Lesson> {
  const m = new Map<string, Lesson>()
  for (const co of c.courses) for (const ch of co.chapters) for (const l of ch.lessons) m.set(l.id, l)
  return m
}

/** Block errors in lessons that are new or whose text changed between two
 *  stores. Lessons nobody touched are never re-judged. */
export function lintChangedLessons(before: Content, after: Content): string[] {
  const old = lessonsById(before)
  const errors: string[] = []
  for (const [id, l] of lessonsById(after)) {
    const prev = old.get(id)
    if (prev && prev.body === l.body && prev.deeper === l.deeper) continue
    errors.push(...lintBlocks(l.body ?? '', `lesson ${id} body`).errors)
    if (l.deeper) errors.push(...lintBlocks(l.deeper, `lesson ${id} deeper`).errors)
  }
  return errors
}
