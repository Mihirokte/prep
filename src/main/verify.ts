import { app, BrowserWindow } from 'electron'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { AgentResult, AskContext, TranscriptEntry } from '../shared/api'
import { lintBlocks, parseCheck } from '../shared/blocks'
import type { Content } from '../shared/types'
import { buildHomeAreas } from '../renderer/areas'
import { type AppHandles, startApp } from './app'

// End-to-end verification of the real app, run with `npm run verify:app`.
// Uses a throwaway data directory, so the user's own store is never touched.
// Self-contained by default: no network and no external tools are needed.
//
//  1. Every route renders (no "Not found", no renderer errors, no CSP blocks).
//     Every route also passes the visual-design audit (AUDIT below) at night,
//     and every screen type passes it by day.
//  2. Screenshots of each screen type for visual review.
//  3. The Pyodide validator, progress persistence across reload, the ⌘K palette,
//     the Assistant panel.
//  4. With PREP_VERIFY_WEBSITE=<url>: every route's visible text is compared to
//     the web portal this app was extracted from, route by route.
//  5. With PREP_VERIFY_AGENT=1: real natural-language CRUD through agy — one
//     command through the Assistant panel UI, the rest through the same main-
//     process API the panel calls — then undo everything and confirm the store
//     is byte-for-byte the seed again. Requires the agy CLI. One scenario reads
//     a public GitHub page, so it also needs the network.
//     PREP_VERIFY_SCENARIOS=<regex> runs only the matching scenarios.

const OUT = path.resolve(process.env.PREP_VERIFY_OUT ?? 'verify-report')
const WEBSITE = process.env.PREP_VERIFY_WEBSITE || null
const AGENT = process.env.PREP_VERIFY_AGENT === '1'
/** PREP_VERIFY_SCENARIOS=<regex>: run only the matching assistant scenarios, and skip the page checks. */
const ONLY = process.env.PREP_VERIFY_SCENARIOS ? new RegExp(process.env.PREP_VERIFY_SCENARIOS, 'i') : null
const userData = mkdtempSync(path.join(os.tmpdir(), 'prep-verify-'))

interface CheckResult {
  name: string
  ok: boolean
  detail: string
}
const results: CheckResult[] = []
const extra: Record<string, unknown> = {}
function check(name: string, ok: boolean, detail = ''): boolean {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  return ok
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor<T>(get: () => Promise<T>, ok: (v: T) => boolean, ms: number, what: string): Promise<T> {
  const start = Date.now()
  for (;;) {
    const v = await get()
    if (ok(v)) return v
    if (Date.now() - start > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`)
    await sleep(120)
  }
}

/** Visible page text with the chrome that differs by design (sidebar, toolbar,
 *  assistant panel, drag strip) removed — identical code on both sides. The
 *  validator button's boot label depends on when each side's Python runtime
 *  finished loading, so it is normalized; the validator is checked separately. */
const EXTRACT = `(() => {
  const root = document.querySelector('#root')
  if (!root) return null
  const clone = root.cloneNode(true)
  clone.querySelectorAll('header, #assistant, .app-drag, [data-chrome]').forEach((n) => n.remove())
  return {
    text: (clone.textContent || '').replace(/Loading Python…|Python failed/g, 'Check syntax').replace(/\\s+/g, ' ').trim(),
    notFound: [...document.querySelectorAll('h1')].some((h) => h.textContent === 'Not found'),
    links: clone.querySelectorAll('a').length,
    buttons: clone.querySelectorAll('button').length,
  }
})()`

interface PageState {
  text: string
  notFound: boolean
  links: number
  buttons: number
}

/** The house type scale (design system, "Scale"): L 40, M 24, S 16 body and
 *  12 labels (one visual step: both have a 9px cap height). */
const TYPE_SCALE = [12, 16, 24, 40]

/** Visual-design audit of the rendered page, run inside the renderer. Encodes
 *  the NN/g principles the design system adopts as hard rules:
 *   scale     every text size is on the scale; at most one 40px (L) title
 *   contrast  every drawn text pair meets WCAG AA against its resolved
 *             background (4.5:1, 3:1 at 24px+), and no text is faded with opacity
 *   shape     no rounded corners, blurred shadows, blur filters or gradients
 *   balance   the page's content is centered in its pane
 *  Hover states are not covered (they need pointer input). */
const AUDIT = `(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const cx = cv.getContext('2d', { willReadFrequently: true })
  const memo = new Map()
  const rgba = (c) => {
    if (!c || c === 'none' || c === 'transparent') return [0, 0, 0, 0]
    if (memo.has(c)) return memo.get(c)
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    const v = [d[0], d[1], d[2], d[3] / 255]; memo.set(c, v); return v
  }
  const mix = (t, b) => [0, 1, 2].map((i) => t[i] * t[3] + b[i] * (1 - t[3])).concat(1)
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const style = new Map()
  const cs = (el) => { let s = style.get(el); if (!s) { s = getComputedStyle(el); style.set(el, s) } return s }
  const page = rgba(cs(document.body).backgroundColor)
  const bgMemo = new Map(), opMemo = new Map()
  const bgOf = (el) => {
    if (!el || el.nodeType !== 1) return page
    if (bgMemo.has(el)) return bgMemo.get(el)
    const own = rgba(cs(el).backgroundColor)
    const v = own[3] >= 0.999 ? own : own[3] > 0 ? mix(own, bgOf(el.parentElement)) : bgOf(el.parentElement)
    bgMemo.set(el, v); return v
  }
  const opOf = (el) => {
    if (!el || el.nodeType !== 1) return 1
    if (opMemo.has(el)) return opMemo.get(el)
    const v = parseFloat(cs(el).opacity) * opOf(el.parentElement)
    opMemo.set(el, v); return v
  }
  // SVG text sits on the shape drawn before it in the same group, if any.
  const svgBg = (el) => {
    const base = bgOf(el.closest('svg')?.parentElement)
    let box; try { box = el.getBBox() } catch { return base }
    const cxp = box.x + box.width / 2, cyp = box.y + box.height / 2
    for (let n = el.previousElementSibling; n; n = n.previousElementSibling) {
      if (n.tagName !== 'rect') continue
      let r; try { r = n.getBBox() } catch { continue }
      if (cxp >= r.x && cxp <= r.x + r.width && cyp >= r.y && cyp <= r.y + r.height) {
        const f = rgba(cs(n).fill)
        if (f[3] > 0) return f[3] >= 0.999 ? f : mix(f, base)
      }
    }
    return base
  }
  const where = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '')
  const sizes = new Set(), off = [], low = [], faded = [], shape = []
  let large = 0
  const pane = document.querySelector('[data-scroll]')
  const pr = pane ? pane.getBoundingClientRect() : null
  let minL = Infinity, maxR = -Infinity
  for (const el of document.querySelectorAll('body *')) {
    const s = cs(el)
    if (s.display === 'none') continue
    // shape: radius, soft shadows, blur, gradients
    if (!el.closest('.cm-editor')) {
      if ([s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius].some((r) => parseFloat(r) > 0)) shape.push('radius ' + where(el))
      for (const sh of s.boxShadow === 'none' ? [] : s.boxShadow.split(/,(?![^(]*\\))/)) {
        const px = (sh.replace(/rgba?\\([^)]*\\)|color\\([^)]*\\)/g, '').match(/-?[\\d.]+px/g) || []).map(parseFloat)
        if ((px[2] || 0) > 0) shape.push('soft shadow ' + where(el))
      }
      if (/blur\\(/.test(s.filter) || (s.backdropFilter && s.backdropFilter !== 'none')) shape.push('blur ' + where(el))
      const ds = /drop-shadow\\(([^)]*\\)[^)]*|[^)]*)\\)/.exec(s.filter)
      if (ds) { const px = (ds[1].replace(/rgba?\\([^)]*\\)/g, '').match(/-?[\\d.]+px/g) || []).map(parseFloat); if ((px[2] || 0) > 0) shape.push('soft drop-shadow ' + where(el)) }
      if (/gradient\\(/.test(s.backgroundImage)) shape.push('gradient ' + where(el))
    }
    if (/^(STYLE|SCRIPT|TITLE|OPTION|TEXTAREA|NOSCRIPT)$/.test(el.tagName)) continue
    if (![...el.childNodes].some((n) => n.nodeType === 3 && /\\S/.test(n.nodeValue))) continue
    if (s.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    const op = opOf(el)
    if (op <= 0.001) continue
    const size = Math.round(parseFloat(s.fontSize))
    const text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40)
    sizes.add(size)
    if (!${JSON.stringify(TYPE_SCALE)}.includes(size)) off.push(size + 'px ' + where(el) + ' «' + text + '»')
    if (size === 40 && Math.round(parseFloat(cs(el.parentElement).fontSize)) !== 40) large++
    if (pane && pane.contains(el)) {
      // Only what is visible counts: clip to every scroller between the text and the pane.
      let L = r.left, R = r.right
      for (let n = el.parentElement; n && n !== pane; n = n.parentElement) {
        if (/auto|scroll|hidden|clip/.test(cs(n).overflowX)) { const b = n.getBoundingClientRect(); L = Math.max(L, b.left); R = Math.min(R, b.right) }
      }
      if (R > L) { minL = Math.min(minL, L); maxR = Math.max(maxR, R) }
    }
    if (el.closest(':disabled, [aria-disabled="true"], [data-disabled]')) continue
    if (op < 0.999) faded.push(Math.round(op * 100) + '% ' + where(el) + ' «' + text + '»')
    const svg = el instanceof SVGElement
    const fg = rgba(svg ? s.fill : s.color)
    if (fg[3] === 0) continue
    const bg = svg ? svgBg(el) : bgOf(el)
    const c = ratio(mix([fg[0], fg[1], fg[2], fg[3] * op], bg), bg)
    const need = size >= 24 ? 3 : 4.5
    if (c < need) low.push(c.toFixed(2) + ':1 (needs ' + need + ') ' + size + 'px ' + where(el) + ' «' + text + '»')
  }
  let balance = null
  if (pr && Number.isFinite(minL)) {
    const left = Math.round(minL - pr.left), right = Math.round(pr.left + pane.clientWidth - maxR)
    balance = { left, right, ok: Math.abs(left - right) <= Math.max(64, pane.clientWidth * 0.12) }
  }
  return { sizes: [...sizes].sort((a, b) => a - b), large, off: off.slice(0, 5), low: low.slice(0, 5), faded: faded.slice(0, 5), shape: [...new Set(shape)].slice(0, 5), balance }
})()`

interface Audit {
  sizes: number[]
  large: number
  off: string[]
  low: string[]
  faded: string[]
  shape: string[]
  balance: { left: number; right: number; ok: boolean } | null
}

type Principle = 'scale' | 'contrast' | 'shape' | 'balance'

/** Collects audit failures per principle across routes, then reports one check each. */
class DesignAudit {
  private fails: Record<Principle, string[]> = { scale: [], contrast: [], shape: [], balance: [] }
  private routes = 0
  private theme: string
  constructor(theme: string) {
    this.theme = theme
  }
  async run(win: BrowserWindow, route: string) {
    const a = await js<Audit>(win, AUDIT)
    this.routes++
    if (a.off.length || a.large > 1) this.fails.scale.push(`${route}: ${a.large > 1 ? `${a.large} L titles; ` : ''}${a.off.join('; ')}`)
    if (a.low.length || a.faded.length) this.fails.contrast.push(`${route}: ${[...a.low, ...a.faded.map((f) => `faded ${f}`)].join('; ')}`)
    if (a.shape.length) this.fails.shape.push(`${route}: ${a.shape.join('; ')}`)
    if (a.balance && !a.balance.ok) this.fails.balance.push(`${route}: left ${a.balance.left}px vs right ${a.balance.right}px`)
  }
  report() {
    const n = this.routes
    const line = (k: Principle, what: string) => {
      const f = this.fails[k]
      check(`design (${this.theme}) — ${what}`, f.length === 0, f.length ? `${f.length}/${n} routes; ${f.slice(0, 3).join(' | ')}` : `${n} routes`)
    }
    line('scale', `type on the 12/16/24/40 scale, at most one 40px title`)
    line('contrast', 'every text at WCAG AA against its background, no faded text')
    line('shape', 'no radius, soft shadow, blur or gradient')
    line('balance', 'page content centered in its pane')
    extra[`design_${this.theme}`] = this.fails
  }
}

/** Plant one violation of each kind on a live page and require the audit to
 *  report every one, so a clean audit result means something. */
async function auditSelfTest(win: BrowserWindow) {
  await visit(win, '#/')
  await js(
    win,
    `(() => { const host = document.querySelector('[data-scroll] > div'); const d = document.createElement('div'); d.id = 'audit-probe';
      d.innerHTML = '<p style="color:#3a3a40">probe low</p><p style="opacity:.4">probe faded</p><p style="font-size:28px">probe size</p><p style="border-radius:8px;box-shadow:0 4px 12px #000">probe shape</p>';
      host.prepend(d) })()`,
  )
  const a = await js<Audit>(win, AUDIT)
  await js(win, `document.getElementById('audit-probe')?.remove()`)
  const caught = {
    contrast: a.low.some((x) => x.includes('probe low')),
    faded: a.faded.some((x) => x.includes('probe faded')),
    scale: a.off.some((x) => x.includes('probe size')),
    shape: a.shape.some((x) => x.startsWith('radius')) && a.shape.some((x) => x.startsWith('soft shadow')),
  }
  check('design audit catches planted violations (contrast, faded text, off-scale size, radius, soft shadow)', Object.values(caught).every(Boolean), JSON.stringify(caught))
}

function routesOf(c: Content): string[] {
  return [
    '#/',
    '#/dsa',
    '#/review',
    '#/patterns',
    '#/companies',
    ...c.courses.map((co) => `#/study/${co.key}`),
    ...c.courses.flatMap((co) => co.chapters.flatMap((ch) => ch.lessons.map((l) => `#/study/${co.key}/${l.id}`))),
    ...c.patterns.map((p) => `#/pattern/${p.key}`),
    ...c.companies.map((co) => `#/company/${co.key}`),
    ...c.areas.flatMap((a) => a.drills.map((d) => `#/drill/${d.id}`)),
  ]
}

const lastSeen = new Map<BrowserWindow, { route: string; text: string }>()

async function visit(win: BrowserWindow, route: string): Promise<PageState> {
  const prev = lastSeen.get(win)
  await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(route)}`)
  const read = () => win.webContents.executeJavaScript(EXTRACT) as Promise<PageState | null>
  // A busy renderer can paint the new route late; wait until the text is no
  // longer the previous route's (unless revisiting the same route), then until
  // two reads agree.
  const mustChange = prev !== undefined && prev.route !== route
  let state = await waitFor(
    read,
    (v) => v !== null && v.text.length > 0 && (!mustChange || v.text !== prev.text),
    8000,
    `render of ${route}`,
  ).catch(async () => read())
  for (let i = 0; i < 25; i++) {
    await sleep(40)
    const again = await read()
    if (again && state && again.text === state.text) break
    state = again
  }
  if (!state) throw new Error(`${route} rendered nothing`)
  lastSeen.set(win, { route, text: state.text })
  return state
}

/** Page text only — the Assistant panel (which echoes plans) is excluded. */
const pageText = async (win: BrowserWindow) => ((await js<PageState | null>(win, EXTRACT))?.text ?? '')

async function shot(win: BrowserWindow, name: string) {
  await sleep(350)
  const img = await win.webContents.capturePage()
  writeFileSync(path.join(OUT, `${name}.png`), img.toPNG())
}

const js = <T = unknown>(win: BrowserWindow, code: string) => win.webContents.executeJavaScript(code) as Promise<T>

/** Click the first element matching `selector` whose text includes `text`. */
const click = (win: BrowserWindow, selector: string, text = '') =>
  js<boolean>(
    win,
    `(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => (e.textContent || '').includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true })()`,
  )

/** Radix Tabs activate on mousedown, not click. */
const pressTab = (win: BrowserWindow, text: string) =>
  js<boolean>(
    win,
    `(() => { const el = [...document.querySelectorAll('[role=tab]')].find((e) => e.textContent === ${JSON.stringify(text)}); if (!el) return false; el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); return true })()`,
  )

function firstDiff(a: string, b: string): string {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return `at char ${i}: app «${a.slice(Math.max(0, i - 40), i + 60)}» vs web «${b.slice(Math.max(0, i - 40), i + 60)}»`
}

// ---------------------------------------------------------------------------

async function sweep(win: BrowserWindow, routes: string[]) {
  const app: Record<string, PageState> = {}
  const audit = new DesignAudit('night')
  for (const r of routes) {
    app[r] = await visit(win, r)
    await audit.run(win, r)
  }
  const notFound = routes.filter((r) => app[r].notFound)
  check(`every route renders (${routes.length} routes)`, notFound.length === 0, notFound.slice(0, 5).join(', '))
  audit.report()

  if (!WEBSITE) {
    console.log('NOTE  PREP_VERIFY_WEBSITE not set — skipping the route-by-route comparison with the web portal')
    return
  }
  // The same routes on the web portal this app was extracted from.
  const web = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { partition: 'verify-website', sandbox: true, contextIsolation: true, backgroundThrottling: false },
  })
  try {
    await web.loadURL(WEBSITE)
    await waitFor(() => js<boolean>(web, `!!document.querySelector('header')`), Boolean, 30000, 'the website to load')
    const mismatches: string[] = []
    for (const r of routes) {
      const w = await visit(web, r)
      if (w.text !== app[r].text) mismatches.push(`${r} ${firstDiff(app[r].text, w.text)}`)
      else if (w.links !== app[r].links || w.buttons !== app[r].buttons)
        mismatches.push(`${r}: links ${app[r].links}/${w.links}, buttons ${app[r].buttons}/${w.buttons}`)
    }
    extra.parityMismatches = mismatches
    check(
      `text + controls identical to ${WEBSITE} on every route`,
      mismatches.length === 0,
      mismatches.length ? `${mismatches.length} differ; first: ${mismatches[0]}` : `${routes.length}/${routes.length} routes`,
    )

    // Side-by-side reference shots of the live site, for visual comparison.
    web.showInactive()
    for (const [name, route] of [
      ['web-01-home', '#/'],
      ['web-06-company', '#/company/goodscore'],
      ['web-09-drill-editor', '#/drill/dsa-001'],
    ] as const) {
      await visit(web, route)
      await js(web, 'window.scrollTo(0, 0)')
      await shot(web, name)
    }
    // Informational: does the live site's Python check ever become ready?
    const label = await waitFor(
      () => js<string>(web, `[...document.querySelectorAll('button')].map((b) => b.textContent).find((t) => /Check syntax|Loading Python|Python failed/.test(t || '')) || ''`),
      (t) => t === 'Check syntax',
      30000,
      'the website validator',
    ).catch(() => js<string>(web, `[...document.querySelectorAll('button')].map((b) => b.textContent).find((t) => /Check syntax|Loading Python|Python failed/.test(t || '')) || ''`))
    extra.websiteValidator = label
    console.log(`NOTE  live site's Python check after 30 s on #/drill/dsa-001: "${label}"`)
  } finally {
    web.destroy()
  }
}

async function screens(win: BrowserWindow, c: Content) {
  const lessons = c.courses.flatMap((co) => co.chapters.flatMap((ch) => ch.lessons.map((l) => ({ co, l }))))
  const lessonWithDiagram = lessons.find(({ l }) => l.body.includes('```mermaid'))
  const lessonWithFlow = lessons.find(({ l }) => l.body.includes('```flow'))
  const discussion = c.areas.find((a) => a.key !== 'dsa')?.drills.find((d) => d.solution)
  const plan: [string, string][] = [
    ['01-home', '#/'],
    ['02-dsa', '#/dsa'],
    ['03-patterns', '#/patterns'],
    ['04-pattern', '#/pattern/sliding-window'],
    ['05-companies', '#/companies'],
    ['06-company', '#/company/goodscore'],
    ['07-course', '#/study/sd'],
    ['08-lesson', lessonWithDiagram ? `#/study/${lessonWithDiagram.co.key}/${lessonWithDiagram.l.id}` : '#/study/sd'],
    ['09-drill-editor', '#/drill/dsa-001'],
    ['10-drill-discussion', discussion ? `#/drill/${discussion.id}` : '#/dsa'],
    ['16-review', '#/review'],
    ['17-ai-course', '#/study/ai'],
    ['18-lesson-flow', lessonWithFlow ? `#/study/${lessonWithFlow.co.key}/${lessonWithFlow.l.id}` : '#/study/ai'],
    ['19-pattern-viz', '#/pattern/two-pointers'],
  ]
  for (const [name, route] of plan) {
    await visit(win, route)
    await js(win, `document.querySelector('[data-scroll]')?.scrollTo(0, 0)`)
    // let the diagrams reach a settled frame before the shot
    await sleep(name.startsWith('18') || name.startsWith('19') ? 2500 : 0)
    await shot(win, name)
  }
  // Lesson scrolled to its first diagram and to its self-check deck
  if (lessonWithFlow) {
    await visit(win, `#/study/${lessonWithFlow.co.key}/${lessonWithFlow.l.id}`)
    await js(win, `document.querySelector('[data-scroll] .diagram')?.scrollIntoView({ block: 'center' })`)
    await sleep(2600)
    await shot(win, '20-lesson-diagram')
    await js(win, `document.querySelector('[data-scroll] [aria-label="Self-check"]')?.scrollIntoView({ block: 'center' })`)
    await sleep(900)
    await shot(win, '21-lesson-recall')
    // The shell (toolbar, sidebar) must stay put: only the content pane scrolls.
    const shifted = await js<string[]>(
      win,
      `[document.scrollingElement, ...document.querySelectorAll('body, #root, #root *')].filter((el) => el && !el.closest('[data-scroll]') && (el.scrollTop || el.scrollLeft)).map((el) => (el.id ? '#' + el.id : el.tagName.toLowerCase()) + ' ' + el.scrollTop)`,
    )
    check('scrolling content into view never moves the app shell', shifted.length === 0, shifted.join(', '))
  }
  // Day theme: the two reference shots, then the same audit over every screen type
  await js(win, `localStorage.setItem('prep.theme', 'day'); document.documentElement.classList.remove('dark')`)
  await visit(win, '#/dsa')
  await shot(win, '22-dsa-day')
  await visit(win, '#/drill/dsa-001')
  await shot(win, '23-drill-day')
  const day = new DesignAudit('day')
  for (const [, route] of plan) {
    await visit(win, route)
    await day.run(win, route)
  }
  day.report()
  await js(win, `localStorage.setItem('prep.theme', 'night'); document.documentElement.classList.add('dark')`)
  // An expanded answer on the company page
  await visit(win, '#/company/goodscore')
  await click(win, 'button', 'Answer')
  await shot(win, '11-company-answer')
}

/** PREP_VERIFY_SHOTS="#/route@selector@nth@action+action;..." takes extra screenshots:
 *  the route, optional actions (tab:<name>, click:<button text>), then the nth
 *  element matching selector scrolled into view. */
async function extraShots(win: BrowserWindow) {
  const spec = process.env.PREP_VERIFY_SHOTS
  if (!spec) return
  let n = 0
  for (const entry of spec.split(';').filter(Boolean)) {
    const [route, selector, nth = '0', actions = ''] = entry.split('@')
    await visit(win, route)
    for (const a of actions.split('+').filter(Boolean)) {
      if (a.startsWith('tab:')) await pressTab(win, a.slice(4))
      else if (a.startsWith('click:')) await click(win, 'button', a.slice(6))
      await sleep(300)
    }
    const sleepMs = selector ? 3200 : 1200
    if (selector)
      await js(
        win,
        `(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${Number(nth)}]; const sc = document.querySelector('[data-scroll]'); if (el && sc) sc.scrollTo({ top: sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 120 }) })()`,
      )
    await sleep(sleepMs)
    await shot(win, `x-${String(++n).padStart(2, '0')}`)
  }
}

async function features(h: AppHandles, win: BrowserWindow) {
  // Validator: Pyodide boots from the bundled files and checks the starter code.
  await visit(win, '#/drill/dsa-001')
  await waitFor(
    () => js<boolean>(win, `[...document.querySelectorAll('button')].some((b) => b.textContent === 'Check syntax' && !b.disabled)`),
    Boolean,
    120000,
    'Pyodide to load',
  )
  await click(win, 'button', 'Check syntax')
  const verdict = await waitFor(
    () => js<string>(win, `(() => { const el = [...document.querySelectorAll('p, div')].find((d) => /Looks valid|Error|could not load/.test(d.textContent || '') && d.children.length === 0); return el ? el.textContent : '' })()`),
    (v) => v.length > 0,
    30000,
    'the validator verdict',
  )
  check('Python validator runs offline from bundled Pyodide', verdict.startsWith('Looks valid'), verdict)

  // Progress: status persists to disk and survives a reload.
  const clicked = await click(win, '[role=group][aria-label*="status"] button', 'solved')
  await sleep(700)
  const raw = JSON.parse(readFileSync(path.join(userData, 'progress.json'), 'utf8')) as Record<string, string>
  const persisted = JSON.parse(JSON.parse(raw['persist:prep-v2']).problems)['dsa-001']?.status
  check('problem status is written to progress.json', clicked && persisted === 'solved', `stored: ${persisted}`)
  win.webContents.reload()
  await waitFor(() => js<boolean>(win, `!!document.querySelector('header')`), Boolean, 15000, 'reload')
  await visit(win, '#/drill/dsa-001')
  const still = await js<boolean>(win, `[...document.querySelectorAll('[role=group][aria-label*="status"] button')].some((b) => b.textContent === 'solved' && b.getAttribute('aria-pressed') === 'true')`)
  check('status survives a reload', still)
  const home = await visit(win, '#/')
  check('home index counts the solved problem', home.text.includes('1/148'))

  // ⌘K palette opens, filters, and navigates.
  await js(win, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
  const items = await waitFor(() => js<number>(win, `document.querySelectorAll('[cmdk-item]').length`), (n) => n > 0, 5000, 'palette')
  await shot(win, '12-palette')
  await js(
    win,
    `(() => { const i = document.querySelector('[cmdk-input]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'sliding window'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`,
  )
  await sleep(250)
  await js(win, `document.querySelector('[cmdk-input]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`)
  const landed = await waitFor(() => js<string>(win, 'location.hash'), (x) => x !== '#/', 5000, 'palette navigation')
  const c = h.store.get()
  const expected =
    buildHomeAreas(c.courses).length + // home index entries
    c.courses.reduce((n, co) => n + co.chapters.reduce((m, ch) => m + ch.lessons.length, 0), 0) +
    c.areas.reduce((n, a) => n + a.drills.length, 0) +
    c.companies.length +
    c.patterns.length
  check(
    '⌘K palette lists every record and navigates',
    items === expected && landed.startsWith('#/'),
    `${items}/${expected} entries; "sliding window" + Enter landed on ${landed}`,
  )

  // Assistant panel toggles with ⌘J.
  await visit(win, '#/company/goodscore')
  await js(win, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true, bubbles: true }))`)
  const open = await waitFor(() => js<boolean>(win, `getComputedStyle(document.getElementById('assistant')).display !== 'none'`), Boolean, 3000, 'assistant panel')
  const status = await h.agent.status()
  if (AGENT) check('⌘J opens the Assistant panel, agy located', open && status.agyPath !== null, `agy: ${status.agyPath}`)
  else {
    check('⌘J opens the Assistant panel', open)
    console.log(`NOTE  agy CLI: ${status.agyPath ?? 'not found (the assistant needs it; everything else works without it)'}`)
  }
  await shot(win, '13-assistant')

  // Ask about a passage: selecting text on a lesson shows "Ask", which opens a
  // small panel scoped to that passage; Escape closes it.
  const lessonWithCheck = c.courses.flatMap((co) => co.chapters.flatMap((ch) => ch.lessons.map((l) => ({ co: co.key, l })))).find((x) => /```check\n/.test(x.l.body))
  const askLesson = lessonWithCheck ?? { co: c.courses[0].key, l: c.courses[0].chapters[0].lessons[0] }
  await visit(win, `#/study/${askLesson.co}/${askLesson.l.id}`)
  const fit = await js<{ open: boolean; over: number }>(
    win,
    `(() => { const s = document.querySelector('[data-scroll]'); return { open: !document.getElementById('assistant')?.hidden, over: s ? s.scrollWidth - s.clientWidth : -1 } })()`,
  )
  check('with the assistant open, a lesson fits its pane (no sideways scroll)', fit.open && fit.over >= 0 && fit.over <= 1, `assistant open: ${fit.open}, overflow ${fit.over}px`)
  const picked = await js<string>(
    win,
    `(() => { const p = document.querySelector('article .md p'); if (!p) return ''; const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return p.textContent.slice(0, 60) })()`,
  )
  const askShown = await waitFor(() => js<boolean>(win, `[...document.querySelectorAll('button[data-ask-panel]')].some((b) => b.textContent === 'Ask')`), Boolean, 3000, 'the Ask button').catch(() => false)
  if (askShown) await click(win, 'button[data-ask-panel]', 'Ask')
  const panel = await waitFor(
    () => js<boolean>(win, `!!document.querySelector('[role=dialog][aria-label="Ask about this passage"]') && document.activeElement?.id === 'ask-input'`),
    Boolean,
    3000,
    'the ask panel',
  ).catch(() => false)
  const quoted = await js<boolean>(win, `(document.querySelector('[role=dialog][aria-label="Ask about this passage"] blockquote')?.textContent || '').startsWith(${JSON.stringify(picked.slice(0, 20))})`)
  await shot(win, '16-ask-panel')
  await js(win, `document.getElementById('ask-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(150)
  const closed = await js<boolean>(win, `!document.querySelector('[data-ask-panel]')`)
  check('selecting a passage shows Ask; it opens a panel quoting the passage; Escape closes it', askShown && panel && quoted && closed, `selected "${picked.slice(0, 40)}"`)

  // Quick check block: picking an option shows the verdict and the reason.
  if (lessonWithCheck) {
    await js(win, `document.querySelector('[aria-label="Quick check"]')?.scrollIntoView()`)
    await sleep(300)
    const verdict = await js<string>(
      win,
      `(() => { const s = document.querySelector('[aria-label="Quick check"]'); const b = s?.querySelector('li button'); b?.click(); return new Promise((res) => setTimeout(() => res(s?.textContent || ''), 200)) })()`,
    )
    await sleep(600)
    await shot(win, '17-quick-check')
    check('check block: an answer shows Correct or Not quite with the reason', /Correct|Not quite/.test(verdict) && /Try again/.test(verdict), lessonWithCheck.l.id)
  } else check('check block: a lesson in the seed uses it', false, 'no lesson has a check block')
}

// ---- assistant: real natural-language CRUD through agy ----

interface Scenario {
  name: string
  command: string
  expect: 'proposal' | 'answer' | 'any'
  /** Sent as if the reader had selected a passage on a page. */
  context?: AskContext
  check: (c: Content, reply: string) => boolean
  /** Extra checks on the result itself (sources read). */
  result?: (r: AgentResult) => boolean
  /** Runs only when PREP_VERIFY_SCENARIOS selects it. */
  optional?: boolean
}

function scenarios(seed: Content): Scenario[] {
  const twoSum = seed.areas.flatMap((a) => a.drills).find((d) => d.title === 'Two Sum')!.id
  const hashing = seed.patterns.find((p) => p.key === 'hashing')!
  const pat = (c: Content, key: string) => c.patterns.find((p) => p.key === key)
  const acme = (c: Content) => c.companies.find((x) => /acme/i.test(x.name))
  const acmeQ = (c: Content) => acme(c)?.questions.flatMap((g) => g.questions).find((q) => /substring/i.test(q.q))
  const lessonOf = (c: Content, id: string) => c.courses.flatMap((co) => co.chapters.flatMap((ch) => ch.lessons)).find((l) => l.id === id)
  // A passage as the page shows it: the first plain paragraph, markdown marks removed.
  const caching = lessonOf(seed, 'ai-prompt-caching')!
  const para = caching.body.split('\n\n').find((p) => p.length > 120 && !/^[#`>|\-\d]/.test(p.trim()))!
  const quote = para.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '')
  const onLesson = (lessonId: string, q: string): AskContext => ({ kind: 'lesson', courseKey: 'ai', lessonId, quote: q })
  const list: Scenario[] = [
    {
      name: 'create: company + round + question + question→pattern mapping + note',
      command:
        'Add a company called "Acme Payments", a Pune-based payments startup (Series B). Give it a round named "DSA" with one question: "Find the length of the longest substring without repeating characters." Include a short answer sketch and two variants, and map the question to the sliding window pattern. Also add a special note that the DSA round is 45 minutes on a shared editor.',
      expect: 'proposal',
      check: (c) => {
        const q = acmeQ(c)
        return Boolean(q && q.patterns?.includes('sliding-window') && (q.related?.length ?? 0) >= 2 && acme(c)!.specialNotes.some((n) => /45/.test(n)))
      },
    },
    {
      name: 'read: answers from the data without changing it',
      command: 'Which patterns is Two Sum mapped to, and how many problems does the Hashing pattern cover?',
      expect: 'answer',
      // Every page the answer links to must be a real route, not "Not found".
      check: (c, reply) => {
        const valid = new Set(routesOf(c))
        const links = [...reply.matchAll(/\]\((#\/[^)\s]*)\)/g)].map((m) => m[1])
        return /hash/i.test(reply) && reply.includes(String(hashing.problemIds.length)) && links.every((l) => valid.has(l))
      },
    },
    {
      name: 'update: company field + add a question variant',
      command:
        'For Acme Payments, set coverage to moderate, and add the variant "Allow at most two distinct characters in the substring." to its longest-substring question.',
      expect: 'proposal',
      check: (c) => acme(c)?.coverage === 'moderate' && Boolean(acmeQ(c)?.related?.some((r) => /two distinct/i.test(r))),
    },
    {
      name: 'mappings: pattern→problem link + company round pattern',
      command:
        "Map Two Sum to the two pointers pattern. Also add sliding window to Acme Payments' DSA round patterns, as reported, since its longest-substring question is exactly that pattern.",
      expect: 'proposal',
      check: (c) =>
        Boolean(pat(c, 'two-pointers')?.problemIds.includes(twoSum)) &&
        Boolean(acme(c)?.dsaPatterns?.some((rp) => rp.key === 'sliding-window' && rp.basis === 'reported')),
    },
    {
      name: 'unlink: remove a pattern→problem mapping',
      command: 'Remove Two Sum from the two pointers pattern.',
      expect: 'proposal',
      check: (c) => !pat(c, 'two-pointers')?.problemIds.includes(twoSum),
    },
    {
      name: 'update pattern: add a recognition cue',
      command: 'Add a recognition cue to the Sliding Window pattern: "The input is a stream and you must answer over the last K elements."',
      expect: 'proposal',
      check: (c) => Boolean(pat(c, 'sliding-window')?.cues.some((x) => /stream/i.test(x))),
    },
    {
      name: 'create pattern',
      command:
        'Create a new pattern "Line Sweep" in the "Intervals & greedy" family (not one of the core 16), covering Meeting Rooms II if that problem exists. Write its essence, cues, mechanism, a Python template, complexity and pitfalls.',
      expect: 'proposal',
      check: (c) => c.patterns.some((p) => p.name === 'Line Sweep' && p.family === 'Intervals & greedy'),
    },
    {
      name: 'delete pattern',
      command: 'Delete the Line Sweep pattern.',
      expect: 'proposal',
      check: (c) => !c.patterns.some((p) => p.name === 'Line Sweep'),
    },
    {
      name: 'delete: company with its rounds and questions (cascade)',
      command: 'Delete the company Acme Payments entirely.',
      expect: 'proposal',
      check: (c) => !acme(c),
    },
    {
      // The assistant has no tools: the app reads the URL and puts the page in the prompt.
      name: 'read: answers from a web source the app fetches',
      command:
        'Read https://github.com/rohitg00/ai-engineering-from-scratch/blob/main/phases/14-agent-engineering/01-the-agent-loop/docs/en.md and list the five ingredients of an agent loop it names.',
      expect: 'answer',
      check: (_c, reply) => /tool registry/i.test(reply) && /stop condition/i.test(reply) && /turn budget/i.test(reply),
      result: (r) => 'sources' in r && Boolean(r.sources?.some((s) => s.ok && /01-the-agent-loop\/docs\/en\.md/.test(s.url))),
    },
    {
      // Large work: more lessons than one plan holds, so the plan comes back as
      // slices that run in parallel and are joined. Slow (several minutes), so
      // it runs only when PREP_VERIFY_SCENARIOS selects it.
      name: 'large: six lessons from six web sources, planned as parallel slices',
      optional: true,
      command: [
        'Create a new chapter "Agent patterns in depth" in the AI Engineering course with six new lessons, one written from each source below, in this app\'s lesson format with a diagram and a recall deck each:',
        ...['02-rewoo-plan-and-execute', '03-reflexion-verbal-rl', '04-tree-of-thoughts-lats', '05-self-refine-and-critic', '06-tool-use-and-function-calling', '07-memory-virtual-context-memgpt'].map(
          (l) => `https://github.com/rohitg00/ai-engineering-from-scratch/blob/main/phases/14-agent-engineering/${l}/docs/en.md`,
        ),
      ].join('\n'),
      expect: 'proposal',
      check: (c) => {
        const ai = c.courses.find((co) => co.key === 'ai')
        const ch = ai?.chapters.find((x) => /agent patterns in depth/i.test(x.title))
        extra.largeChapter = ch?.lessons.map((l) => `${l.id} | ${l.title} | ${l.minutes} min`)
        return Boolean(ch && ch.lessons.length >= 5 && ch.lessons.every((l) => /```recall/.test(l.body) && lintBlocks(l.body, l.id).errors.length === 0))
      },
    },
    {
      name: 'ask: a question about a selected passage gets a teaching answer and no change',
      context: onLesson('ai-prompt-caching', quote),
      command: 'I do not get this. Explain it with a concrete example.',
      expect: 'answer',
      check: (c, reply) => lessonOf(c, 'ai-prompt-caching')?.body === caching.body && reply.split(/\s+/).length >= 60,
    },
    {
      name: 'ask: feedback on a passage becomes an in-place edit of that lesson',
      context: onLesson('ai-prompt-caching', quote),
      command: 'This passage is too abstract for me. Add a short worked example with concrete numbers right after it.',
      expect: 'proposal',
      check: (c) => {
        const l = lessonOf(c, 'ai-prompt-caching')
        return Boolean(l && l.body !== caching.body && l.body.length > caching.body.length && l.body.includes(para.slice(0, 80)) && lintBlocks(l.body, l.id).errors.length === 0)
      },
    },
    {
      name: 'ask: a learning preference is saved to the assistant memory',
      context: onLesson('ai-prompt-caching', quote),
      command: 'From now on, always show me a worked example with real numbers before any formula.',
      expect: 'any',
      check: () => true,
      result: (r) => r.kind !== 'error' && (r.remembered?.length ?? 0) >= 1,
    },
    {
      name: 'teach: rewrite a lesson following the teaching method',
      context: onLesson('ai-sampling', lessonOf(seed, 'ai-sampling')!.title),
      command: 'Rewrite this whole lesson following the teaching method. Keep its facts.',
      expect: 'proposal',
      check: (c) => {
        const l = lessonOf(c, 'ai-sampling')
        const checkBlock = /```check\n([\s\S]*?)```/.exec(l?.body ?? '')
        extra.rewrittenLesson = l?.body
        return Boolean(l && checkBlock && parseCheck(checkBlock[1]) && /```recall\n/.test(l.body) && lintBlocks(l.body, l.id).errors.length === 0)
      },
    },
  ]
  return list.filter((s) => (ONLY ? ONLY.test(s.name) : !s.optional))
}

async function assistantUi(h: AppHandles, win: BrowserWindow) {
  const note = 'Carry a laptop with a working IDE setup to the on-site hiring drive.'
  await visit(win, '#/company/goodscore')
  const opened = await js<boolean>(win, `getComputedStyle(document.getElementById('assistant')).display !== 'none'`)
  if (!opened) await js(win, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true, bubbles: true }))`)
  await js(
    win,
    `(() => { const t = document.getElementById('assistant-input'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, ${JSON.stringify(`Add a special note to GoodScore: "${note}"`)}); t.dispatchEvent(new Event('input', { bubbles: true })) })()`,
  )
  await sleep(100)
  await click(win, '#assistant button[type=submit]', 'Send')
  const t0 = Date.now()
  await waitFor(
    () => js<string>(win, `(() => { const a = document.getElementById('assistant'); return [...a.querySelectorAll('button')].some((b) => b.textContent === 'Apply') ? 'plan' : /failed|not found|Error/.test(a.textContent || '') && !/Working/.test(a.textContent || '') ? 'error' : '' })()`),
    (v) => v !== '',
    360000,
    'a plan in the Assistant panel',
  )
  await shot(win, '14-assistant-plan')
  await click(win, '#assistant button', 'Apply')
  await waitFor(() => js<boolean>(win, `document.getElementById('assistant').textContent.includes('Applied')`), Boolean, 15000, 'apply')
  await pressTab(win, 'Notes')
  await sleep(200)
  const onPage = (await pageText(win)).includes('working IDE setup')
  await shot(win, '15-assistant-applied')
  check('Assistant panel: command → plan → Apply updates the open page live', onPage, `${Math.round((Date.now() - t0) / 1000)}s`)

  await waitFor(
    () => js<boolean>(win, `[...document.querySelectorAll('#assistant button')].some((b) => b.textContent === 'Undo last change')`),
    Boolean,
    5000,
    'the Undo button',
  )
  await click(win, '#assistant button', 'Undo last change')
  await sleep(600)
  const gone = !(await pageText(win)).includes('working IDE setup')
  check(
    'Assistant panel: Undo last change reverts it',
    gone && !h.store.get().companies[0].specialNotes.some((n) => n.includes('working IDE setup')),
  )
}

async function assistantApi(h: AppHandles, seed: Content) {
  const transcript: TranscriptEntry[] = []
  const timings: Record<string, unknown>[] = []
  for (const s of scenarios(seed)) {
    const t0 = Date.now()
    // A passage question starts a fresh conversation, like the Ask panel does.
    const r = await h.agent.run(s.command, s.context ? [] : transcript, s.context)
    if (!s.context) transcript.push({ role: 'user', text: s.command })
    let reply = ''
    let ok = false
    let detail = ''
    if (r.kind === 'error') detail = r.message.split('\n').slice(0, 3).join(' ')
    else if (s.expect !== 'any' && r.kind !== s.expect) detail = `expected ${s.expect}, got ${r.kind}: ${'reply' in r ? r.reply : ''}`
    else if (r.kind === 'answer') {
      reply = r.reply
      if (!s.context) transcript.push({ role: 'assistant', text: reply })
      ok = s.check(h.store.get(), reply) && (s.result?.(r) ?? true)
      detail = reply.replace(/\s+/g, ' ').slice(0, 160)
    } else {
      reply = r.reply
      if (!s.context) transcript.push({ role: 'assistant', text: reply })
      const applied = await h.agent.apply(r.id)
      if (!applied.ok) detail = applied.error
      else {
        if (!s.context) transcript.push({ role: 'applied', text: applied.summary })
        ok = s.check(h.store.get(), reply) && (s.result?.(r) ?? true)
        detail = `${r.changes.length} change(s): ${applied.summary.slice(0, 160)}`
      }
    }
    const secs = Math.round((Date.now() - t0) / 1000)
    timings.push({ scenario: s.name, seconds: secs, kind: r.kind, ok, reply: reply.slice(0, 3000), sources: 'sources' in r ? r.sources : undefined })
    check(`assistant — ${s.name} (${secs}s)`, ok, detail)
  }
  extra.assistantTimings = timings

  let undone = 0
  while ((await h.agent.status()).undoable > 0) {
    const u = await h.agent.undo()
    if (!u.ok) break
    undone++
  }
  const restored = isDeepStrictEqual(JSON.parse(JSON.stringify(h.store.get())), seed)
  check(`undo walks every applied change back to the seed (${undone} undos)`, restored)
}

// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(OUT, { recursive: true })
  // macOS cannot nest sandboxes: when this harness itself runs inside a
  // sandboxed parent (an agent shell, CI), Chromium's helper processes fail to
  // start theirs. Opt out for the test run only; the shipped app keeps it.
  if (process.env.PREP_VERIFY_NO_SANDBOX === '1') app.commandLine.appendSwitch('no-sandbox')
  const h = await startApp({ userData, hidden: true })
  const win = h.window()!
  const errors: string[] = []
  win.webContents.on('console-message', (...args: unknown[]) => {
    const e = args[0] as { level?: unknown; message?: unknown }
    const level = e?.level ?? args[1]
    const message = String(e?.message ?? args[2] ?? '')
    if (level === 'error' || level === 3 || /Content Security Policy/i.test(message)) errors.push(message)
  })
  win.webContents.on('render-process-gone', (_e, d) => errors.push(`renderer gone: ${d.reason}`))
  win.webContents.setBackgroundThrottling(false)
  win.setSize(1280, 900)
  win.showInactive()
  await waitFor(() => js<boolean>(win, `!!document.querySelector('header')`), Boolean, 20000, 'the app to render')
  // An occluded window only produces frames when captured, so CSS animations
  // would be caught mid-flight; settle them for the run so screenshots show
  // final states. The shipped app is untouched.
  await win.webContents.insertCSS('*,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0.01ms!important}')

  const seed = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'seed', 'content.json'), 'utf8')) as Content
  const routes = routesOf(h.store.get())
  try {
    if (ONLY) await assistantApi(h, seed)
    else {
      await auditSelfTest(win)
      await sweep(win, routes)
      await screens(win, h.store.get())
      await extraShots(win)
      await features(h, win)
      if (AGENT) {
        await assistantUi(h, win)
        await assistantApi(h, seed)
      }
    }
  } catch (e) {
    check('verification run completed', false, e instanceof Error ? e.message : String(e))
  }
  check('no renderer errors or CSP violations', errors.length === 0, errors.slice(0, 3).join(' | '))

  const failed = results.filter((r) => !r.ok).length
  writeFileSync(
    path.join(OUT, 'report.json'),
    JSON.stringify({ at: new Date().toISOString(), website: WEBSITE, routes: routes.length, userData, results, ...extra }, null, 1),
  )
  console.log(`\n${results.length - failed}/${results.length} checks passed — report in ${OUT}`)
  app.exit(failed ? 1 : 0)
}

void main()
