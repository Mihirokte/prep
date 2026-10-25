// Web and GitHub sources the assistant can read. Pure: URL handling, HTML to
// text, GitHub tree summaries and the SOURCES section of the prompt. The
// network work lives in main/web.ts.

export type SourceKind = 'web' | 'github-repo' | 'github-dir' | 'github-file'

export interface Source {
  /** The URL as requested. */
  url: string
  kind: SourceKind
  title: string
  /** Licence identifier when known (GitHub SPDX id, e.g. "MIT"). */
  license?: string
  text: string
  /** Set when the read failed; `text` is then empty. */
  error?: string
}

/** What the renderer shows under a reply: which sources the plan was built from. */
export interface SourceRef {
  url: string
  title: string
  ok: boolean
}

export const toRef = (s: Source): SourceRef => ({ url: s.url, title: s.title, ok: !s.error })

const TRAILING = /[).,;:!?'"\]>]+$/

/** http(s) URLs in a text, in order, without duplicates or trailing punctuation. */
export function extractUrls(text: string, max = 8): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    let u = m[0].replace(TRAILING, '')
    // A closing paren that belongs to the URL, as in a Wikipedia link, has an opener.
    if (m[0].endsWith(')') && u.includes('(') && !u.endsWith(')')) u += ')'
    try {
      const url = new URL(u)
      url.hash = ''
      const norm = url.toString()
      if (!out.includes(norm)) out.push(norm)
    } catch {
      // not a URL after all
    }
    if (out.length >= max) break
  }
  return out
}

export interface GithubRef {
  owner: string
  repo: string
  kind: 'repo' | 'tree' | 'blob'
  /** Branch or tag; resolved to the default branch when absent. */
  ref?: string
  path: string
}

/** Classify a github.com or raw.githubusercontent.com URL. */
export function parseGithub(raw: string): GithubRef | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (url.hostname === 'raw.githubusercontent.com' && parts.length >= 4)
    return { owner: parts[0], repo: parts[1], kind: 'blob', ref: parts[2], path: parts.slice(3).join('/') }
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null
  if (parts.length < 2) return null
  const [owner, repoRaw, mode, ref, ...rest] = parts
  const repo = repoRaw.replace(/\.git$/, '')
  if (parts.length === 2) return { owner, repo, kind: 'repo', path: '' }
  if ((mode === 'tree' || mode === 'blob') && ref) return { owner, repo, kind: mode, ref, path: rest.join('/') }
  return null
}

export const githubUrl = (g: GithubRef, kind: 'tree' | 'blob', p: string) =>
  `https://github.com/${g.owner}/${g.repo}/${kind}/${g.ref}/${p.split('/').map(encodeURIComponent).join('/')}`

// ---- HTML to readable text ----

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', ndash: '-', mdash: '-',
  hellip: '...', lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', copy: '(c)', times: 'x', rarr: '->', larr: '<-',
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all
    }
    return ENTITIES[e.toLowerCase()] ?? all
  })
}

const strip = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

/** Readable markdown-ish text from an HTML page: headings, paragraphs, lists,
 *  code and same-site links survive; scripts, styles, navigation chrome do not. */
export function htmlToText(html: string, pageUrl: string): { title: string; text: string } {
  const title = strip(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')
  const mainEl = /<main[\s\S]*?<\/main>/i.exec(html)?.[0]
  const main = mainEl ?? /<body[\s\S]*<\/body>/i.exec(html)?.[0] ?? html
  let host = ''
  try {
    host = new URL(pageUrl).host
  } catch {
    // relative links stay unresolved
  }
  let s = main
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|form|select|button)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(nav|footer)\b[\s\S]*?<\/\1>/gi, '')
  // Without a <main>, a page-level <header> is site chrome.
  if (!mainEl) s = s.replace(/<header\b[\s\S]*?<\/header>/gi, '')
  // Code blocks keep their line breaks.
  s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_a, code: string) => {
    const text = decodeEntities(code.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    return `\n\n\`\`\`\n${text.trim()}\n\`\`\`\n\n`
  })
  s = s
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_a, n: string, t: string) => `\n\n${'#'.repeat(Number(n))} ${strip(t)}\n\n`)
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_a, href: string, t: string) => {
      const label = strip(t)
      if (!label) return ''
      try {
        const abs = new URL(decodeEntities(href), pageUrl)
        if (/^https?:$/.test(abs.protocol) && (abs.host === host || abs.host === 'github.com') && !abs.hash)
          return `[${label}](${abs.toString()})`
      } catch {
        // keep the text only
      }
      return label
    })
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|ul|ol|table|tr|blockquote|figure|dl|dt|dd)>/gi, '\n')
    .replace(/<(td|th)\b[^>]*>/gi, ' | ')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_a, t: string) => `\`${strip(t)}\``)
    .replace(/<[^>]+>/g, '')
  s = decodeEntities(s)
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { title, text: s }
}

// ---- GitHub trees ----

export interface TreeEntry {
  path: string
  type: 'blob' | 'tree'
  size?: number
}

const isMd = (p: string) => /\.mdx?$/i.test(p)

/** A directory listing two levels deep under `base`, with file counts, so the
 *  model can see the shape of a large repository and pick what to read.
 *  Markdown is what gets read, so the listing favours it: the directories
 *  richest in markdown get the most room, and a small directory names its
 *  markdown files outright. */
export function renderTree(entries: TreeEntry[], g: GithubRef, maxLines = 320): string {
  const base = g.path.replace(/\/+$/, '')
  const prefix = base ? `${base}/` : ''
  const below = entries.filter((e) => e.path.startsWith(prefix) && e.path !== base)
  const rel = (e: TreeEntry) => e.path.slice(prefix.length)
  const files = new Map<string, { all: number; md: string[] }>()
  for (const e of below) {
    if (e.type !== 'blob') continue
    const segs = rel(e).split('/')
    for (let depth = 1; depth < segs.length && depth <= 2; depth++) {
      const dir = segs.slice(0, depth).join('/')
      const n = files.get(dir) ?? { all: 0, md: [] }
      n.all++
      if (isMd(e.path)) n.md.push(segs.slice(depth).join('/'))
      files.set(dir, n)
    }
  }
  const line = (e: TreeEntry, pad: string) => {
    const r = rel(e)
    if (e.type === 'tree') {
      const n = files.get(r)
      const md = n?.md ?? []
      const named = md.length > 0 && md.length <= 3 && r.includes('/') ? `: ${md.join(', ')}` : ''
      return `${pad}${r.split('/').pop()}/  (${n?.all ?? 0} files${md.length ? `, ${md.length} markdown${named}` : ''})`
    }
    return `${pad}${r.split('/').pop()}${e.size ? `  ${Math.ceil(e.size / 1024)} KB` : ''}`
  }
  const children = new Map<string, TreeEntry[]>()
  const top: TreeEntry[] = []
  for (const e of below) {
    const parts = rel(e).split('/')
    if (parts.length === 1) top.push(e)
    // Second level: markdown files and the sub-directories that hold some; the rest is noise here.
    else if (parts.length === 2 && (isMd(e.path) || (e.type === 'tree' && (files.get(rel(e))?.md.length ?? 0) > 0)))
      children.set(parts[0], [...(children.get(parts[0]) ?? []), e])
  }
  const byName = (a: TreeEntry, b: TreeEntry) => a.path.localeCompare(b.path)
  top.sort(byName)
  const dirs = top.filter((e) => e.type === 'tree')
  const rich = new Set(
    [...dirs].sort((a, b) => (files.get(rel(b))?.md.length ?? 0) - (files.get(rel(a))?.md.length ?? 0)).slice(0, 3).map(rel),
  )
  const room = Math.max(0, maxLines - top.length)
  const big = Math.max(12, Math.floor((room * 0.6) / Math.max(1, rich.size)))
  const small = Math.max(4, Math.floor((room * 0.4) / Math.max(1, dirs.length - rich.size)))
  const lines: string[] = []
  for (const e of top) {
    lines.push(line(e, ''))
    if (e.type !== 'tree') continue
    const cap = rich.has(rel(e)) ? big : small
    const kids = (children.get(rel(e)) ?? []).sort(byName)
    for (const k of kids.slice(0, cap)) lines.push(line(k, '  '))
    if (kids.length > cap) lines.push(`  ... ${kids.length - cap} more in ${rel(e)}/`)
  }
  const root = `https://github.com/${g.owner}/${g.repo}`
  return [
    `Directory listing of ${g.owner}/${g.repo}${base ? `/${base}` : ''} (branch ${g.ref}), two levels deep:`,
    ...lines,
    '',
    `To list a sub-directory, fetch ${root}/tree/${g.ref}/${prefix}<dir>`,
    `To read a file, fetch ${root}/blob/${g.ref}/${prefix}<file>`,
  ].join('\n')
}

/** Markdown from a repository, minus the HTML furniture (badges, pictures,
 *  alignment wrappers) that carries no teaching content. */
export function cleanMarkdown(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<picture\b[\s\S]*?<\/picture>/gi, '')
    .replace(/<(img|source)\b[^>]*>/gi, '')
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<\/?(p|div|span|picture|br|sub|sup|center|details|summary)\b[^>]*>/gi, '')
    .replace(/<a\b[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_a, href: string, t: string) => (t.trim() ? `[${t.trim()}](${href})` : ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ---- the SOURCES section of the prompt ----

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}\n[... clipped: ${s.length - n} more characters]` : s)

/** Render sources within a character budget. Earlier sources (the ones the
 *  current work is about) get their share first. */
export function renderSources(sources: Source[], budget = 150_000): string {
  if (!sources.length) return ''
  const ok = sources.filter((s) => !s.error)
  const each = Math.max(4_000, Math.floor(budget / Math.max(1, ok.length)))
  let used = 0
  const parts: string[] = []
  for (const s of sources) {
    const head = `===== SOURCE: ${s.title || s.url} =====\nURL: ${s.url}\nKind: ${s.kind}${s.license ? `\nLicence: ${s.license}` : ''}`
    if (s.error) {
      parts.push(`${head}\nCould not be read: ${s.error}`)
      continue
    }
    const room = Math.min(each, budget - used)
    if (room < 1_000) {
      parts.push(`${head}\n(not shown for space; fetch it again in a later task if needed)`)
      continue
    }
    const body = clip(s.text, room)
    used += body.length
    parts.push(`${head}\n\n${body}`)
  }
  return parts.join('\n\n')
}
