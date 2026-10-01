import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRightLeft, ArrowUp, Link2, LoaderCircle, Pencil, Plus, Sparkles, Trash, Undo2, Unlink2, X } from 'lucide-react'
import type { AgentResult, AgentStatus, TranscriptEntry } from '../../shared/api'
import type { Change } from '../../shared/ops'
import { cn } from '../lib/utils'
import { Button } from '../ui/button'
import Markdown from './Markdown'

// The assistant: natural-language create / read / update / delete over every
// record in the store. A command becomes a plan the main process has already
// validated; nothing changes until Apply, and every applied plan can be undone.

type PlanState = 'pending' | 'applying' | 'applied' | 'discarded' | 'failed'

type Item =
  | { kind: 'user'; id: number; text: string }
  | { kind: 'answer'; id: number; text: string }
  | { kind: 'error'; id: number; text: string }
  | { kind: 'note'; id: number; text: string }
  | { kind: 'plan'; id: number; planId: string; reply: string; changes: Change[]; state: PlanState; outcome?: string }

let nextId = 1

const KIND: Record<Change['kind'], { label: string; Icon: typeof Plus }> = {
  create: { label: 'Create', Icon: Plus },
  update: { label: 'Update', Icon: Pencil },
  delete: { label: 'Delete', Icon: Trash },
  move: { label: 'Move', Icon: ArrowRightLeft },
  link: { label: 'Link', Icon: Link2 },
  unlink: { label: 'Unlink', Icon: Unlink2 },
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
  if (r.kind === 'answer') return { kind: 'answer', id: nextId++, text: r.reply }
  if (r.kind === 'error') return { kind: 'error', id: nextId++, text: r.message }
  return { kind: 'plan', id: nextId++, planId: r.id, reply: r.reply, changes: r.changes, state: 'pending' }
}

function ChangeRow({ c }: { c: Change }) {
  const destructive = c.kind === 'delete' || c.kind === 'unlink'
  const { label, Icon } = KIND[c.kind]
  return (
    <li className="flex gap-3 px-4 py-3">
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', destructive ? 'text-destructive' : 'text-brand')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-[0.75rem]">
          <span className={cn('font-medium', destructive ? 'text-destructive' : 'text-foreground')}>{label}</span>
          <span className="text-faint">{c.entity}</span>
        </div>
        <p className="mt-0.5 break-words text-[0.875rem] leading-snug">{c.label}</p>
        {c.fields && c.fields.length > 0 && (
          <dl className="mt-2 text-[0.8125rem] leading-relaxed">
            {c.fields.map((f, i) => (
              <div key={i} className="mt-1.5">
                <dt className="font-mono text-[0.75rem] text-faint">{f.field}</dt>
                <dd className="m-0 break-words">
                  {f.before !== undefined && (
                    <span className="text-faint line-through decoration-faint/70">{f.before}</span>
                  )}
                  {f.before !== undefined && f.after !== undefined && <span aria-label="becomes" className="text-faint"> → </span>}
                  {f.after}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {c.notes?.map((n) => (
          <p key={n} className="mt-1 text-[0.8125rem] text-muted-foreground">
            {n}
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
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const applyRef = useRef<HTMLButtonElement>(null)

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
      className={cn('h-full w-[400px] max-w-full shrink-0 flex-col border-l border-hairline bg-sidebar', open ? 'flex' : 'hidden')}
    >
      <div className="app-drag flex h-[52px] shrink-0 items-center gap-2 pl-4 pr-2">
        <Sparkles aria-hidden="true" className="size-4 text-brand" />
        <h2 className="text-[0.8125rem] font-medium">Assistant</h2>
        <span className="flex-1" />
        {status && status.undoable > 0 && (
          <Button variant="ghost" size="sm" className="no-drag" onClick={undo} disabled={busy}>
            <Undo2 aria-hidden="true" className="size-3.5" />
            Undo last change
          </Button>
        )}
        <button type="button" className="tool no-drag" onClick={onClose} aria-label="Close">
          <X aria-hidden="true" />
          <span className="sr-only">Close</span>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4" aria-live="polite">
        {status && !status.agyPath && (
          <p className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-[0.875rem] leading-relaxed">
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
                  className="ml-8 self-end whitespace-pre-wrap rounded-lg rounded-br-sm bg-card px-4 py-2.5 text-[0.9rem] leading-relaxed shadow-[var(--shadow-panel)]"
                >
                  {it.text}
                </p>
              )
            if (it.kind === 'answer')
              return <Markdown key={it.id} body={it.text} className="px-1 text-[0.9rem] leading-relaxed [&>*+*]:mt-3" />
            if (it.kind === 'error' || it.kind === 'note')
              return (
                <p
                  key={it.id}
                  className={cn(
                    'whitespace-pre-wrap text-[0.875rem] leading-relaxed',
                    it.kind === 'error' ? 'rounded-md bg-destructive/10 px-4 py-3' : 'px-1 text-muted-foreground',
                  )}
                >
                  {it.kind === 'error' && <span className="sr-only">Error: </span>}
                  {it.text}
                </p>
              )
            return (
              <div key={it.id}>
                {it.reply && <Markdown body={it.reply} className="px-1 text-[0.9rem] leading-relaxed [&>*+*]:mt-3" />}
                <div className="panel mt-3 overflow-hidden">
                  <ul className="list m-0 list-none p-0">
                    {it.changes.map((c, i) => (
                      <ChangeRow key={i} c={c} />
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2.5">
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
                      <span className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
                        <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                        Applying…
                      </span>
                    )}
                    {it.state === 'applied' && <span className="text-[0.8125rem] text-brand">Applied</span>}
                    {it.state === 'discarded' && <span className="text-[0.8125rem] text-muted-foreground">Discarded</span>}
                    {it.state === 'failed' && <span className="whitespace-pre-wrap text-[0.8125rem] text-destructive">{it.outcome}</span>}
                  </div>
                </div>
              </div>
            )
          })}
          {busy && (
            <div className="flex items-center gap-3 px-1 text-[0.8125rem] text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin text-brand" />
              <span>
                Working… <span className="num">{elapsed}s</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => window.prep.agent.cancel()}>
                Cancel
              </Button>
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
        <div className="panel flex items-end gap-2 p-1.5 pl-3 focus-within:ring-[3px] focus-within:ring-ring/40">
          <textarea
            ref={inputRef}
            id="assistant-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask or change anything…"
            rows={1}
            className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[0.9rem] leading-relaxed outline-none placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label="Send"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-[background-color,opacity] hover:bg-primary/90 disabled:opacity-40"
          >
            <ArrowUp aria-hidden="true" className="size-4" />
            <span className="sr-only">Send</span>
          </button>
        </div>
      </form>
    </aside>
  )
}
