import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { AgentResult, AgentStatus, ApplyResult, TranscriptEntry } from '../shared/api'
import { findMentions, type RecordRef } from '../shared/digest'
import { ENTITIES, type Entity, exists } from '../shared/locate'
import { applyOps, type Change, decodeOps, type Op, summarizeChanges, type WireOp } from '../shared/ops'
import { buildPrompt, OUTPUT_SCHEMA } from '../shared/prompt'
import type { Content } from '../shared/types'
import { findAgy, runAgy } from './agy'
import { writeAtomic } from './fsutil'
import type { ContentStore } from './store'

export interface AgentSettings {
  agyPath?: string
  model?: string
  effort?: 'low' | 'medium' | 'high'
  timeoutSec?: number
}

interface Proposal {
  command: string
  ops: Op[]
  baseRevision: number
  next: Content
  changes: Change[]
}

interface Structured {
  reply: string
  operations: WireOp[]
  need: RecordRef[]
}

const MAX_NEED_ROUNDS = 2
const MAX_REPAIRS = 2

/** Shape-check the model's structured answer. */
function readStructured(v: unknown): Structured | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.reply !== 'string' || !Array.isArray(o.operations)) return null
  const operations = o.operations.filter((x): x is WireOp => Boolean(x) && typeof x === 'object' && typeof (x as WireOp).op === 'string')
  const need = (Array.isArray(o.need) ? o.need : [])
    .filter((x): x is RecordRef => Boolean(x) && typeof x === 'object' && ENTITIES.includes((x as RecordRef).entity as Entity) && typeof (x as RecordRef).id === 'string')
  return { reply: o.reply, operations, need }
}

export class Agent {
  private proposals = new Map<string, Proposal>()
  private child: ChildProcess | null = null
  private cancelled = false
  private busy = false
  private agyPath: string | null = null
  private readonly schemaFile: string
  private readonly cwd: string
  private readonly logFile: string
  private readonly store: ContentStore
  private readonly settings: AgentSettings
  private readonly onChanged: (content: Content) => void

  constructor(store: ContentStore, dir: string, settings: AgentSettings, onChanged: (content: Content) => void) {
    this.store = store
    this.settings = settings
    this.onChanged = onChanged
    this.schemaFile = path.join(dir, 'schema.json')
    // An empty working directory: the model has nothing on disk to reach for.
    this.cwd = path.join(dir, 'workspace')
    this.logFile = path.join(dir, 'log.jsonl')
  }

  async init(): Promise<void> {
    await mkdir(this.cwd, { recursive: true })
    await writeAtomic(this.schemaFile, JSON.stringify(OUTPUT_SCHEMA, null, 1))
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

  async run(command: string, transcript: TranscriptEntry[]): Promise<AgentResult> {
    if (this.busy) return { kind: 'error', message: 'Still working on the previous command.' }
    this.agyPath ??= await findAgy(this.settings.agyPath)
    const bin = this.agyPath
    if (!bin)
      return {
        kind: 'error',
        message: 'The agy CLI was not found (looked in ~/.local/bin, /opt/homebrew/bin, /usr/local/bin and the login shell PATH).',
      }

    this.busy = true
    this.cancelled = false
    const date = new Date().toISOString().slice(0, 10)
    const content = this.store.get()
    const baseRevision = this.store.revision
    const recentUserText = transcript.filter((t) => t.role === 'user').slice(-2).map((t) => t.text)
    let records = findMentions(content, [command, ...recentUserText].join('\n'))
    let rejected: string[] | undefined
    let previousPlan: unknown
    let needRounds = 0
    let repairs = 0

    try {
      for (;;) {
        const prompt = buildPrompt({ content, command, transcript, records, rejected, previousPlan, date })
        const out = await runAgy(
          bin,
          prompt,
          {
            schemaFile: this.schemaFile,
            cwd: this.cwd,
            timeoutSec: this.settings.timeoutSec ?? 300,
            model: this.settings.model,
            effort: this.settings.effort ?? 'medium',
          },
          (child) => {
            this.child = child
          },
        )
        if (this.cancelled) return { kind: 'error', message: 'Cancelled.' }

        const answer = readStructured(out.structured)
        if (!answer) {
          if (repairs++ < MAX_REPAIRS) {
            rejected = [
              out.denied.length
                ? `You tried to use tools (${out.denied.join(', ')}); tools are unavailable. Answer only through the JSON fields.`
                : 'You returned no structured answer. Answer only through the JSON fields.',
            ]
            continue
          }
          throw new Error(`agy did not return a structured answer (status ${out.status || 'unknown'}).`)
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

        if (answer.operations.length === 0) {
          await this.log({ command, kind: 'answer', reply: answer.reply })
          return { kind: 'answer', reply: answer.reply || 'No answer.' }
        }

        const decoded = decodeOps(answer.operations)
        const result = decoded.errors.length ? { ok: false as const, errors: decoded.errors } : applyOps(content, decoded.ops, date)
        if (!result.ok) {
          if (repairs++ < MAX_REPAIRS) {
            rejected = result.errors.slice(0, 25)
            previousPlan = answer.operations
            continue
          }
          await this.log({ command, kind: 'rejected', errors: result.errors })
          return {
            kind: 'error',
            message: `The plan did not pass validation, so nothing was changed:\n- ${result.errors.slice(0, 12).join('\n- ')}`,
          }
        }

        const id = randomUUID()
        this.proposals.set(id, { command, ops: decoded.ops, baseRevision, next: result.content, changes: result.changes })
        await this.log({ command, kind: 'proposal', id, reply: answer.reply, ops: decoded.ops })
        return { kind: 'proposal', id, reply: answer.reply, changes: result.changes }
      }
    } catch (e) {
      if (this.cancelled) return { kind: 'error', message: 'Cancelled.' }
      const message = e instanceof Error ? e.message : String(e)
      await this.log({ command, kind: 'error', error: message })
      return { kind: 'error', message }
    } finally {
      this.busy = false
      this.child = null
    }
  }

  cancel(): void {
    this.cancelled = true
    this.child?.kill('SIGTERM')
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
