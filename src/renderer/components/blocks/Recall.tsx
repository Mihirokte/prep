import { createContext, useContext, useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store'
import { rateRecall } from '../../store/progressSlice'
import { useInView } from './hooks'

// ```recall — self-check cards. The same cards feed the Review page, where
// they come back on a Leitner schedule.

export interface RecallPair {
  q: string
  a: string
}

export function parseRecall(src: string): RecallPair[] {
  const out: RecallPair[] = []
  let cur: { q: string; a: string; mode: 'q' | 'a' } | null = null
  for (const raw of src.split('\n')) {
    const q = /^Q\s*:\s*(.*)$/.exec(raw)
    const a = /^A\s*:\s*(.*)$/.exec(raw)
    if (q) {
      if (cur) out.push({ q: cur.q.trim(), a: cur.a.trim() })
      cur = { q: q[1], a: '', mode: 'q' }
    } else if (a && cur) {
      cur.a = a[1]
      cur.mode = 'a'
    } else if (cur && raw.trim()) {
      if (cur.mode === 'q') cur.q += ' ' + raw.trim()
      else cur.a += ' ' + raw.trim()
    }
  }
  if (cur) out.push({ q: cur.q.trim(), a: cur.a.trim() })
  return out.filter((p) => p.q && p.a)
}

/** Short stable hash of a question, so a card keeps its schedule if a lesson is reordered. */
export function cardId(scope: string, question: string): string {
  let h = 2166136261
  for (let i = 0; i < question.length; i++) {
    h ^= question.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${scope}:${(h >>> 0).toString(36)}`
}

/** The lesson the markdown belongs to; recall cards are scheduled under it. */
export const RecallScope = createContext<string>('free')

export function RateButtons({ id, onRated }: { id: string; onRated?: () => void }) {
  const dispatch = useAppDispatch()
  const rate = (good: boolean) => {
    dispatch(rateRecall({ id, good }))
    onRated?.()
  }
  return (
    <div className="flex gap-3">
      <button type="button" className="chip" onClick={() => rate(false)}>
        Again
      </button>
      <button type="button" className="chip" onClick={() => rate(true)}>
        Got it
      </button>
    </div>
  )
}

export function RecallDeck({ pairs }: { pairs: RecallPair[] }) {
  const scope = useContext(RecallScope)
  const [i, setI] = useState(0)
  const [open, setOpen] = useState(false)
  const [ref, seen] = useInView<HTMLDivElement>(true)
  const card = pairs[i]
  const id = cardId(scope, card?.q ?? '')
  const state = useAppSelector((s) => s.progress.recall?.[id])

  useEffect(() => setOpen(false), [i])
  if (!card) return null
  const last = i === pairs.length - 1

  return (
    <section ref={ref} aria-label="Self-check" className={`my-10 ${seen ? 'rise' : 'opacity-0'}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="label text-ink">Check yourself</span>
        <span className="label num">
          {i + 1}/{pairs.length}
        </span>
      </div>
      <div className="cast-sm">
        <div className="panel px-7 py-6">
          <p className="font-display text-[24px] leading-[1.15]">{card.q}</p>
          {open ? (
            <div className="rise mt-5 border-t border-hair pt-5">
              <p>{card.a}</p>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <RateButtons id={id} onRated={() => (last ? setI(0) : setI(i + 1))} />
                {state && (
                  <span className="label">
                    Box {state.box}/5, seen {state.seen}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <button type="button" className="chip mt-5" onClick={() => setOpen(true)}>
              Reveal answer
            </button>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2" role="tablist" aria-label="Cards">
        {pairs.map((_, k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === i}
            aria-label={`Card ${k + 1}`}
            onClick={() => setI(k)}
            className={`h-2 w-6 border border-ink ${k === i ? 'bg-ink' : 'bg-transparent hover:border-brand'}`}
          />
        ))}
      </div>
    </section>
  )
}
