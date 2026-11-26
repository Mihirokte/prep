import type { AskContext, TranscriptEntry } from '../shared/api'
import { PROGRESS_KEY } from '../shared/progressMerge'
import { TODOS_KEY } from '../shared/todos'
import type { Agent } from './agent'
import type { ProgressStore } from './progress'
import type { ContentStore } from './store'
import type { Tutor } from './tutor'

// One table of calls, used by both doors into the main process: the Mac window
// (Electron IPC) and the web server that serves the phone. Every argument is
// validated here, whoever sent it.

export type Via = 'ipc' | 'web'
export type Handler = (args: unknown[], via: Via) => unknown

export interface HandlerContext {
  store: ContentStore
  progress: ProgressStore
  agent: Agent
  tutor: Tutor
}

/** What a phone may call: read content, read and write its own progress and
 *  to-do list, and read questions that already exist. The assistant and the
 *  tutor's generate/verify spawn the agent CLI on the Mac, so they stay on the Mac. */
export const WEB_CHANNELS: ReadonlySet<string> = new Set(['content:get', 'progress:get', 'progress:set', 'tutor:questions'])
const WEB_PROGRESS_KEYS: ReadonlySet<string> = new Set([PROGRESS_KEY, TODOS_KEY])

const str = (v: unknown, max: number, what: string): string => {
  if (typeof v !== 'string' || v.length > max) throw new Error(`invalid ${what}`)
  return v
}

export function createHandlers(ctx: HandlerContext): Record<string, Handler> {
  const { store, progress, agent, tutor } = ctx
  const webKey = (key: string, via: Via) => {
    if (via === 'web' && !WEB_PROGRESS_KEYS.has(key)) throw new Error('that key is not available here')
    return key
  }
  return {
    'content:get': () => store.get(),
    'progress:get': ([key], via) => progress.get(webKey(str(key, 200, 'key'), via)),
    'progress:set': ([key, value], via) => {
      const k = webKey(str(key, 200, 'key'), via)
      const v = str(value, via === 'web' ? 8_000_000 : 50_000_000, 'value')
      return via === 'web' ? progress.setMerged(k, v) : progress.set(k, v)
    },
    'progress:remove': ([key]) => progress.remove(str(key, 200, 'key')),
    'agent:run': ([req]) => {
      const r = (req ?? {}) as { message?: unknown; transcript?: unknown; context?: unknown }
      const message = str(r.message, 20_000, 'message').trim()
      if (!message) throw new Error('empty command')
      const transcript: TranscriptEntry[] = (Array.isArray(r.transcript) ? r.transcript : [])
        .filter((t): t is TranscriptEntry => {
          const x = t as TranscriptEntry
          return Boolean(x) && ['user', 'assistant', 'applied'].includes(x.role) && typeof x.text === 'string'
        })
        .slice(-20)
        .map((t) => ({ role: t.role, text: t.text.slice(0, 4000) }))
      const c = (r.context ?? null) as Record<string, unknown> | null
      const context: AskContext | undefined =
        c?.kind === 'lesson'
          ? {
              kind: 'lesson',
              courseKey: str(c.courseKey, 200, 'course key'),
              lessonId: str(c.lessonId, 300, 'lesson id'),
              quote: str(c.quote, 20_000, 'quote').trim(),
            }
          : c?.kind === 'page'
            ? { kind: 'page', route: str(c.route, 500, 'route'), quote: str(c.quote, 20_000, 'quote').trim() }
            : undefined
      return agent.run(message, transcript, context)
    },
    'agent:memory': () => agent.memory.list(),
    'agent:forget': async ([id]) => {
      await agent.memory.forget([str(id, 40, 'memory id')])
    },
    'agent:cancel': () => agent.cancel(),
    'agent:apply': ([id]) => agent.apply(str(id, 100, 'plan id')),
    'agent:discard': ([id]) => agent.discard(str(id, 100, 'plan id')),
    'agent:undo': () => agent.undo(),
    'agent:status': () => agent.status(),
    'tutor:questions': ([id]) => tutor.questions(str(id, 300, 'lesson id')),
    'tutor:generate': ([id]) => tutor.generateQuestions(str(id, 300, 'lesson id')),
    'tutor:clear': ([id]) => tutor.clearQuestions(str(id, 300, 'lesson id')),
    'tutor:verify': ([id, code]) => tutor.verify(str(id, 300, 'problem id'), str(code, 100_000, 'code')),
    'tutor:cancel': () => tutor.cancel(),
  }
}
