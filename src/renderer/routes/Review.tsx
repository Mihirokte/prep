import { useMemo, useState } from 'react'
import { useModel } from '../model/context'
import type { Model } from '../model/buildModel'
import { useAppDispatch, useAppSelector } from '../store'
import { rateRecall, type RecallCard } from '../store/progressSlice'
import { CardFace, cardId, parseRecall } from '../components/blocks/Recall'
import { Button } from '../ui/button'
import { pixelText } from '../components/pixelText'

interface Card {
  id: string
  q: string
  a: string
  courseKey: string
  lessonId: string
  lessonTitle: string
}

const RECALL_FENCE = /```recall\n([\s\S]*?)```/g

/** Every self-check card in every lesson, keyed the way the lesson deck keys them. */
export function allCards(m: Model): Card[] {
  const out: Card[] = []
  for (const c of m.courses)
    for (const ch of c.chapters)
      for (const l of ch.lessons)
        for (const text of [l.body, l.deeper ?? '']) {
          for (const match of text.matchAll(RECALL_FENCE))
            for (const p of parseRecall(match[1]))
              out.push({ id: cardId(l.id, p.q), q: p.q, a: p.a, courseKey: c.key, lessonId: l.id, lessonTitle: l.title })
        }
  return out
}

/** Cards to review now: due ones first, then unseen cards from lessons the
 * learner has actually completed. A newly installed library contains thousands
 * of cards; admitting all of them at once turns review into an unbounded inbox. */
export function dueCards(
  m: Model,
  recall: Record<string, RecallCard>,
  eligibleLessons: ReadonlySet<string>,
  now = Date.now(),
): Card[] {
  const cards = allCards(m)
  const due = cards.filter((c) => recall[c.id] && new Date(recall[c.id].due).getTime() <= now)
  due.sort((a, b) => new Date(recall[a.id].due).getTime() - new Date(recall[b.id].due).getTime())
  const fresh = cards.filter((c) => !recall[c.id] && eligibleLessons.has(c.lessonId))
  return [...due, ...fresh]
}

export function ReviewPage() {
  const m = useModel()
  const lessons = useAppSelector((s) => s.progress.lessons)
  const recall = useAppSelector((s) => s.progress.recall ?? {})
  const dispatch = useAppDispatch()
  const eligibleLessons = useMemo(
    () => new Set(Object.entries(lessons).filter(([, p]) => p.status === 'read').map(([id]) => id)),
    [lessons],
  )
  // Freeze the session queue when the page opens: rating a card must not reshuffle it.
  const [queue] = useState(() => dueCards(m, recall, eligibleLessons).slice(0, 20).map((c) => c.id))
  const cards = useMemo(() => new Map(allCards(m).map((c) => [c.id, c])), [m])
  const [i, setI] = useState(0)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(0)

  const seen = Object.keys(recall).filter((k) => cards.has(k)).length
  const learned = Object.entries(recall).filter(([k, r]) => cards.has(k) && r.box >= 3).length
  const available = useMemo(
    () => seen + allCards(m).filter((c) => !recall[c.id] && eligibleLessons.has(c.lessonId)).length,
    [m, recall, eligibleLessons, seen],
  )
  const dueNow = useMemo(
    () => dueCards(m, recall, eligibleLessons).filter((c) => recall[c.id]).length,
    [m, recall, eligibleLessons],
  )

  const card = queue[i] ? cards.get(queue[i]) : undefined

  const rate = (good: boolean) => {
    if (!card) return
    dispatch(rateRecall({ id: card.id, good }))
    setDone((d) => d + 1)
    setOpen(false)
    setI((x) => x + 1)
  }

  return (
    <div className="mx-auto max-w-3xl pt-10">
      <h1>Review</h1>

      {/* Key figures are M (24): important, but never as big as the title. */}
      <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-hair py-6 sm:grid-cols-4">
        {[
          ['Available', available],
          ['Started', seen],
          ['Due', dueNow],
          ['Learned', learned],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1">
            <dt className="label">{k}</dt>
            <dd className="num font-semibold text-[20px] leading-none">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-12">
        {card ? (
          <section aria-label="Review card">
            <div className="mb-2 flex items-center justify-between gap-4">
              <span className="label text-ink">
                Card {i + 1} of {queue.length}
              </span>
              <a className="label truncate" href={`#/study/${card.courseKey}/${card.lessonId}`}>
                {card.lessonTitle}
              </a>
            </div>
            <CardFace
              q={pixelText(card.q)}
              a={pixelText(card.a)}
              open={open}
              onReveal={() => setOpen(true)}
              actions={
                <>
                  <Button variant="secondary" onClick={() => rate(false)}>
                    Again
                  </Button>
                  <Button onClick={() => rate(true)}>Got it</Button>
                </>
              }
            />
          </section>
        ) : (
          <section className="border-y border-hair py-10">
            <p className=" font-semibold text-[20px] leading-none">{queue.length === 0 ? 'Nothing due' : 'Session complete'}</p>
            <p className="mt-4 text-ink-2">
              {queue.length === 0
                ? 'Every card is scheduled for later. Cards appear here after you reveal them at the end of a lesson.'
                : `${done} card${done === 1 ? '' : 's'} reviewed. Cards come back after 1, 3, 7, 16 and 35 days as you get them right.`}
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
