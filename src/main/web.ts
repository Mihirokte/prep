import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { cleanMarkdown, type GithubRef, githubUrl, htmlToText, parseGithub, renderTree, type Source, type TreeEntry } from '../shared/sources'

// Reads web pages and GitHub repositories for the assistant. The model has no
// tools; it names URLs and this module fetches them. Only public http(s)
// addresses, bounded in time and size, cached for the session.

const TIMEOUT_MS = 20_000
const MAX_BYTES = 4 * 1024 * 1024
const API_MAX_BYTES = 48 * 1024 * 1024
const MAX_REDIRECTS = 5
const TTL_MS = 30 * 60_000
const UA = 'Prep/1.0 (local study app; +https://github.com/Mihirokte/prep)'

function privateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
    )
  }
  const v = ip.toLowerCase()
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7))
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')
}

/** Refuse anything but a public http(s) host: the model chooses these URLs. */
async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('only http and https URLs can be read')
  if (url.username || url.password) throw new Error('URLs with credentials are not read')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))
    throw new Error('local addresses are not read')
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error('private network addresses are not read')
}

interface Fetched {
  url: string
  status: number
  type: string
  text: string
  truncated: boolean
}

const TEXTUAL = /^(text\/|application\/(json|xml|xhtml\+xml|javascript|x-ndjson|ld\+json)|application\/[\w.+-]*\+json)/i

async function get(raw: string, signal: AbortSignal, headers: Record<string, string> = {}, maxBytes = MAX_BYTES): Promise<Fetched> {
  let url = new URL(raw)
  for (let hop = 0; ; hop++) {
    await assertPublic(url)
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      headers: { 'user-agent': UA, accept: 'text/html,text/markdown,text/plain,application/json;q=0.9,*/*;q=0.5', ...headers },
    })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel()
      if (hop >= MAX_REDIRECTS) throw new Error('too many redirects')
      url = new URL(loc, url)
      continue
    }
    const type = res.headers.get('content-type') ?? ''
    if (type && !TEXTUAL.test(type)) {
      await res.body?.cancel()
      throw new Error(`not a text document (${type.split(';')[0]})`)
    }
    const reader = res.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    let truncated = false
    if (reader)
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > maxBytes) {
          truncated = true
          await reader.cancel()
          break
        }
        chunks.push(value)
      }
    const text = Buffer.concat(chunks).toString('utf8')
    if (text.includes('\u0000')) throw new Error('binary content')
    return { url: url.toString(), status: res.status, type, text, truncated }
  }
}

const fail = (f: Fetched) => {
  if (f.status >= 400) throw new Error(`HTTP ${f.status}`)
  return f
}

interface RepoInfo {
  defaultBranch: string
  description: string
  license?: string
}

export class WebReader {
  private cache = new Map<string, { at: number; source: Source }>()
  private repos = new Map<string, Promise<RepoInfo>>()
  private trees = new Map<string, Promise<TreeEntry[]>>()

  /** Read several URLs, four at a time. Never throws: a failed read is a Source with `error`. */
  async readAll(urls: string[], signal: AbortSignal): Promise<Source[]> {
    const out = new Array<Source>(urls.length)
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(4, urls.length) }, async () => {
        while (next < urls.length) {
          const i = next++
          out[i] = await this.read(urls[i], signal)
        }
      }),
    )
    return out
  }

  async read(url: string, signal: AbortSignal): Promise<Source> {
    const hit = this.cache.get(url)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.source
    const g = parseGithub(url)
    let source: Source
    try {
      source = g ? await this.github(url, g, signal) : await this.web(url, signal)
    } catch (e) {
      if (signal.aborted) throw e
      const msg = e instanceof Error ? (e.name === 'TimeoutError' ? 'timed out' : e.message) : String(e)
      source = { url, kind: g ? (g.kind === 'blob' ? 'github-file' : g.kind === 'tree' ? 'github-dir' : 'github-repo') : 'web', title: url, text: '', error: msg }
    }
    if (!source.error) this.cache.set(url, { at: Date.now(), source })
    return source
  }

  private async web(url: string, signal: AbortSignal): Promise<Source> {
    const f = fail(await get(url, signal))
    const note = f.truncated ? '\n\n[The page was larger than 4 MB; the rest was not read.]' : ''
    if (/html/i.test(f.type) || /^\s*<(!doctype|html)/i.test(f.text)) {
      const { title, text } = htmlToText(f.text, f.url)
      const thin = text.length < 400 ? '\n\n[Little text on this page: it may be rendered by JavaScript. Try the site\'s GitHub repository or its /llms.txt.]' : ''
      return { url, kind: 'web', title: title || url, text: text + thin + note }
    }
    return { url, kind: 'web', title: new URL(f.url).pathname.split('/').pop() || url, text: f.text + note }
  }

  private api<T>(path: string, signal: AbortSignal): Promise<T> {
    // A recursive tree of a large repository runs to several MB of JSON.
    return get(`https://api.github.com/${path}`, signal, { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }, API_MAX_BYTES).then((f) => {
      if (f.status === 403 || f.status === 429) throw new Error('GitHub API rate limit reached (60 requests an hour without a token); try again later')
      if (f.truncated) throw new Error('the GitHub API answer was too large to read')
      return JSON.parse(fail(f).text) as T
    })
  }

  private repoInfo(owner: string, repo: string, signal: AbortSignal): Promise<RepoInfo> {
    const key = `${owner}/${repo}`.toLowerCase()
    let p = this.repos.get(key)
    if (!p) {
      p = this.api<{ default_branch: string; description: string | null; license: { spdx_id?: string } | null }>(`repos/${owner}/${repo}`, signal).then((r) => ({
        defaultBranch: r.default_branch,
        description: r.description ?? '',
        license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : undefined,
      }))
      p.catch(() => this.repos.delete(key))
      this.repos.set(key, p)
    }
    return p
  }

  private tree(g: GithubRef, signal: AbortSignal): Promise<TreeEntry[]> {
    const key = `${g.owner}/${g.repo}@${g.ref}`.toLowerCase()
    let p = this.trees.get(key)
    if (!p) {
      p = this.api<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(
        `repos/${g.owner}/${g.repo}/git/trees/${encodeURIComponent(g.ref ?? 'HEAD')}?recursive=1`,
        signal,
      ).then((r) => r.tree.filter((e) => e.type === 'blob' || e.type === 'tree').map((e) => ({ path: e.path, type: e.type as 'blob' | 'tree', size: e.size })))
      p.catch(() => this.trees.delete(key))
      this.trees.set(key, p)
    }
    return p
  }

  private async raw(g: GithubRef, file: string, signal: AbortSignal): Promise<string> {
    const f = fail(await get(`https://raw.githubusercontent.com/${g.owner}/${g.repo}/${g.ref}/${file.split('/').map(encodeURIComponent).join('/')}`, signal))
    const text = /\.mdx?$/i.test(file) ? cleanMarkdown(f.text) : f.text
    return text + (f.truncated ? '\n\n[The file was larger than 4 MB; the rest was not read.]' : '')
  }

  private async github(url: string, g0: GithubRef, signal: AbortSignal): Promise<Source> {
    const info = await this.repoInfo(g0.owner, g0.repo, signal).catch((e: unknown) => {
      // The API is rate-limited; files still come from raw.githubusercontent.com.
      if (g0.kind === 'blob') return null
      throw e
    })
    const g: GithubRef = { ...g0, ref: g0.ref ?? info?.defaultBranch ?? 'HEAD' }
    const license = info?.license
    const name = `${g.owner}/${g.repo}`

    if (g.kind === 'blob') {
      const text = await this.raw(g, g.path, signal)
      return { url, kind: 'github-file', title: `${name}: ${g.path}`, license, text }
    }

    const entries = await this.tree(g, signal)
    const base = g.path.replace(/\/+$/, '')
    if (base && !entries.some((e) => e.path === base && e.type === 'tree')) throw new Error(`no directory "${base}" on ${g.ref}`)
    const readme = entries.find((e) => e.type === 'blob' && e.path.toLowerCase() === `${base ? `${base.toLowerCase()}/` : ''}readme.md`)
    const parts: string[] = []
    if (g.kind === 'repo' && info?.description) parts.push(`Description: ${info.description}`)
    parts.push(renderTree(entries, g))
    if (readme) parts.push(`README (${githubUrl(g, 'blob', readme.path)}):\n\n${await this.raw(g, readme.path, signal)}`)
    return {
      url,
      kind: g.kind === 'repo' ? 'github-repo' : 'github-dir',
      title: base ? `${name}/${base}` : name,
      license,
      text: parts.join('\n\n'),
    }
  }
}
