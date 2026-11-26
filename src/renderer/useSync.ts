import { useEffect, useState } from 'react'
import { PROGRESS_KEY, mergeProgress, parsePersisted } from '../shared/progressMerge'
import { TODOS_KEY, type Todo, mergeTodos, newTodoId, parseTodos } from '../shared/todos'
import { store, useAppDispatch } from './store'
import { importAll, type ProgressState } from './store/progressSlice'

/** Keeps this window in step with progress written from another device. Other
 *  devices' newer records are merged into the live state, never the reverse. */
export function useProgressSync(): void {
  const dispatch = useAppDispatch()
  useEffect(
    () =>
      window.prep.progress.onChanged((key) => {
        if (key !== PROGRESS_KEY && key !== '*') return
        void window.prep.progress.get(PROGRESS_KEY).then((raw) => {
          const incoming = parsePersisted(raw)
          if (!incoming) return
          const { lessons, problems, recall } = store.getState().progress
          const current = { lessons, problems, recall: recall ?? {} }
          // Only dispatch when something is actually newer, or a write would echo forever.
          if (JSON.stringify(mergeProgress(current, incoming)) !== JSON.stringify(current)) dispatch(importAll(incoming as ProgressState))
        })
      }),
    [dispatch],
  )
}

const now = () => new Date().toISOString()

/** The to-do list: loaded from the Mac, written back as a whole, merged by item. */
export function useTodos() {
  const [all, setAll] = useState<Todo[] | null>(null)

  useEffect(() => {
    let live = true
    const load = () =>
      void window.prep.progress.get(TODOS_KEY).then((raw) => {
        if (live) setAll((cur) => mergeTodos(cur ?? [], parseTodos(raw)))
      })
    load()
    const off = window.prep.progress.onChanged((key) => {
      if (key === TODOS_KEY || key === '*') load()
    })
    return () => {
      live = false
      off()
    }
  }, [])

  const commit = (next: Todo[]) => {
    setAll(next)
    void window.prep.progress.set(TODOS_KEY, JSON.stringify(next))
  }
  const edit = (id: string, change: Partial<Todo>) => commit((all ?? []).map((t) => (t.id === id ? { ...t, ...change, updatedAt: now() } : t)))

  return {
    loaded: all !== null,
    items: (all ?? []).filter((t) => !t.deleted),
    add: (text: string) => {
      const clean = text.trim().slice(0, 300)
      if (clean) commit([...(all ?? []), { id: newTodoId(), text: clean, done: false, updatedAt: now() }])
    },
    toggle: (id: string) => edit(id, { done: !(all ?? []).find((t) => t.id === id)?.done }),
    remove: (id: string) => edit(id, { deleted: true }),
    clearDone: () => commit((all ?? []).map((t) => (t.done && !t.deleted ? { ...t, deleted: true as const, updatedAt: now() } : t))),
  }
}
