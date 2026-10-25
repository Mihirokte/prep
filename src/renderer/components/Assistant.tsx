import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { pixelText } from './pixelText'
import type { AgentResult, AgentStatus, MemoryDelta, TranscriptEntry } from '../../shared/api'
import type { MemoryNote } from '../../shared/memory'
import type { Change } from '../../shared/ops'
import type { SourceRef } from '../../shared/sources'
import { cn } from '../lib/utils'
import { Button } from '../ui/button'
import Markdown from './Markdown'

// The assistant: natural-language create / read / update / delete over every
// record in the store. A command becomes a plan the main process has already
// validated; nothing changes until Apply, and every applied plan can be undone.

type PlanState = 'pending' | 'applying' | 'applied' | 'discarded' | 'failed'

type Item =
  | { kind: 'user'; id: number; text: string }
  | { kind: 'answer'; id: number; text: string; sources?: SourceRef[]; memory?: MemoryDelta }
  | { kind: 'error'; id: number; text: string }
  | { kind: 'note'; id: number; text: string }
  | {
      kind: 'plan'
      id: number
      planId: string
      reply: string
      changes: Change[]
      sources?: SourceRef[]
      memory?: MemoryDelta
      state: PlanState
      outcome?: string
    }

let nextId = 1

const KIND: Record<Change['kind'], { label: string }> = {
  create: { label: 'Create' },
  update: { label: 'Update' },
  delete: { label: 'Delete' },
  move: { label: 'Move' },
  link: { label: 'Link' },
  unlink: { label: 'Unlink' },
}

function toTranscript(items: Item[]): TranscriptEntry[] {
  const out: TranscriptEntry[] = []
  for (const it of items) {
    if (it.kind === 'user') out.push({ role: 'user', text: it.text })
    else if (it.kind === 'answer') out.push({ role: 'assistant', text: it.text })
    else if (it.kind === 'error') out.push({ role: 'assistant', text: `(failed) ${it.text}` })
    else if (it.kind === 'plan') {
      out.push({ role: 'assistant', text: it.reply })
      if (it.state === 'applied' && it.outcome) out.push({ role: 'applied', text: it.outcome })
      if (it.state === 'discarded') out.push({ role: 'applied', text: '(the user discarded this plan)' })
    } else out.push({ role: 'applied', text: it.text })
  }
  return out
}

function fromResult(r: AgentResult): Item {
  const memory = r.kind === 'error' ? undefined : { remembered: r.remembered, forgotten: r.forgotten }
  if (r.kind === 'answer') return { kind: 'answer', id: nextId++, text: r.reply, sources: r.sources, memory }
  if (r.kind === 'error') return { kind: 'error', id: nextId++, text: r.message }
  return { kind: 'plan', id: nextId++, planId: r.id, reply: r.reply, changes: r.changes, sources: r.sources, memory, state: 'pending' }
}

const shortUrl = (u: string) => {
  try {
    const url = new URL(u)
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return u
  }
}

/** The pages and files a reply was built from. */
export function Sources({ sources }: { sources?: SourceRef[] }) {
  if (!sources?.length) return null
  return (
    <div className="mt-3 px-1">
      <p className="label">Sources read</p>
      <ul className="m-0 mt-1 list-none p-0">
        {sources.map((s) => (
          <li key={s.url} className="break-words leading-7">
            <a href={s.url} target="_blank" rel="noopener">
              {pixelText(shortUrl(s.url))}
            </a>
            {!s.ok && <span className="text-ink-2"> (could not be read)</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Notes a reply saved to (or dropped from) the learner memory, each with a way to take it back. */
export function Remembered({ memory }: { memory?: MemoryDelta }) {
  const [gone, setGone] = useState<string[]>([])
  const notes: MemoryNote[] = (memory?.remembered ?? []).filter((n) => !gone.includes(n.id))
  const dropped = memory?.forgotten?.length ?? 0
  if (!notes.length && !dropped && !gone.length) return null
  return (
    <div className="mt-3 px-1">
      {notes.length > 0 && <p className="label">Saved to memory</p>}
      <ul className="m-0 mt-1 list-none p-0">
        {notes.map((n) => (
          <li key={n.id} className="flex items-baseline gap-3 leading-7">
            <span className="min-w-0 flex-1 break-words">{pixelText(n.text)}</span>
            <button
              type="button"
              className="tool"
              onClick={() => void window.prep.agent.forget(n.id).then(() => setGone((g) => [...g, n.id]))}
            >
              Forget
            </button>
          </li>
        ))}
      </ul>
      {gone.length > 0 && <p className="text-ink-2">Forgot {gone.length === 1 ? 'one note' : `${gone.length} notes`}.</p>}
      {dropped > 0 && <p className="text-ink-2">Dropped {dropped === 1 ? 'one note' : `${dropped} notes`} from memory.</p>}
    </div>
  )
}

/** Everything the assistant remembers about the learner, newest first, each removable. */
function MemoryList() {
  const [notes, setNotes] = useState<MemoryNote[] | null>(null)
  useEffect(() => {
    void window.prep.agent.memory().then(setNotes)
  }, [])
  if (!notes) return null
  const forget = (id: string) => void window.prep.agent.forget(id).then(() => setNotes((ns) => (ns ?? []).filter((n) => n.id !== id)))
  return (
    <section aria-label="Memory" className="mb-4 border-b border-hair pb-4">
      <p className="label">What the assistant remembers about you</p>
      {notes.length === 0 ? (
        <p className="mt-2 text-ink-2">
          Nothing yet. Tell it how you like to learn (for example, "always show a worked example first") and it saves that here.
        </p>
      ) : (
        <ul className="m-0 mt-2 list-none p-0">
          {[...notes].reverse().map((n) => (
            <li key={n.id} className="flex items-baseline gap-3 border-t border-hair py-2 leading-7 first:border-t-0">
              <span className="min-w-0 flex-1 break-words">{pixelText(n.text)}</span>
              <span className="label shrink-0">{n.at}</span>
              <button type="button" className="tool shrink-0" onClick={() => forget(n.id)}>
                Forget
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function ChangeRow({ c }: { c: Change }) {
  const destructive = c.kind === 'delete' || c.kind === 'unlink'
  const { label } = KIND[c.kind]
  return (
    <li className="flex gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <span className={cn('label', destructive ? '!text-brand' : '!text-ink')}>{label}</span>
          <span className="label">{c.entity}</span>
        </div>
        <p className="mt-1 break-words leading-6">{pixelText(c.label)}</p>
        {c.fields && c.fields.length > 0 && (
          <dl className="mt-2">
            {c.fields.map((f, i) => (
              <div key={i} className="mt-2">
                <dt className="label">{f.field}</dt>
                <dd className="m-0 break-words">
                  {f.before !== undefined && <span className="text-ink-2 line-through">{pixelText(f.before)}</span>}
                  {f.before !== undefined && f.after !== undefined && <span aria-label="becomes" className="text-ink-2"> {'->'} </span>}
                  {pixelText(f.after ?? '')}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {c.notes?.map((n) => (
          <p key={n} className="mt-1 text-ink-2">
            {pixelText(n)}
          </p>
        ))}
      </div>
    </li>
  )
}

export default function Assistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [progress, setProgress] = useState('')
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [showMemory, setShowMemory] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const applyRef = useRef<HTMLButtonElement>(null)

  useEffect(() => window.prep.agent.onProgress(setProgress), [])

  const refreshStatus = useCallback(() => {
    window.prep.agent.status().then(setStatus)
  }, [])

  useEffect(() => {
    if (!open) return
    refreshStatus()
    inputRef.current?.focus()
  }, [open, refreshStatus])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
    const last = items[items.length - 1]
    if (last?.kind === 'plan' && last.state === 'pending') applyRef.current?.focus()
  }, [items, busy])

  useEffect(() => {
    if (!busy) return
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])

  const patch = (id: number, next: Partial<Extract<Item, { kind: 'plan' }>>) =>
    setItems((xs) => xs.map((x) => (x.id === id && x.kind === 'plan' ? { ...x, ...next } : x)))

  const send = async () => {
    const message = text.trim()
    if (!message || busy) return
    const transcript = toTranscript(items)
    setItems((xs) => [...xs, { kind: 'user', id: nextId++, text: message }])
    setText('')
    setElapsed(0)
    setProgress('')
    setBusy(true)
    const result: AgentResult = await window.prep.agent
      .run({ message, transcript })
      .catch((e: unknown) => ({ kind: 'error', message: e instanceof Error ? e.message : String(e) }))
    setBusy(false)
    setItems((xs) => [...xs, fromResult(result)])
    refreshStatus()
  }

  const apply = async (item: Extract<Item, { kind: 'plan' }>) => {
    patch(item.id, { state: 'applying' })
    const r = await window.prep.agent.apply(item.planId)
    patch(item.id, r.ok ? { state: 'applied', outcome: r.summary } : { state: 'failed', outcome: r.error })
    refreshStatus()
    inputRef.current?.focus()
  }

  const discard = async (item: Extract<Item, { kind: 'plan' }>) => {
    await window.prep.agent.discard(item.planId)
    patch(item.id, { state: 'discarded' })
    inputRef.current?.focus()
  }

  const undo = async () => {
    const r = await window.prep.agent.undo()
    setItems((xs) => [...xs, { kind: 'note', id: nextId++, text: r.ok ? `Undone: ${r.summary}` : r.error }])
    refreshStatus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <aside
      id="assistant"
      aria-label="Assistant"
      hidden={!open}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      className={cn('h-full w-[420px] max-w-full shrink-0 flex-col border-l border-hair bg-paper', open ? 'flex' : 'hidden')}
    >
      <div className="app-drag flex h-[52px] shrink-0 items-center gap-2 pl-4 pr-2">
        <h2 className="text-[24px]">Assistant</h2>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="no-drag" aria-pressed={showMemory} onClick={() => setShowMemory((v) => !v)}>
          Memory
        </Button>
        {status && status.undoable > 0 && (
          <Button variant="ghost" size="sm" className="no-drag" onClick={undo} disabled={busy}>
            Undo last change
          </Button>
        )}
        <button type="button" className="tool no-drag" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4" aria-live="polite">
        {showMemory && <MemoryList key={items.length} />}
        {status && !status.agyPath && (
          <p className="notch mb-4 border border-brand px-4 py-3">
            The agy CLI was not found, so commands cannot run. Install it to ~/.local/bin, or set agent.agyPath in
            settings.json in the data folder.
          </p>
        )}
        <div className="flex flex-col gap-4">
          {items.map((it) => {
            if (it.kind === 'user')
              return (
                <p
                  key={it.id}
                  className="notch ml-8 self-end whitespace-pre-wrap border border-hair-strong bg-surface px-4 py-2"
                >
                  {it.text}
                </p>
              )
            if (it.kind === 'answer')
              return (
                <div key={it.id}>
                  <Markdown body={it.text} className="px-1 [&>*+*]:!mt-3" />
                  <Sources sources={it.sources} />
                  <Remembered memory={it.memory} />
                </div>
              )
            if (it.kind === 'error' || it.kind === 'note')
              return (
                <p
                  key={it.id}
                  className={cn(
                    'whitespace-pre-wrap',
                    it.kind === 'error' ? 'notch border border-brand px-4 py-3' : 'px-1 text-ink-2',
                  )}
                >
                  {it.kind === 'error' && <span className="sr-only">Error: </span>}
                  {it.text}
                </p>
              )
            return (
              <div key={it.id}>
                {it.reply && <Markdown body={it.reply} className="px-1 [&>*+*]:!mt-3" />}
                <Sources sources={it.sources} />
                <Remembered memory={it.memory} />
                <div className="panel mt-3 overflow-hidden">
                  <ul className="list m-0 list-none p-0">
                    {it.changes.map((c, i) => (
                      <ChangeRow key={i} c={c} />
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-3 border-t border-hair px-3 py-3">
                    {it.state === 'pending' && (
                      <>
                        <Button ref={applyRef} size="sm" onClick={() => apply(it)}>
                          Apply
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => discard(it)}>
                          Discard
                        </Button>
                      </>
                    )}
                    {it.state === 'applying' && (
                      <span className="label flex items-center gap-3">
                        <span className="live-dot" />
                        Applying
                      </span>
                    )}
                    {it.state === 'applied' && <span className="label !text-ink">Applied</span>}
                    {it.state === 'discarded' && <span className="label">Discarded</span>}
                    {it.state === 'failed' && <span className="whitespace-pre-wrap text-brand">{it.outcome}</span>}
                  </div>
                </div>
              </div>
            )
          })}
          {busy && (
            <div className="px-1">
              <div className="label flex items-center gap-3">
                <span className="live-dot" />
                <span>
                  Working <span className="num">{elapsed}s</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => window.prep.agent.cancel()}>
                  Cancel
                </Button>
              </div>
              {progress && <p className="mt-1 break-words leading-7 text-ink-2">{pixelText(progress)}</p>}
            </div>
          )}
        </div>
      </div>

      <form
        className="shrink-0 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">
          Command
        </label>
        <div className="panel flex items-end gap-2 p-2 pl-3">
          <textarea
            ref={inputRef}
            id="assistant-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask or change anything..."
            rows={1}
            className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1 leading-7 outline-none placeholder:text-ink-2"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label="Send"
            className="notch inline-flex h-9 shrink-0 items-center justify-center bg-ink px-4 font-label text-[12px] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-brand disabled:bg-transparent disabled:text-ink-2 disabled:shadow-[inset_0_0_0_1px_var(--edge)]"
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  )
}
