import { useEffect, useMemo, useState } from 'react'
import { lessonQuestions, type McqQuestion, type QuestionSet, type RecallQuestion } from '../../shared/tutor'
import type { Lesson } from '../../shared/types'
import { Button } from '../ui/button'
import { cn } from '../lib/utils'
import { useTutorLine } from './Feedback'

// The Questions tab: the lesson's own questions until you generate a set, then
// the generated set. Generation runs through the tutor graph in the main
// process; every generated question quotes the lesson.

function Mcq({ item, n, onAnswer }: { item: McqQuestion; n: number; onAnswer: (right: boolean) => void }) {
  const [pick, setPick] = useState<number | null>(null)
  const done = pick !== null
  return (
    <div className="panel p-5" data-question="mcq">
      <p className="label mb-1">Question {n}</p>
      <p className="font-semibold">{item.q}</p>
      <div className="mt-4 flex flex-col gap-2" role="group" aria-label={`Options for question ${n}`}>
        {item.options.map((o, i) => {
          const right = i === item.answer
          return (
            <button
              key={i}
              type="button"
              disabled={done}
              aria-pressed={pick === i}
              onClick={() => {
                setPick(i)
                onAnswer(right)
              }}
              className={cn(
                'rounded-md border px-4 py-2 text-left transition-colors',
                !done && 'border-edge hover:bg-wash',
                done && right && 'border-success text-success',
                done && !right && pick === i && 'border-danger text-danger',
                done && !right && pick !== i && 'border-hair text-ink',
              )}
            >
              {o}
            </button>
          )
        })}
      </div>
      {done && (
        <div className="rise mt-4 border-t border-hair pt-4" aria-live="polite">
          <p className={cn('font-semibold', pick === item.answer ? 'text-success' : 'text-danger')}>{pick === item.answer ? 'Correct' : 'Not quite'}</p>
          <p className="mt-1">{item.why}</p>
          {item.quote && <p className="label mt-3">From the lesson: "{item.quote}"</p>}
        </div>
      )}
    </div>
  )
}

function Recall({ item, n }: { item: RecallQuestion; n: number }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="panel p-5" data-question="recall">
      <p className="label mb-1">Question {n}</p>
      <p className="font-semibold">{item.q}</p>
      {shown ? (
        <p className="rise mt-3 border-t border-hair pt-3">{item.a}</p>
      ) : (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setShown(true)}>
          Show answer
        </Button>
      )}
    </div>
  )
}

export function LessonQuestions({ lesson }: { lesson: Lesson }) {
  const own = useMemo(() => lessonQuestions(lesson), [lesson])
  const [generated, setGenerated] = useState<QuestionSet | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [round, setRound] = useState(0)
  const [score, setScore] = useState({ right: 0, answered: 0 })
  const line = useTutorLine()

  useEffect(() => {
    let live = true
    void window.prep.tutor.questions(lesson.id).then((s) => live && setGenerated(s))
    return () => {
      live = false
    }
  }, [lesson.id])

  const items = generated?.questions ?? own
  const mcqs = items.filter((q) => q.kind === 'mcq').length
  const restart = () => {
    setRound((r) => r + 1)
    setScore({ right: 0, answered: 0 })
  }

  const generate = async () => {
    setBusy(true)
    setError('')
    const r = await window.prep.tutor.generate(lesson.id)
    setBusy(false)
    if (r.ok) {
      setGenerated(r.set)
      restart()
    } else setError(r.error)
  }

  const restoreOwn = async () => {
    await window.prep.tutor.clearQuestions(lesson.id)
    setGenerated(null)
    restart()
  }

  return (
    <section aria-label="Questions" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label" data-question-source={generated ? 'generated' : 'lesson'}>
          {items.length === 0
            ? 'This topic has no questions yet.'
            : generated
              ? `${items.length} generated questions, ${new Date(generated.at ?? '').toLocaleDateString()}`
              : `${items.length} questions from this lesson`}
          {mcqs > 0 && score.answered > 0 && `. ${score.right} of ${score.answered} right`}
        </p>
        <div className="flex items-center gap-2">
          {generated && own.length > 0 && !busy && (
            <Button variant="ghost" size="sm" onClick={() => void restoreOwn()}>
              Use the lesson's questions
            </Button>
          )}
          {busy ? (
            <Button variant="outline" size="sm" onClick={() => void window.prep.tutor.cancel()}>
              Cancel
            </Button>
          ) : (
            <Button variant={items.length ? 'outline' : 'default'} size="sm" onClick={() => void generate()}>
              {items.length ? 'Generate new questions' : 'Generate questions'}
            </Button>
          )}
        </div>
      </div>
      {busy && (
        <p className="label" role="status" aria-live="polite">
          {line || 'Starting'}. This takes about a minute.
        </p>
      )}
      {error && (
        <p className="text-danger" role="alert">
          {error}
        </p>
      )}
      {items.map((q, i) =>
        q.kind === 'mcq' ? (
          <Mcq key={`${round}-${i}`} item={q} n={i + 1} onAnswer={(right) => setScore((s) => ({ right: s.right + (right ? 1 : 0), answered: s.answered + 1 }))} />
        ) : (
          <Recall key={`${round}-${i}`} item={q} n={i + 1} />
        ),
      )}
      {mcqs > 0 && score.answered === mcqs && (
        <div className="flex items-center gap-3">
          <p className="font-semibold">
            {score.right} of {mcqs} right.
          </p>
          <Button variant="outline" size="sm" onClick={restart}>
            Try again
          </Button>
        </div>
      )}
    </section>
  )
}
