import type { ChildProcess } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { RunnableLambda } from '@langchain/core/runnables'
import type { Content, Lesson } from '../shared/types'
import {
  type CodeReview,
  checkReview,
  groundQuestions,
  lessonSource,
  type McqQuestion,
  QUESTION_MIN,
  QUESTION_TARGET,
  type QuestionSet,
  reviewKey,
} from '../shared/tutor'
import { PROMPT_VERSION, QUESTIONS_SCHEMA, questionsPrompt, REVIEW_SCHEMA, reviewPrompt } from '../shared/tutorPrompt'
import type { TutorQuestionsResult, TutorVerifyResult } from '../shared/api'
import { findAgy, runAgy } from './agy'
import type { AgentSettings } from './agent'
import { isMissing, writeAtomic } from './fsutil'

// The tutor runs two fixed LangGraph graphs. Each graph has one model step
// (agy, schema-enforced JSON) between deterministic steps:
//
//   questions:  load lesson -> generate -> ground -> (retry | save)
//   verify:     prepare -> cache? -> critique -> validate -> (retry | save)
//
// "ground" keeps a question only if its quote is word for word in the lesson;
// "validate" keeps a review only if every issue quotes the learner's code and
// every key exists. Failures go back to the model with the reasons, at most
// MAX_ATTEMPTS times. Same code for the same problem returns the cached review.

const MAX_ATTEMPTS = 3
const TIMEOUT_SEC = 240

interface Store {
  version: 1
  questions: Record<string, QuestionSet>
  reviews: Record<string, CodeReview>
}

type Call = (prompt: string, schemaFile: string, label: string) => Promise<unknown>

/** The model step as a LangChain runnable: prompt in, structured JSON out. */
function modelRunnable(call: Call, schemaFile: string, label: string) {
  return RunnableLambda.from(async (prompt: string) => call(prompt, schemaFile, label))
}

// ---- graph: questions ----

const QState = Annotation.Root({
  lesson: Annotation<Lesson>(),
  source: Annotation<string>(),
  kept: Annotation<McqQuestion[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  rejected: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  raw: Annotation<unknown>(),
  attempts: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
})

export function buildQuestionsGraph(call: Call, schemaFile: string) {
  const model = modelRunnable(call, schemaFile, 'Writing questions')
  return new StateGraph(QState)
    .addNode('load', (s) => ({ source: lessonSource(s.lesson) }))
    .addNode('generate', async (s) => {
      const prompt = questionsPrompt({
        title: s.lesson.title,
        source: s.source,
        want: QUESTION_TARGET - s.kept.length + 2,
        keep: s.kept.map((q) => q.q),
        rejected: s.rejected,
      })
      return { raw: await model.invoke(prompt), attempts: 1 }
    })
    .addNode('ground', (s) => {
      const r = groundQuestions(s.raw, s.source, s.kept)
      const room = QUESTION_TARGET - s.kept.length
      return { kept: r.kept.slice(0, Math.max(0, room)), rejected: r.rejected }
    })
    .addEdge(START, 'load')
    .addEdge('load', 'generate')
    .addEdge('generate', 'ground')
    .addConditionalEdges('ground', (s) => (s.kept.length >= QUESTION_MIN || s.attempts >= MAX_ATTEMPTS ? END : 'generate'))
    .compile()
}

// ---- graph: verify ----

const VState = Annotation.Root({
  problemId: Annotation<string>(),
  code: Annotation<string>(),
  prompt: Annotation<string>(),
  patternKeys: Annotation<string[]>(),
  rejected: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  raw: Annotation<unknown>(),
  review: Annotation<CodeReview | null>({ reducer: (_a, b) => b, default: () => null }),
  cached: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  attempts: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
})

export function buildVerifyGraph(call: Call, schemaFile: string, ctx: { content: () => Content; cache: Store['reviews'] }) {
  const model = modelRunnable(call, schemaFile, 'Reviewing your code')
  const promptFor = (s: typeof VState.State) => {
    const c = ctx.content()
    const problem = c.packs[s.problemId]
    const patterns = c.patterns.filter((p) => p.problemIds.includes(s.problemId))
    return reviewPrompt({ problem, patterns, allPatternKeys: s.patternKeys, code: s.code, rejected: s.rejected })
  }
  return new StateGraph(VState)
    .addNode('prepare', (s) => {
      const c = ctx.content()
      if (!c.packs[s.problemId]) throw new Error(`Unknown problem ${s.problemId}.`)
      const hit = ctx.cache[reviewKey(s.problemId, s.code, PROMPT_VERSION)]
      return { patternKeys: c.patterns.map((p) => p.key), review: hit ?? null, cached: Boolean(hit) }
    })
    .addNode('critique', async (s) => ({ raw: await model.invoke(promptFor(s)), attempts: 1 }))
    .addNode('validate', (s) => {
      const r = checkReview(s.raw, s.code, s.patternKeys)
      return { review: r.review, rejected: r.errors }
    })
    .addEdge(START, 'prepare')
    .addConditionalEdges('prepare', (s) => (s.cached ? END : 'critique'))
    .addEdge('critique', 'validate')
    .addConditionalEdges('validate', (s) => (s.review || s.attempts >= MAX_ATTEMPTS ? END : 'critique'))
    .compile()
}

// ---- the tutor service ----

export class Tutor {
  private store: Store = { version: 1, questions: {}, reviews: {} }
  private agyPath: string | null = null
  private children = new Set<ChildProcess>()
  private busy = false
  private readonly file: string
  private readonly cwd: string
  private readonly qSchema: string
  private readonly rSchema: string

  private readonly settings: AgentSettings
  private readonly content: () => Content
  private readonly onProgress: (text: string) => void

  constructor(dir: string, settings: AgentSettings, content: () => Content, onProgress: (text: string) => void) {
    this.settings = settings
    this.content = content
    this.onProgress = onProgress
    this.file = path.join(dir, 'tutor.json')
    this.cwd = path.join(dir, 'workspace')
    this.qSchema = path.join(dir, 'questions.schema.json')
    this.rSchema = path.join(dir, 'review.schema.json')
  }

  async init(): Promise<void> {
    await mkdir(this.cwd, { recursive: true })
    await writeAtomic(this.qSchema, JSON.stringify(QUESTIONS_SCHEMA, null, 1))
    await writeAtomic(this.rSchema, JSON.stringify(REVIEW_SCHEMA, null, 1))
    try {
      const s = JSON.parse(await readFile(this.file, 'utf8')) as Store
      if (s && s.version === 1) this.store = { version: 1, questions: s.questions ?? {}, reviews: s.reviews ?? {} }
    } catch (e) {
      if (!isMissing(e)) console.error('tutor store unreadable, starting empty:', e)
    }
    this.agyPath = await findAgy(this.settings.agyPath)
  }

  private save = () => writeAtomic(this.file, JSON.stringify(this.store))

  questions(lessonId: string): QuestionSet | null {
    return this.store.questions[lessonId] ?? null
  }

  async clearQuestions(lessonId: string): Promise<void> {
    delete this.store.questions[lessonId]
    await this.save()
  }

  cancel(): void {
    for (const c of this.children) c.kill('SIGKILL')
  }

  private call: Call = async (prompt, schemaFile, label) => {
    this.agyPath ??= await findAgy(this.settings.agyPath)
    if (!this.agyPath) throw new Error('The agy CLI was not found. Install Antigravity, or set agent.agyPath in settings.json.')
    this.onProgress(label)
    const out = await runAgy(
      this.agyPath,
      prompt,
      { schemaFile, cwd: this.cwd, timeoutSec: TIMEOUT_SEC, model: this.settings.model, effort: 'low' },
      (child) => {
        this.children.add(child)
        child.once('exit', () => this.children.delete(child))
      },
    )
    if (out.structured == null) throw new Error(`agy returned no structured answer (status ${out.status || 'unknown'}).`)
    return out.structured
  }

  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('The tutor is already working. Wait for it to finish, or cancel.')
    this.busy = true
    try {
      return await fn()
    } finally {
      this.busy = false
      this.onProgress('')
    }
  }

  generateQuestions(lessonId: string): Promise<TutorQuestionsResult> {
    return this.exclusive(async () => {
      const lesson = this.content()
        .courses.flatMap((c) => c.chapters.flatMap((ch) => ch.lessons))
        .find((l) => l.id === lessonId)
      if (!lesson) return { ok: false, error: `Unknown lesson ${lessonId}.` }
      try {
        const graph = buildQuestionsGraph(this.call, this.qSchema)
        const end = await graph.invoke({ lesson }, { recursionLimit: 20 })
        if (end.kept.length < QUESTION_MIN)
          return { ok: false, error: `Only ${end.kept.length} questions passed the checks after ${end.attempts} tries. Last problems: ${end.rejected.slice(0, 3).join('; ') || 'none'}.` }
        const set: QuestionSet = { lessonId, source: 'generated', at: new Date().toISOString(), questions: end.kept }
        this.store.questions[lessonId] = set
        await this.save()
        return { ok: true, set, attempts: end.attempts, dropped: end.rejected.length }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    })
  }

  verify(problemId: string, code: string): Promise<TutorVerifyResult> {
    return this.exclusive(async () => {
      if (!code.trim()) return { ok: false, error: 'Write your approach in the editor first.' }
      try {
        const graph = buildVerifyGraph(this.call, this.rSchema, { content: this.content, cache: this.store.reviews })
        const end = await graph.invoke({ problemId, code }, { recursionLimit: 20 })
        if (!end.review)
          return { ok: false, error: `The review did not pass the checks after ${end.attempts} tries: ${end.rejected.slice(0, 3).join('; ')}.` }
        if (!end.cached) {
          this.store.reviews[reviewKey(problemId, code, PROMPT_VERSION)] = end.review
          await this.save()
        }
        return { ok: true, review: end.review, cached: end.cached }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    })
  }
}
