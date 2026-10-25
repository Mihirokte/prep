import { type KeyboardEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import type { AgentResult, AskContext, MemoryDelta, TranscriptEntry } from '../../shared/api'
import type { Change } from '../../shared/ops'
import { Button } from '../ui/button'
import { ChangeRow, Remembered } from './Assistant'
import Markdown from './Markdown'
import { pixelText } from './pixelText'

// Ask about what you are reading: select text on a page and an "Ask" button
// appears at the end of the selection. It opens a small panel where a question
// gets a teaching answer, and a change request or feedback becomes a plan to
// review (Apply / Discard, undoable like any other plan). What the reader says
// about how they learn is saved to the assistant's memory.

const MIN_CHARS = 2
const PANEL_W = 400

interface Anchor {
  x: number
  top: number
  bottom: number
}

type Turn =
  | { kind: 'user'; text: string }
  | { kind: 'answer'; text: string; memory?: MemoryDelta }
  | { kind: 'error'; text: string }
  | { kind: 'plan'; planId: string; reply: string; changes: Change[]; memory?: MemoryDelta; state: 'pending' | 'applying' | 'applied' | 'discarded' | 'failed'; outcome?: string }

/** The page and record the selection belongs to. */
function contextFor(hash: string, quote: string): AskContext {
  const m = /^#\/study\/([^/]+)\/([^/]+)$/.exec(hash)
  if (m) return { kind: 'lesson', courseKey: decodeURIComponent(m[1]), lessonId: decodeURIComponent(m[2]), quote }
  return { kind: 'page', route: hash || '#/', quote }
}

/** Selections inside fields, the code editor and controls are not passages. */
const ignored = (n: Node | null) => {
  const el = n instanceof Element ? n : n?.parentElement
  return Boolean(el?.closest('input, textarea, select, button, .cm-editor, [data-ask-panel]'))
}

function transcriptOf(turns: Turn[]): TranscriptEntry[] {
  return turns.map((t) =>
    t.kind === 'user'
      ? { role: 'user', text: t.text }
      : t.kind === 'plan'
        ? { role: 'assistant', text: t.reply }
        : { role: 'assistant', text: t.text },
  )
}

export default function SelectionAsk({ root, hash }: { root: RefObject<HTMLElement | null>; hash: string }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [quote, setQuote] = useState('')
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [progress, setProgress] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setAnchor(null)
    setTurns([])
    setText('')
  }, [])

  // A new page closes the panel (unless a command is still running).
  useEffect(() => {
    if (!busy) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash])

  useEffect(() => window.prep.agent.onProgress(setProgress), [])

  useEffect(() => {
    if (!busy) return
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, busy])

  // Show the Ask button at the end of a fresh selection inside the page.
  useEffect(() => {
    const onUp = () => {
      if (open) return
      // Let the browser settle the selection (a click inside it collapses it).
      requestAnimationFrame(() => {
        const sel = window.getSelection()
        const area = root.current
        const picked = sel?.toString().replace(/\s+/g, ' ').trim() ?? ''
        if (!sel || sel.isCollapsed || !area || picked.length < MIN_CHARS) return setAnchor(null)
        if (!area.contains(sel.anchorNode) || !area.contains(sel.focusNode) || ignored(sel.anchorNode) || ignored(sel.focusNode))
          return setAnchor(null)
        const rects = sel.getRangeAt(0).getClientRects()
        const last = rects[rects.length - 1] ?? sel.getRangeAt(0).getBoundingClientRect()
        const first = rects[0] ?? last
        setQuote(picked)
        setAnchor({ x: last.right, top: first.top, bottom: last.bottom })
      })
    }
    const onScroll = () => {
      if (!open) setAnchor(null)
    }
    document.addEventListener('pointerup', onUp)
    document.addEventListener('keyup', onUp)
    const area = root.current
    area?.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('keyup', onUp)
      area?.removeEventListener('scroll', onScroll)
    }
  }, [root, open])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    // A click outside closes the panel, unless a command is still running.
    const onDown = (e: PointerEvent) => {
      if (!busy && !(e.target instanceof Element && e.target.closest('[data-ask-panel]'))) close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, busy, close])

  const send = async () => {
    const message = text.trim()
    if (!message || busy) return
    const transcript = transcriptOf(turns)
    setTurns((t) => [...t, { kind: 'user', text: message }])
    setText('')
    setElapsed(0)
    setProgress('')
    setBusy(true)
    const r: AgentResult = await window.prep.agent
      .run({ message, transcript, context: contextFor(hash, quote) })
      .catch((e: unknown) => ({ kind: 'error', message: e instanceof Error ? e.message : String(e) }))
    setBusy(false)
    const memory = r.kind === 'error' ? undefined : { remembered: r.remembered, forgotten: r.forgotten }
    setTurns((t) => [
      ...t,
      r.kind === 'answer'
        ? { kind: 'answer', text: r.reply, memory }
        : r.kind === 'proposal'
          ? { kind: 'plan', planId: r.id, reply: r.reply, changes: r.changes, memory, state: 'pending' }
          : { kind: 'error', text: r.message },
    ])
    inputRef.current?.focus()
  }

  const setPlan = (i: number, next: Partial<Extract<Turn, { kind: 'plan' }>>) =>
    setTurns((ts) => ts.map((t, k) => (k === i && t.kind === 'plan' ? { ...t, ...next } : t)))

  const apply = async (i: number, planId: string) => {
    setPlan(i, { state: 'applying' })
    const r = await window.prep.agent.apply(planId)
    setPlan(i, r.ok ? { state: 'applied', outcome: r.summary } : { state: 'failed', outcome: r.error })
  }

  const discard = async (i: number, planId: string) => {
    await window.prep.agent.discard(planId)
    setPlan(i, { state: 'discarded' })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  if (!anchor) return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  // Keep the panel inside the content pane, clear of the sidebar and the assistant.
  const pane = root.current?.getBoundingClientRect()
  const minX = (pane?.left ?? 0) + 12
  const maxX = (pane?.right ?? vw) - 12
  const left = Math.max(minX, Math.min(anchor.x - PANEL_W / 2, maxX - PANEL_W))
  // Open below the selection when there is room, otherwise above it.
  const below = vh - anchor.bottom > 360 || anchor.top < 360

  if (!open)
    return (
      <button
        type="button"
        data-ask-panel
        // Keep the selection: a mousedown on the button would clear it.
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => setOpen(true)}
        style={{ left: Math.min(anchor.x + 4, maxX - 64), top: anchor.bottom + 6 }}
        className="notch fixed z-50 inline-flex h-8 items-center bg-ink px-3 font-label text-[12px] uppercase tracking-[0.12em] text-paper shadow-[0_2px_0_var(--edge)] transition-colors hover:bg-brand"
      >
        Ask
      </button>
    )

  return (
    <div
      data-ask-panel
      role="dialog"
      aria-label="Ask about this passage"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          close()
        }
      }}
      style={{ left, width: PANEL_W, ...(below ? { top: anchor.bottom + 8 } : { bottom: vh - anchor.top + 8 }) }}
      className="panel cast-sm fixed z-50 flex max-h-[min(560px,70vh)] flex-col bg-paper"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-hair py-2 pl-4 pr-2">
        <p className="label flex-1 !text-ink">Ask about this</p>
        <button type="button" className="tool" onClick={close} aria-label="Close">
          Close
        </button>
      </div>

      <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        <blockquote className="m-0 line-clamp-3 border-l-2 border-ink pl-3 text-ink-2">{pixelText(quote)}</blockquote>
        <div className="mt-3 flex flex-col gap-3">
          {turns.map((t, i) => {
            if (t.kind === 'user')
              return (
                <p key={i} className="notch ml-8 self-end whitespace-pre-wrap border border-hair-strong bg-surface px-3 py-2">
                  {t.text}
                </p>
              )
            if (t.kind === 'error')
              return (
                <p key={i} className="notch whitespace-pre-wrap border border-brand px-3 py-2">
                  <span className="sr-only">Error: </span>
                  {t.text}
                </p>
              )
            if (t.kind === 'answer')
              return (
                <div key={i}>
                  <Markdown body={t.text} className="[&>*+*]:!mt-3" />
                  <Remembered memory={t.memory} />
                </div>
              )
            return (
              <div key={i}>
                {t.reply && <Markdown body={t.reply} className="[&>*+*]:!mt-3" />}
                <Remembered memory={t.memory} />
                <div className="panel mt-3 overflow-hidden">
                  <ul className="list m-0 list-none p-0">
                    {t.changes.map((c, k) => (
                      <ChangeRow key={k} c={c} />
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-3 border-t border-hair px-3 py-3">
                    {t.state === 'pending' && (
                      <>
                        <Button size="sm" onClick={() => apply(i, t.planId)}>
                          Apply
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => discard(i, t.planId)}>
                          Discard
                        </Button>
                      </>
                    )}
                    {t.state === 'applying' && <span className="label">Applying</span>}
                    {t.state === 'applied' && <span className="label !text-ink">Applied. Undo is in the assistant panel.</span>}
                    {t.state === 'discarded' && <span className="label">Discarded</span>}
                    {t.state === 'failed' && <span className="whitespace-pre-wrap text-brand">{t.outcome}</span>}
                  </div>
                </div>
              </div>
            )
          })}
          {busy && (
            <div>
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
        className="shrink-0 border-t border-hair p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <label htmlFor="ask-input" className="sr-only">
          Question or change
        </label>
        <textarea
          ref={inputRef}
          id="ask-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask a question, or say what to change"
          rows={2}
          className="field-sizing-content max-h-32 min-h-14 w-full resize-none border border-hair-strong bg-transparent px-3 py-2 leading-7 outline-none placeholder:text-ink-2 focus:border-ink"
        />
        <div className="mt-2 flex items-center gap-3">
          <p className="label flex-1">Enter sends. Shift+Enter adds a line.</p>
          <Button type="submit" size="sm" disabled={busy || !text.trim()}>
            Send
          </Button>
        </div>
      </form>
    </div>
  )
}
