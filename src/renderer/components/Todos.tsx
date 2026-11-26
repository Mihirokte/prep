import { useEffect, useRef, useState } from 'react'
import { useTodos } from '../useSync'
import { Button } from '../ui/button'
import { cn } from '../lib/utils'

/** The phone's to-do list: a full-screen sheet opened from the toolbar. It
 *  replaces the assistant there. Items sync with the Mac. */
export default function Todos({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, loaded, add, toggle, remove, clearDone } = useTodos()
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const open1 = items.filter((t) => !t.done)
  const done = items.filter((t) => t.done)

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  if (!open) return null
  return (
    <section
      id="todos"
      role="dialog"
      aria-modal="true"
      aria-label="To-do list"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      className="fixed inset-0 z-50 flex flex-col bg-paper pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
    >
      <div className="flex h-[52px] shrink-0 items-center gap-2 pl-4 pr-2">
        <h2 className="text-[20px]">To-do</h2>
        <span className="flex-1" />
        {done.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearDone}>
            Clear done
          </Button>
        )}
        <button type="button" className="tool" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>

      <form
        className="shrink-0 px-4 pb-3"
        onSubmit={(e) => {
          e.preventDefault()
          add(text)
          setText('')
        }}
      >
        <label htmlFor="todo-input" className="sr-only">
          New to-do
        </label>
        <div className="panel flex items-center gap-2 p-2 pl-3">
          <input
            ref={input}
            id="todo-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            enterKeyHint="done"
            autoComplete="off"
            placeholder="Add something to do..."
            className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-2"
          />
          <Button type="submit" size="sm" disabled={!text.trim()}>
            Add
          </Button>
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" aria-live="polite">
        {loaded && items.length === 0 && <p className="px-1 py-6 text-ink-2">Nothing here yet. Add the next thing you want to read or practise.</p>}
        <ul className="list m-0 list-none p-0">
          {[...open1, ...done].map((t) => (
            <li key={t.id} className="flex items-center gap-1 border-b border-hair last:border-b-0">
              <label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2">
                <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} className="size-5 shrink-0 accent-[var(--fill)]" />
                <span className={cn('min-w-0 break-words', t.done && 'text-ink-2 line-through')}>{t.text}</span>
              </label>
              <button type="button" className="tool" onClick={() => remove(t.id)} aria-label={`Delete: ${t.text}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
