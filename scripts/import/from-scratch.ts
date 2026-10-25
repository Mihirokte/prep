// Import "AI Engineering from Scratch" (github.com/rohitg00/ai-engineering-from-scratch,
// MIT) into content-src/scratch, one lesson file per upstream lesson. Re-runnable:
// it rewrites content-src/scratch from the checkout every time.
//
//   git clone --depth 1 --filter=blob:none --no-checkout <repo> <dir>
//   git -C <dir> sparse-checkout set --no-cone /LICENSE '/phases/*/README.md' \
//     '/phases/*/*/docs/en.md' '/phases/*/*/quiz.json'
//   git -C <dir> checkout main
//   node scripts/run-ts.mjs scripts/import/from-scratch.ts --src=<dir>
//   node scripts/run-ts.mjs scripts/build-content.ts --course=scratch
//
// What the import does to each lesson, so it reads and works inside Prep:
//   - mermaid flowcharts and state diagrams become `flow` blocks (animated in
//     the app); sequence diagrams keep the subset Prep draws; other diagram
//     kinds stay as source text
//   - links to other lessons open the lesson in Prep; other repository links
//     go to GitHub at the imported commit; in-page anchors become plain text
//   - images and `figure` placeholders are dropped (their SVGs carry their own
//     colours and fonts)
//   - Exercises, Key Terms and Further Reading move to the "Go deeper" section
//   - quiz.json becomes the lesson's recall deck, which feeds Review

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cleanMarkdown } from '../../src/shared/sources'

const REPO = 'rohitg00/ai-engineering-from-scratch'
const KEY = 'scratch'
const root = process.cwd()
const src = process.argv.find((a) => a.startsWith('--src='))?.slice(6)
if (!src || !existsSync(path.join(src, 'phases'))) throw new Error('usage: from-scratch.ts --src=<sparse checkout of the repository>')
const sha = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const outDir = path.join(root, 'content-src', KEY)
const lessonsDir = path.join(outDir, 'lessons')
mkdirSync(lessonsDir, { recursive: true })

const gh = (kind: 'tree' | 'blob', p: string) => `https://github.com/${REPO}/${kind}/${sha}/${p}`
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const lessonId = (phaseDir: string, lessonDir: string) => `${KEY}-${phaseDir.slice(0, 2)}-${slug(lessonDir)}`
const straight = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')

const stats = { flow: 0, sequence: 0, mermaidText: 0, figuresDropped: 0, images: 0, lessonLinks: 0, repoLinks: 0, anchors: 0, recall: 0 }

// ---- mermaid -> Prep blocks ----

type Kind = 'step' | 'actor' | 'model' | 'store' | 'tool' | 'gate'

function kindOf(label: string, shape: string): Kind {
  if (shape.startsWith('{')) return 'gate'
  if (shape.startsWith('[(')) return 'store'
  if (/\b(user|client|human|browser|caller|customer|operator|developer)\b/i.test(label)) return 'actor'
  if (/\b(llm|model|gpt|claude|gemini|embed\w*|rerank\w*|encoder|decoder|transformer|classifier|judge)\b/i.test(label)) return 'model'
  if (/\b(db|database|store|cache|index|queue|memory|vector|log|bucket|registry|kv)\b/i.test(label)) return 'store'
  if (/\b(api|tool|server|service|search|web|mcp|sandbox|shell)\b/i.test(label)) return 'tool'
  return 'step'
}

const cleanLabel = (s: string, max: number) => {
  const t = straight(s)
    .replace(/<br\s*\/?>|\\n/gi, ' ')
    .replace(/#quot;/g, '"')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[|`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t
}

// Node shapes, longest delimiters first.
const SHAPES: [string, string][] = [['((', '))'], ['[(', ')]'], ['([', '])'], ['[[', ']]'], ['{{', '}}'], ['[/', '/]'], ['[\\', '\\]'], ['[/', '\\]'], ['[', ']'], ['(', ')'], ['{', '}'], ['>', ']']]

interface FNode { id: string; label: string; kind: Kind }

/** A mermaid flowchart / graph as a Prep `flow` block, or null when it does not fit. */
function flowFromMermaid(text: string): string | null {
  const lines = text.split('\n').map((l) => l.replace(/%%.*$/, '').trim()).filter(Boolean)
  const head = /^(flowchart|graph)\s*(\w+)?/i.exec(lines[0] ?? '')
  if (!head) return null
  const dir = /^(LR|RL)$/i.test(head[2] ?? '') ? 'LR' : 'TB'
  const nodes = new Map<string, FNode>()
  const edges: { from: string; to: string; label?: string; dashed: boolean }[] = []

  const node = (s: string, i: number): { ids: string[]; at: number } | null => {
    const ids: string[] = []
    let at = i
    for (;;) {
      const m = /^\s*([A-Za-z0-9_]+)/.exec(s.slice(at))
      if (!m) return ids.length ? { ids, at } : null
      const id = m[1]
      at += m[0].length
      let label = id
      let shape = ''
      for (const [open, close] of SHAPES) {
        if (!s.startsWith(open, at)) continue
        const end = s.indexOf(close, at + open.length)
        if (end < 0) continue
        label = s.slice(at + open.length, end)
        shape = open
        at = end + close.length
        break
      }
      const prev = nodes.get(id)
      if (!prev || (shape && prev.label === id)) nodes.set(id, { id, label: cleanLabel(label, 40), kind: kindOf(label, shape) })
      ids.push(id)
      const amp = /^\s*&\s*/.exec(s.slice(at))
      if (!amp) return { ids, at }
      at += amp[0].length
    }
  }
  const LINK = /^\s*(<)?(-{2,}>?|-\.+->?|={2,}>?|~{3,}|--[ox]|-->[ox]?)(?:\|([^|]*)\|)?/
  const TEXT_LINK = /^\s*(--|-\.|==)\s+(.+?)\s+(-->|\.->|==>|---|-\.-|===)/

  for (const line of lines.slice(1)) {
    if (/^(subgraph|end\b|style|classDef|class\s|click|linkStyle|direction)/i.test(line)) continue
    for (const stmt of line.split(';').map((x) => x.trim()).filter(Boolean)) {
      let left = node(stmt, 0)
      if (!left) continue
      let at = left.at
      for (;;) {
        const rest = stmt.slice(at)
        let label: string | undefined
        let dashed = false
        let m = TEXT_LINK.exec(rest)
        if (m) {
          label = m[2]
          dashed = m[1] === '-.'
          at += m[0].length
        } else if ((m = LINK.exec(rest))) {
          if (m[2].startsWith('~')) break
          label = m[3]
          dashed = m[2].includes('.')
          at += m[0].length
        } else break
        const right = node(stmt, at)
        if (!right) break
        for (const a of left.ids)
          for (const b of right.ids)
            if (a !== b && !edges.some((e) => e.from === a && e.to === b))
              edges.push({ from: a, to: b, label: label ? cleanLabel(label, 32) : undefined, dashed })
        left = right
        at = right.at
      }
    }
  }
  if (!edges.length || nodes.size > 14) return null
  const used = new Set(edges.flatMap((e) => [e.from, e.to]))
  return [
    `dir: ${dir}`,
    ...[...nodes.values()].filter((n) => used.has(n.id)).map((n) => `${n.id}: ${n.label || n.id} | ${n.kind}`),
    ...edges.map((e) => `${e.from} ${e.dashed ? '-->' : '->'} ${e.to}${e.label ? ` : ${e.label}` : ''}`),
  ].join('\n')
}

/** A mermaid state diagram as a `flow` block ([*] becomes Start / End). */
function flowFromState(text: string): string | null {
  const lines = text.split('\n').map((l) => l.replace(/%%.*$/, '').trim()).filter(Boolean)
  if (!/^stateDiagram/i.test(lines[0] ?? '')) return null
  const nodes = new Map<string, FNode>()
  const edges: string[] = []
  const id = (s: string, side: 'from' | 'to') => {
    const raw = s === '[*]' ? (side === 'from' ? 'start' : 'done') : s
    const key = raw.replace(/[^\w-]/g, '_')
    if (!nodes.has(key)) nodes.set(key, { id: key, label: raw === 'start' ? 'Start' : raw === 'done' ? 'End' : cleanLabel(raw.replace(/_/g, ' '), 40), kind: raw === 'start' || raw === 'done' ? 'actor' : 'step' })
    return key
  }
  for (const line of lines.slice(1)) {
    const m = /^(\[\*\]|[\w-]+)\s*-->\s*(\[\*\]|[\w-]+)(?:\s*:\s*(.+))?$/.exec(line)
    if (m) edges.push(`${id(m[1], 'from')} -> ${id(m[2], 'to')}${m[3] ? ` : ${cleanLabel(m[3], 32)}` : ''}`)
  }
  if (!edges.length || nodes.size > 14) return null
  return ['dir: LR', ...[...nodes.values()].map((n) => `${n.id}: ${n.label} | ${n.kind}`), ...edges].join('\n')
}

/** The sequence-diagram subset Prep draws: participants, ->> / -->> messages, notes. */
function sequenceSubset(text: string): string | null {
  const out: string[] = ['sequenceDiagram']
  const declared: string[] = []
  const msgs: string[] = []
  for (const raw of text.split('\n').slice(1)) {
    const line = raw.replace(/%%.*$/, '').trim()
    let m = /^(?:participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/.exec(line)
    if (m) {
      if (!declared.includes(m[1])) declared.push(m[1])
      out.push(`    participant ${m[1]}${m[2] ? ` as ${cleanLabel(m[2], 28)}` : ''}`)
      continue
    }
    m = /^(\S+?)\s*(-->>|->>|--\)|-\)|-->|->|--x|-x)[+-]?\s*(\S+?)\s*:\s*(.+)$/.exec(line)
    if (m) {
      for (const p of [m[1], m[3]])
        if (!declared.includes(p)) {
          declared.push(p)
          out.push(`    participant ${p}`)
        }
      msgs.push(`    ${m[1]}${m[2].startsWith('--') ? '-->>' : '->>'}${m[3]}: ${cleanLabel(m[4], 40)}`)
      continue
    }
    m = /^Note\s+(over|left of|right of)\s+([^:]+):\s*(.+)$/i.exec(line)
    if (m) msgs.push(`    Note over ${m[2].split(',')[0].trim()}: ${cleanLabel(m[3], 40)}`)
  }
  if (declared.length > 6 || !msgs.length) return null
  return [...out, ...msgs].join('\n')
}

// ---- markdown transforms ----

/** Rewrite every fenced block; prose between fences goes through `prose`. */
function transform(md: string, prose: (s: string) => string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let buf: string[] = []
  const flush = () => {
    if (buf.length) out.push(prose(buf.join('\n')))
    buf = []
  }
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s{0,3})(`{3,})\s*([\w+-]*)(.*)$/.exec(lines[i])
    if (!open) {
      buf.push(lines[i])
      continue
    }
    flush()
    const [, indent, ticks, lang] = open
    const body: string[] = []
    let j = i + 1
    while (j < lines.length && !new RegExp(`^\\s{0,3}${ticks}\`*\\s*$`).test(lines[j])) body.push(lines[j++].replace(new RegExp(`^${indent}`), ''))
    i = j
    const text = body.join('\n')
    const fence = (l: string, t: string) => `\`\`\`${l}\n${t.replace(/\n+$/, '')}\n\`\`\``
    if (lang === 'figure') {
      stats.figuresDropped++
      continue
    }
    if (lang === 'mermaid') {
      const kind = text.trim().split(/\s/)[0]
      const flow = /^(flowchart|graph)$/i.test(kind) ? flowFromMermaid(text) : /^stateDiagram/i.test(kind) ? flowFromState(text) : null
      if (flow) {
        stats.flow++
        out.push(fence('flow', flow))
        continue
      }
      const seq = kind === 'sequenceDiagram' ? sequenceSubset(text) : null
      if (seq) {
        stats.sequence++
        out.push(fence('mermaid', seq))
        continue
      }
      stats.mermaidText++
      out.push(fence('text', text))
      continue
    }
    // Info strings Prep renders as live blocks must not collide with plain code.
    out.push(fence(['flow', 'stack', 'bars', 'steps', 'recall', 'viz'].includes(lang) ? 'text' : lang, text))
  }
  flush()
  return out.join('\n')
}

/** Resolve a relative link from a lesson's docs/en.md to a Prep route or GitHub URL. */
function rewriteLinks(md: string, docPath: string, lessonDirs: Map<string, string>): string {
  const base = path.posix.dirname(docPath)
  const toRoute = (repoPath: string): string | null => {
    const m = /^phases\/([^/]+)\/([^/]+)(?:\/(?:docs\/en\.md|README\.md)?)?\/?$/.exec(repoPath)
    if (!m) return null
    const id = lessonDirs.get(`${m[1]}/${m[2]}`)
    return id ? `#/study/${KEY}/${id}` : null
  }
  return md.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (all, bang: string, text: string, href: string) => {
    if (bang) {
      stats.images++
      return ''
    }
    if (href.startsWith('#')) {
      stats.anchors++
      return text
    }
    const site = /^https?:\/\/aiengineeringfromscratch\.com\/lesson\?path=([^&#)]+)/.exec(href)
    if (site) {
      const r = toRoute(decodeURIComponent(site[1]))
      if (r) {
        stats.lessonLinks++
        return `[${text}](${r})`
      }
    }
    if (/^[a-z]+:/i.test(href)) return all
    const [p] = href.split('#')
    const repoPath = path.posix.normalize(path.posix.join(base, p))
    if (repoPath.startsWith('..')) return text
    const route = toRoute(repoPath)
    if (route) {
      stats.lessonLinks++
      return `[${text}](${route})`
    }
    stats.repoLinks++
    return `[${text}](${gh(/\.[a-z0-9]+$/i.test(repoPath) ? 'blob' : 'tree', repoPath.replace(/\/$/, ''))})`
  })
}

const DEEPER = /^(exercises|key terms|further reading|references|reading list|glossary|sources)\b/i

/** Split at `##` headings: Exercises, Key Terms and Further Reading go to "deeper". */
function splitDeeper(md: string): { body: string; deeper: string } {
  const parts = md.split(/\n(?=## )/)
  const body: string[] = []
  const deeper: string[] = []
  for (const p of parts) (DEEPER.test(p.replace(/^## /, '').trim()) && p.startsWith('## ') ? deeper : body).push(p.trim())
  return { body: body.join('\n\n'), deeper: deeper.join('\n\n') }
}

type QuizItem = { question: string; options: string[]; correct: number; explanation?: string }

function recallBlock(file: string): string {
  if (!existsSync(file)) return ''
  // Most quiz files are {lesson, title, questions}; a few are a bare array.
  const raw = JSON.parse(readFileSync(file, 'utf8')) as QuizItem[] | { questions?: QuizItem[] }
  const q = Array.isArray(raw) ? raw : (raw.questions ?? [])
  const one = (s: string) => straight(String(s)).replace(/\s+/g, ' ').trim()
  const rows = q
    .filter((x) => x.question && Array.isArray(x.options) && x.options[x.correct] !== undefined)
    .map((x) => `Q: ${one(x.question)}\nA: ${one(x.options[x.correct])}.${x.explanation ? ` ${one(x.explanation)}` : ''}`.replace(/\.\./g, '.'))
  if (rows.length < 2) return ''
  stats.recall += rows.length
  return `## Check yourself\n\n\`\`\`recall\n${rows.join('\n')}\n\`\`\``
}

// ---- the import ----

const phases = readdirSync(path.join(src, 'phases')).filter((d) => /^\d\d-/.test(d)).sort()
const lessonDirs = new Map<string, string>()
for (const p of phases)
  for (const l of readdirSync(path.join(src, 'phases', p)).sort())
    if (existsSync(path.join(src, 'phases', p, l, 'docs', 'en.md'))) lessonDirs.set(`${p}/${l}`, lessonId(p, l))

const chapters = []
for (const p of phases) {
  const readme = existsSync(path.join(src, 'phases', p, 'README.md')) ? readFileSync(path.join(src, 'phases', p, 'README.md'), 'utf8') : ''
  const title = straight(/^#\s+(?:Phase\s+\d+\s*[:.-]\s*)?(.+)$/m.exec(readme)?.[1]?.trim() ?? p.slice(3).replace(/-/g, ' '))
  const summary = straight(/^>\s*(.+)$/m.exec(readme)?.[1]?.trim() ?? '')
  const lessons: string[] = []
  for (const l of readdirSync(path.join(src, 'phases', p)).sort()) {
    const id = lessonDirs.get(`${p}/${l}`)
    if (!id) continue
    const docPath = `phases/${p}/${l}/docs/en.md`
    const raw = readFileSync(path.join(src, docPath), 'utf8').replace(/\r\n/g, '\n')
    const h1 = /^#\s+(.+)$/m.exec(raw)
    const lessonTitle = straight(h1?.[1]?.trim() ?? l.slice(3).replace(/-/g, ' ')).replace(/\s+—\s+/g, ': ')
    const rest = h1 ? raw.slice(raw.indexOf(h1[0]) + h1[0].length) : raw
    const md = transform(rest, (s) => rewriteLinks(cleanMarkdown(s), docPath, lessonDirs))
    const { body, deeper } = splitDeeper(md.replace(/\n{3,}/g, '\n\n').trim())
    const credit = `Source: [AI Engineering from Scratch, phase ${Number(p.slice(0, 2))}, ${l}](${gh('tree', `phases/${p}/${l}`)}), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.`
    const recall = recallBlock(path.join(src, 'phases', p, l, 'quiz.json'))
    const file = [
      '---',
      `id: ${id}`,
      `chapter: ${KEY}-${slug(p)}`,
      `title: ${lessonTitle}`,
      'minutes: 0',
      '---',
      [body, credit, recall].filter(Boolean).join('\n\n'),
      ...(deeper ? ['', '===DEEPER===', deeper] : []),
      '',
    ].join('\n')
    writeFileSync(path.join(lessonsDir, `${id}.md`), file)
    lessons.push(id)
  }
  chapters.push({ id: `${KEY}-${slug(p)}`, title, summary, lessons, problemIds: [] })
}

const course = {
  course: KEY,
  label: 'AI from Scratch',
  after: 'ai',
  blurb:
    'The full AI Engineering from Scratch curriculum: math and ML foundations through transformers, LLMs, tools and protocols, agents, multi-agent systems, production and safety, then capstones. Imported from the open-source course, with its diagrams redrawn and its quizzes as recall decks.',
  references: [
    { label: 'AI Engineering from Scratch (website)', url: 'https://aiengineeringfromscratch.com/' },
    { label: `AI Engineering from Scratch on GitHub (MIT), imported at ${sha.slice(0, 7)}`, url: `https://github.com/${REPO}` },
  ],
  chapters,
}
writeFileSync(path.join(outDir, 'course.json'), `${JSON.stringify(course, null, 2)}\n`)
writeFileSync(
  path.join(outDir, 'SOURCE.md'),
  `# Source\n\nThe lessons in this folder are generated by \`scripts/import/from-scratch.ts\` from\n[${REPO}](https://github.com/${REPO}) at commit \`${sha}\`.\nDo not edit them by hand; change the importer and re-run it.\n\n## Licence of the source material\n\n\`\`\`text\n${readFileSync(path.join(src, 'LICENSE'), 'utf8').trim()}\n\`\`\`\n`,
)
console.log(`${chapters.length} chapters, ${lessonDirs.size} lessons from ${REPO}@${sha.slice(0, 7)}`)
console.log(JSON.stringify(stats))
