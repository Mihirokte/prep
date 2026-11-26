import type { PrepApi, TutorQuestionsResult, TutorVerifyResult } from '../shared/api'
import type { Content } from '../shared/types'

// The PrepApi for a browser: the same calls the Mac window makes over IPC, sent
// to the Mac over HTTP. The assistant and the tutor's generate and verify are
// not offered; the pages never show them in a browser.

const MAC_ONLY = 'This runs on the Mac, not on the phone.'

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = await fetch(`./api/call/${channel}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  const body = (await res.json().catch(() => null)) as { ok: boolean; result?: T; error?: string } | null
  if (!res.ok || !body?.ok) throw new Error(body?.error ?? `request failed (${res.status})`)
  return body.result as T
}

/** One shared EventSource; the browser reconnects it by itself. */
function listen() {
  const subs = { content: new Set<() => void>(), progress: new Set<(key: string) => void>() }
  let source: EventSource | null = null
  let opened = false
  const ensure = () => {
    if (source) return
    source = new EventSource('./api/events')
    source.addEventListener('hello', () => {
      // A reconnect may have missed writes: ask everyone to re-read.
      if (opened) subs.progress.forEach((cb) => cb('*'))
      opened = true
    })
    source.addEventListener('content', () => subs.content.forEach((cb) => cb()))
    source.addEventListener('progress', (e) => {
      const key = (JSON.parse((e as MessageEvent<string>).data) as { key: string }).key
      subs.progress.forEach((cb) => cb(key))
    })
  }
  return {
    onContent(cb: () => void) {
      ensure()
      subs.content.add(cb)
      return () => void subs.content.delete(cb)
    },
    onProgress(cb: (key: string) => void) {
      ensure()
      subs.progress.add(cb)
      const visible = () => document.visibilityState === 'visible' && cb('*')
      document.addEventListener('visibilitychange', visible)
      return () => {
        subs.progress.delete(cb)
        document.removeEventListener('visibilitychange', visible)
      }
    },
  }
}

export function createWebApi(): PrepApi {
  const events = listen()
  const macOnly = () => Promise.reject(new Error(MAC_ONLY))
  const none = () => () => {}
  return {
    content: {
      get: async () => {
        const res = await fetch('./api/content')
        if (!res.ok) throw new Error(`could not load the library (${res.status})`)
        return (await res.json()) as Content
      },
      onChanged: (cb) =>
        events.onContent(() => {
          void fetch('./api/content')
            .then((r) => r.json() as Promise<Content>)
            .then(cb)
        }),
    },
    progress: {
      get: (key) => call<string | null>('progress:get', key),
      set: (key, value) => call<void>('progress:set', key, value),
      remove: () => Promise.resolve(),
      onChanged: (cb) => events.onProgress(cb),
    },
    agent: {
      run: macOnly,
      cancel: () => Promise.resolve(),
      apply: macOnly,
      discard: () => Promise.resolve(),
      undo: macOnly,
      status: () => Promise.resolve({ agyPath: null, undoable: 0, busy: false }),
      onProgress: none,
      memory: () => Promise.resolve([]),
      forget: () => Promise.resolve(),
    },
    tutor: {
      questions: (lessonId) => call('tutor:questions', lessonId),
      generate: () => Promise.resolve<TutorQuestionsResult>({ ok: false, error: 'Questions are generated on the Mac.' }),
      clearQuestions: () => Promise.resolve(),
      verify: () => Promise.resolve<TutorVerifyResult>({ ok: false, error: MAC_ONLY }),
      cancel: () => Promise.resolve(),
      onProgress: none,
    },
    onMenu: none,
  }
}
