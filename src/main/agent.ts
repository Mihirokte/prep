import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { AgentResult, AgentStatus, ApplyResult, AskContext, MemoryDelta, TranscriptEntry } from '../shared/api'
import { lintChangedLessons } from '../shared/blocks'
import { findMentions, type RecordRef } from '../shared/digest'
import { ENTITIES, type Entity, exists } from '../shared/locate'
import { applyOps, type Change, decodeOps, type Op, summarizeChanges, type WireOp } from '../shared/ops'
import { buildPrompt, contextRecord, OUTPUT_SCHEMA, type SliceContext } from '../shared/prompt'
import { extractUrls, type Source, toRef } from '../shared/sources'
import type { Content } from '../shared/types'
import { type AgyOutput, findAgy, runAgy } from './agy'
import { writeAtomic } from './fsutil'
import type { ContentStore } from './store'
import { MemoryStore } from './memory'
import { WebReader } from './web'

export interface AgentSettings {
  agyPath?: string
  model?: string
  effort?: 'low' | 'medium' | 'high'
  /** Time limit for one model call. */
  timeoutSec?: number
  /** Time limit for one slice of a large job (writing lessons takes longer). */
  taskTimeoutSec?: number
  /** Slices that run at the same time. */
  parallel?: number
}

interface Proposal {
  command: string
  ops: Op[]
  baseRevision: number
  next: Content
  changes: Change[]
}

interface Task {
  title: string
  instructions: string
  urls: string[]
}

interface Structured {
  reply: string
  operations: WireOp[]
  need: RecordRef[]
  fetch: string[]
  tasks: Task[]
  remember: string[]
  forget: string[]
}

/** One planning call chain (with its fetch, need and repair rounds). */
interface PlanInput {
  content: Content
  command: string
  transcript: TranscriptEntry[]
  records: RecordRef[]
  sources: Source[]
  slice?: SliceContext
  context?: AskContext
  timeoutSec: number
  /** Prefix for progress lines, e.g. "Slice 2/6". */
  label: string
}

type PlanOutcome =
  | { kind: 'answer'; reply: string; sources: Source[]; remember: string[]; forget: string[] }
  | { kind: 'plan'; reply: string; ops: Op[]; tasks: Task[]; sources: Source[]; remember: string[]; forget: string[] }
  | { kind: 'error'; message: string; sources: Source[] }

const MAX_NEED_ROUNDS = 2
const MAX_FETCH_ROUNDS = 3
const MAX_FETCH_PER_ROUND = 8
const MAX_REPAIRS = 2
const MAX_TASKS = 10

class Cancelled extends Error {}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Shape-check the model's structured answer. */
function readStructured(v: unknown): Structured | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.reply !== 'string' || !Array.isArray(o.operations)) return null
  const operations = o.operations.filter((x): x is WireOp => Boolean(x) && typeof x === 'object' && typeof (x as WireOp).op === 'string')
  const need = (Array.isArray(o.need) ? o.need : [])
    .filter((x): x is RecordRef => Boolean(x) && typeof x === 'object' && ENTITIES.includes((x as RecordRef).entity as Entity) && typeof (x as RecordRef).id === 'string')
  const fetch = strings(o.fetch).flatMap((u) => extractUrls(u, 1))
  const tasks = (Array.isArray(o.tasks) ? o.tasks : [])
    .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === 'object')
    .map((t) => ({ title: String(t.title ?? '').trim(), instructions: String(t.instructions ?? '').trim(), urls: strings(t.urls).flatMap((u) => extractUrls(u, 1)) }))
    .filter((t) => t.title && t.instructions)
  return { reply: o.reply, operations, need, fetch, tasks, remember: strings(o.remember), forget: strings(o.forget) }
}

/** Run `fn` over `items`, at most `n` at a time, keeping order. */
async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

const dedupe = (sources: Source[]): Source[] => {
  const seen = new Set<string>()
  return sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)))
}

export class Agent {
  private proposals = new Map<string, Proposal>()
  private children = new Set<ChildProcess>()
  private abort = new AbortController()
  private busy = false
  private agyPath: string | null = null
  private readonly web = new WebReader()
  readonly memory: MemoryStore
  private readonly schemaFile: string
  private readonly cwd: string
  private readonly logFile: string
  private readonly store: ContentStore
  private readonly settings: AgentSettings
  private readonly onChanged: (content: Content) => void
  private readonly onProgress: (text: string) => void

  constructor(
    store: ContentStore,
    dir: string,
    settings: AgentSettings,
    onChanged: (content: Content) => void,
    onProgress: (text: string) => void = () => {},
  ) {
    this.store = store
    this.settings = settings
    this.onChanged = onChanged
    this.onProgress = onProgress
    this.schemaFile = path.join(dir, 'schema.json')
    // An empty working directory: the model has nothing on disk to reach for.
    this.cwd = path.join(dir, 'workspace')
    this.logFile = path.join(dir, 'log.jsonl')
    this.memory = new MemoryStore(path.join(dir, 'memory.json'))
  }

  async init(): Promise<void> {
    await mkdir(this.cwd, { recursive: true })
    await writeAtomic(this.schemaFile, JSON.stringify(OUTPUT_SCHEMA, null, 1))
    await this.memory.load()
    this.agyPath = await findAgy(this.settings.agyPath)
  }

  async status(): Promise<AgentStatus> {
    return { agyPath: this.agyPath, undoable: await this.store.undoable(), busy: this.busy }
  }

  private async log(entry: Record<string, unknown>): Promise<void> {
    try {
      await appendFile(this.logFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
    } catch (e) {
      console.error('could not write the assistant log:', e)
    }
  }

  private checkCancelled(): void {
    if (this.abort.signal.aborted) throw new Cancelled('Cancelled.')
  }

  private async read(urls: string[], label: string): Promise<Source[]> {
    if (!urls.length) return []
    this.onProgress(`${label}: reading ${urls.length === 1 ? urls[0] : `${urls.length} sources`}`)
    const got = await this.web.readAll(urls, this.abort.signal)
    await this.log({ kind: 'fetch', sources: got.map((s) => ({ url: s.url, chars: s.text.length, error: s.error })) })
    return got
  }

  /** Validate a plan: ops decode, apply cleanly and every lesson they touch has well-formed blocks. */
  private check(content: Content, wire: WireOp[], date: string): { ok: true; ops: Op[]; next: Content } | { ok: false; errors: string[] } {
    const decoded = decodeOps(wire)
    if (decoded.errors.length) return { ok: false, errors: decoded.errors }
    return this.checkOps(content, decoded.ops, date)
  }

  private checkOps(content: Content, ops: Op[], date: string): { ok: true; ops: Op[]; next: Content } | { ok: false; errors: string[] } {
    const r = applyOps(content, ops, date)
    if (!r.ok) return { ok: false, errors: r.errors }
    const lint = lintChangedLessons(content, r.content)
    if (lint.length) return { ok: false, errors: lint }
    return { ok: true, ops, next: r.content }
  }

  private async plan(bin: string, input: PlanInput, date: string): Promise<PlanOutcome> {
    const { content, command, transcript, slice, context } = input
    let { records, sources } = input
    let rejected: string[] | undefined
    let previousPlan: unknown
    let needRounds = 0
    let fetchRounds = 0
    let repairs = 0

    for (;;) {
      this.checkCancelled()
      const prompt = buildPrompt({
        content,
        command,
        transcript,
        records,
        sources,
        fetchRoundsLeft: MAX_FETCH_ROUNDS - fetchRounds,
        slice,
        context,
        memory: this.memory.list(),
        rejected,
        previousPlan,
        date,
      })
      this.onProgress(`${input.label}: thinking`)
      const started = Date.now()
      let out: AgyOutput
      try {
        out = await runAgy(
          bin,
          prompt,
          {
            schemaFile: this.schemaFile,
            cwd: this.cwd,
            timeoutSec: input.timeoutSec,
            model: this.settings.model,
            effort: this.settings.effort ?? 'medium',
          },
          (child) => {
            this.children.add(child)
            child.once('exit', () => this.children.delete(child))
          },
        )
      } catch (e) {
        this.checkCancelled()
        // A call killed at the time limit gets the same repair as one that
        // reported a timeout: ask for a smaller answer.
        const killed = (Date.now() - started) / 1000 >= input.timeoutSec
        if (!killed) throw e
        out = { status: 'timeout', structured: null, response: '', denied: [], durationSec: input.timeoutSec }
      }
      this.checkCancelled()

      const answer = readStructured(out.structured)
      if (answer)
        await this.log({
          kind: 'call',
          label: input.label,
          seconds: out.durationSec,
          operations: answer.operations.length,
          tasks: answer.tasks.length,
          fetch: answer.fetch.length,
          need: answer.need.length,
        })
      if (!answer) {
        await this.log({ command, kind: 'unstructured', status: out.status, seconds: out.durationSec, denied: out.denied })
        if (repairs++ < MAX_REPAIRS) {
          const timedOut = /time/i.test(out.status) || (out.durationSec ?? 0) >= input.timeoutSec - 5
          rejected = [
            timedOut
              ? slice
                ? `You ran out of time (${input.timeoutSec}s). Write this slice more compactly.`
                : `You ran out of time (${input.timeoutSec}s) because the answer was too long. If the work needs more than about four lessons, write no lesson text now: return "tasks" with short briefs and let each slice write its part.`
              : out.denied.length
                ? `You tried to use tools (${out.denied.join(', ')}); tools are unavailable. Put URLs in "fetch" and answer only through the JSON fields.`
                : 'You returned no structured answer. Answer only through the JSON fields.',
          ]
          continue
        }
        return { kind: 'error', message: `agy did not return a structured answer (status ${out.status || 'unknown'}).`, sources }
      }

      const fresh = answer.fetch.filter((u) => !sources.some((s) => s.url === u)).slice(0, MAX_FETCH_PER_ROUND)
      if (fresh.length && fetchRounds < MAX_FETCH_ROUNDS) {
        fetchRounds++
        sources = dedupe([...sources, ...(await this.read(fresh, input.label))])
        rejected = undefined
        previousPlan = undefined
        continue
      }

      const wanted = answer.need.filter(
        (r) => exists(content, r.entity, r.id) && !records.some((x) => x.entity === r.entity && x.id === r.id),
      )
      if (wanted.length && needRounds++ < MAX_NEED_ROUNDS) {
        records = [...wanted, ...records]
        rejected = undefined
        previousPlan = undefined
        continue
      }

      if (answer.tasks.length && slice) {
        if (answer.operations.length === 0 && repairs++ < MAX_REPAIRS) {
          rejected = ['You are one slice of a larger job: do your slice yourself and return its operations, not tasks.']
          continue
        }
        answer.tasks = []
      }

      const { remember, forget } = answer
      if (answer.operations.length === 0 && answer.tasks.length === 0) return { kind: 'answer', reply: answer.reply, sources, remember, forget }

      const checked = answer.operations.length ? this.check(content, answer.operations, date) : { ok: true as const, ops: [], next: content }
      if (!checked.ok) {
        if (repairs++ < MAX_REPAIRS) {
          rejected = checked.errors.slice(0, 25)
          previousPlan = answer.operations
          continue
        }
        await this.log({ command, kind: 'rejected', errors: checked.errors })
        return {
          kind: 'error',
          message: `The plan did not pass validation, so nothing was changed:\n- ${checked.errors.slice(0, 12).join('\n- ')}`,
          sources,
        }
      }
      return { kind: 'plan', reply: answer.reply, ops: checked.ops, tasks: answer.tasks.slice(0, MAX_TASKS), sources, remember, forget }
    }
  }

  /** Run every slice, then fold their operations onto the store in order. A
   *  slice that fails or collides with an earlier one is left out and named. */
  private async runTasks(
    bin: string,
    base: Content,
    top: { reply: string; tasks: Task[]; sources: Source[] },
    command: string,
    date: string,
  ): Promise<{ ops: Op[]; notes: string[]; sources: Source[] }> {
    const titles = top.tasks.map((t) => t.title)
    const total = top.tasks.length
    let done = 0
    this.onProgress(`Writing ${total} slices`)
    const results = await pool(top.tasks, this.settings.parallel ?? 3, async (task, i) => {
      const label = `Slice ${i + 1}/${total}`
      try {
        const own = await this.read(task.urls.filter((u) => !top.sources.some((s) => s.url === u)), label)
        const fromTop = task.urls.map((u) => top.sources.find((s) => s.url === u)).filter((s): s is Source => Boolean(s))
        const outcome = await this.plan(
          bin,
          {
            content: base,
            command: task.instructions,
            transcript: [],
            records: findMentions(base, task.instructions),
            // The slice's own sources first, so they get the budget; then the planner's.
            sources: dedupe([...own, ...fromTop, ...top.sources]),
            slice: { parent: command, planReply: top.reply, titles, index: i },
            timeoutSec: this.settings.taskTimeoutSec ?? 600,
            label,
          },
          date,
        )
        return outcome
      } catch (e) {
        if (e instanceof Cancelled) throw e
        return { kind: 'error' as const, message: e instanceof Error ? e.message : String(e), sources: [] }
      } finally {
        done++
        this.onProgress(`${done}/${total} slices done`)
      }
    })

    let merged = base
    const ops: Op[] = []
    const notes: string[] = []
    const sources: Source[] = []
    results.forEach((r, i) => {
      sources.push(...r.sources)
      const name = `"${titles[i]}"`
      if (r.kind === 'error') return notes.push(`${name} failed: ${r.message.split('\n').slice(0, 3).join(' ')}`)
      if (r.kind === 'answer' || r.ops.length === 0) return notes.push(`${name} returned no changes: ${r.reply.slice(0, 300)}`)
      const step = this.checkOps(merged, r.ops, date)
      if (!step.ok) return notes.push(`${name} left out, it collides with an earlier slice: ${step.errors.slice(0, 2).join('; ')}`)
      merged = step.next
      ops.push(...r.ops)
    })
    return { ops, notes, sources }
  }

  /** Save what the learner asked to be remembered or forgotten. */
  private async remember(outcome: { remember: string[]; forget: string[] }, date: string, context?: AskContext): Promise<MemoryDelta> {
    const remembered = await this.memory.add(outcome.remember.slice(0, 5), { at: date, lessonId: context?.kind === 'lesson' ? context.lessonId : undefined })
    const forgotten = await this.memory.forget(outcome.forget)
    if (remembered.length || forgotten.length) await this.log({ kind: 'memory', remembered, forgotten })
    return { ...(remembered.length ? { remembered } : {}), ...(forgotten.length ? { forgotten } : {}) }
  }

  async run(command: string, transcript: TranscriptEntry[], context?: AskContext): Promise<AgentResult> {
    if (this.busy) return { kind: 'error', message: 'Still working on the previous command.' }
    this.agyPath ??= await findAgy(this.settings.agyPath)
    const bin = this.agyPath
    if (!bin)
      return {
        kind: 'error',
        message: 'The agy CLI was not found (looked in ~/.local/bin, /opt/homebrew/bin, /usr/local/bin and the login shell PATH).',
      }

    this.busy = true
    this.abort = new AbortController()
    const date = new Date().toISOString().slice(0, 10)
    const content = this.store.get()
    const baseRevision = this.store.revision
    const recentUserText = transcript.filter((t) => t.role === 'user').slice(-2).map((t) => t.text)
    // The record the reader is looking at always goes into the prompt in full.
    const pinned = context ? contextRecord(context) : null
    let sources: Source[] = []

    try {
      // URLs in the command (and the user's last few turns, for "continue") are read up front.
      const urls = extractUrls([command, ...[...recentUserText].reverse()].join('\n'), MAX_FETCH_PER_ROUND)
      sources = await this.read(urls, 'Preparing')

      const top = await this.plan(
        bin,
        {
          content,
          command,
          transcript,
          records: [
            ...(pinned && exists(content, pinned.entity, pinned.id) ? [pinned] : []),
            ...findMentions(content, [command, context?.quote ?? '', ...recentUserText].join('\n')),
          ],
          sources,
          context,
          timeoutSec: this.settings.timeoutSec ?? 300,
          label: 'Planning',
        },
        date,
      )
      sources = top.sources
      if (top.kind === 'error') {
        await this.log({ command, kind: 'error', error: top.message })
        return { kind: 'error', message: top.message }
      }
      const memory = await this.remember(top, date, context)
      if (top.kind === 'answer') {
        await this.log({ command, kind: 'answer', reply: top.reply })
        return { kind: 'answer', reply: top.reply || 'No answer.', sources: sources.map(toRef), ...memory }
      }

      let ops = top.ops
      let reply = top.reply
      if (top.tasks.length) {
        const base = ops.length ? (applyOps(content, ops, date) as { ok: true; content: Content }).content : content
        const sliced = await this.runTasks(bin, base, top, command, date)
        this.checkCancelled()
        ops = [...ops, ...sliced.ops]
        sources = dedupe([...sources, ...sliced.sources])
        const ok = top.tasks.length - sliced.notes.length
        reply = [
          top.reply,
          `${ok} of ${top.tasks.length} slices are in this plan: ${top.tasks.map((t) => t.title).join('; ')}.`,
          ...sliced.notes.map((n) => `- ${n}`),
        ].join('\n\n')
        if (!ops.length) return { kind: 'error', message: `No slice produced changes.\n- ${sliced.notes.join('\n- ')}` }
      }

      const result = applyOps(content, ops, date)
      if (!result.ok) return { kind: 'error', message: `The combined plan did not apply:\n- ${result.errors.slice(0, 12).join('\n- ')}` }
      const id = randomUUID()
      this.proposals.set(id, { command, ops, baseRevision, next: result.content, changes: result.changes })
      await this.log({ command, kind: 'proposal', id, reply, tasks: top.tasks.map((t) => t.title), ops })
      return { kind: 'proposal', id, reply, changes: result.changes, sources: sources.map(toRef), ...memory }
    } catch (e) {
      if (e instanceof Cancelled || this.abort.signal.aborted) return { kind: 'error', message: 'Cancelled.' }
      const message = e instanceof Error ? e.message : String(e)
      await this.log({ command, kind: 'error', error: message })
      return { kind: 'error', message }
    } finally {
      this.busy = false
      for (const c of this.children) c.kill('SIGKILL')
      this.children.clear()
    }
  }

  cancel(): void {
    this.abort.abort()
    for (const c of this.children) {
      c.kill('SIGTERM')
      // agy can ignore SIGTERM; make sure it stops.
      setTimeout(() => {
        if (c.exitCode === null && c.signalCode === null) c.kill('SIGKILL')
      }, 3000).unref()
    }
  }

  async apply(id: string): Promise<ApplyResult> {
    const p = this.proposals.get(id)
    if (!p) return { ok: false, error: 'This plan is no longer available.' }
    let next = p.next
    let changes = p.changes
    if (this.store.revision !== p.baseRevision) {
      // The store moved on (another plan or an undo); re-run the plan on the current state.
      const again = applyOps(this.store.get(), p.ops)
      if (!again.ok)
        return { ok: false, error: `The data changed since this plan was made and it no longer applies:\n- ${again.errors.join('\n- ')}` }
      next = again.content
      changes = again.changes
    }
    const summary = summarizeChanges(changes)
    await this.store.commit(next, summary)
    this.proposals.delete(id)
    this.onChanged(next)
    await this.log({ command: p.command, kind: 'applied', id, summary })
    return { ok: true, summary }
  }

  discard(id: string): void {
    this.proposals.delete(id)
  }

  async undo(): Promise<ApplyResult> {
    const undone = await this.store.undo()
    if (!undone) return { ok: false, error: 'Nothing to undo.' }
    this.onChanged(this.store.get())
    await this.log({ kind: 'undo', summary: undone.summary })
    return { ok: true, summary: undone.summary }
  }
}
