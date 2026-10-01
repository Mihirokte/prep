import { app, BrowserWindow } from 'electron'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { TranscriptEntry } from '../shared/api'
import type { Content } from '../shared/types'
import { type AppHandles, startApp } from './app'

// End-to-end verification of the real app, run with `npm run verify:app`.
// Uses a throwaway data directory, so the user's own store is never touched.
// Self-contained by default: no network and no external tools are needed.
//
//  1. Every route renders (no "Not found", no renderer errors, no CSP blocks).
//  2. Screenshots of each screen type for visual review.
//  3. The Pyodide validator, progress persistence across reload, the ⌘K palette,
//     the Assistant panel.
//  4. With PREP_VERIFY_WEBSITE=<url>: every route's visible text is compared to
//     the web portal this app was extracted from, route by route.
//  5. With PREP_VERIFY_AGENT=1: real natural-language CRUD through agy — one
//     command through the Assistant panel UI, the rest through the same main-
//     process API the panel calls — then undo everything and confirm the store
//     is byte-for-byte the seed again. Requires the agy CLI.

const OUT = path.resolve(process.env.PREP_VERIFY_OUT ?? 'verify-report')
const WEBSITE = process.env.PREP_VERIFY_WEBSITE || null
const AGENT = process.env.PREP_VERIFY_AGENT === '1'
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

function routesOf(c: Content): string[] {
  return [
    '#/',
    '#/dsa',
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
  for (const r of routes) app[r] = await visit(win, r)
  const notFound = routes.filter((r) => app[r].notFound)
  check(`every route renders (${routes.length} routes)`, notFound.length === 0, notFound.slice(0, 5).join(', '))

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
  const lessonWithDiagram = c.courses
    .flatMap((co) => co.chapters.flatMap((ch) => ch.lessons.map((l) => ({ co, l }))))
    .find(({ l }) => l.body.includes('```mermaid'))
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
  ]
  for (const [name, route] of plan) {
    await visit(win, route)
    await js(win, 'window.scrollTo(0, 0)')
    await shot(win, name)
  }
  // An expanded answer on the company page
  await visit(win, '#/company/goodscore')
  await click(win, 'button', 'Answer')
  await shot(win, '11-company-answer')
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
    () => js<string>(win, `(() => { const el = [...document.querySelectorAll('div')].find((d) => /Looks valid|Error|could not load/.test(d.textContent || '') && d.children.length === 0); return el ? el.textContent : '' })()`),
    (v) => v.length > 0,
    30000,
    'the validator verdict',
  )
  check('Python validator runs offline from bundled Pyodide', verdict.startsWith('Looks valid'), verdict)

  // Progress: status persists to disk and survives a reload.
  const clicked = await click(win, '[role=radiogroup] button', 'solved')
  await sleep(700)
  const raw = JSON.parse(readFileSync(path.join(userData, 'progress.json'), 'utf8')) as Record<string, string>
  const persisted = JSON.parse(JSON.parse(raw['persist:prep-v2']).problems)['dsa-001']?.status
  check('problem status is written to progress.json', clicked && persisted === 'solved', `stored: ${persisted}`)
  win.webContents.reload()
  await waitFor(() => js<boolean>(win, `!!document.querySelector('header')`), Boolean, 15000, 'reload')
  await visit(win, '#/drill/dsa-001')
  const still = await js<boolean>(win, `[...document.querySelectorAll('[role=radiogroup] button')].some((b) => b.textContent === 'solved' && b.getAttribute('data-state') === 'on')`)
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
    9 + // home index entries
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
}

// ---- assistant: real natural-language CRUD through agy ----

interface Scenario {
  name: string
  command: string
  expect: 'proposal' | 'answer'
  check: (c: Content, reply: string) => boolean
}

function scenarios(seed: Content): Scenario[] {
  const twoSum = seed.areas.flatMap((a) => a.drills).find((d) => d.title === 'Two Sum')!.id
  const hashing = seed.patterns.find((p) => p.key === 'hashing')!
  const pat = (c: Content, key: string) => c.patterns.find((p) => p.key === key)
  const acme = (c: Content) => c.companies.find((x) => /acme/i.test(x.name))
  const acmeQ = (c: Content) => acme(c)?.questions.flatMap((g) => g.questions).find((q) => /substring/i.test(q.q))
  return [
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
  ]
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
    const r = await h.agent.run(s.command, transcript)
    transcript.push({ role: 'user', text: s.command })
    let reply = ''
    let ok = false
    let detail = ''
    if (r.kind === 'error') detail = r.message.split('\n').slice(0, 3).join(' ')
    else if (r.kind !== s.expect) detail = `expected ${s.expect}, got ${r.kind}: ${'reply' in r ? r.reply : ''}`
    else if (r.kind === 'answer') {
      reply = r.reply
      transcript.push({ role: 'assistant', text: reply })
      ok = s.check(h.store.get(), reply)
      detail = reply.replace(/\s+/g, ' ').slice(0, 160)
    } else {
      reply = r.reply
      transcript.push({ role: 'assistant', text: reply })
      const applied = await h.agent.apply(r.id)
      if (!applied.ok) detail = applied.error
      else {
        transcript.push({ role: 'applied', text: applied.summary })
        ok = s.check(h.store.get(), reply)
        detail = `${r.changes.length} change(s): ${applied.summary.slice(0, 160)}`
      }
    }
    const secs = Math.round((Date.now() - t0) / 1000)
    timings.push({ scenario: s.name, seconds: secs, kind: r.kind, ok })
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
    await sweep(win, routes)
    await screens(win, h.store.get())
    await features(h, win)
    if (AGENT) {
      await assistantUi(h, win)
      await assistantApi(h, seed)
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
