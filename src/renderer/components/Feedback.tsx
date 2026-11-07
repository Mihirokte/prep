import { useEffect, useState } from 'react'
import type { TutorVerifyResult } from '../../shared/api'
import { Button } from '../ui/button'
import { cn } from '../lib/utils'

/** The tutor's one-line status while a graph runs. */
export function useTutorLine(): string {
  const [line, setLine] = useState('')
  useEffect(() => window.prep.tutor.onProgress(setLine), [])
  return line
}

const VERDICT = {
  correct: { text: 'Correct', cls: 'text-success' },
  partial: { text: 'Partly right', cls: 'text-ink' },
  incorrect: { text: 'Not yet', cls: 'text-danger' },
} as const

/** The Feedback tab: the tutor's review of the code in the editor. */
export function Feedback({
  busy,
  line,
  result,
  patternName,
  onSolved,
  solved,
}: {
  busy: boolean
  line: string
  result: TutorVerifyResult | null
  patternName: (key: string) => string
  onSolved: () => void
  solved: boolean
}) {
  if (busy)
    return (
      <p className="label" role="status" aria-live="polite">
        {line || 'Starting'}. This takes about a minute.
      </p>
    )
  if (!result) return <p className="text-ink-2">Write your approach in the editor, then press Verify. The review shows here.</p>
  if (!result.ok)
    return (
      <p className="text-danger" role="alert">
        {result.error}
      </p>
    )
  const r = result.review
  const v = VERDICT[r.verdict]
  return (
    <div className="flex flex-col gap-6" data-review={r.verdict} aria-live="polite">
      <div>
        <p className={cn('text-[20px] font-semibold', v.cls)}>{v.text}</p>
        <p className="mt-2">{r.summary}</p>
        {result.cached && <p className="label mt-2">Same code as an earlier check, so this is the saved review.</p>}
      </div>

      {r.issues.length > 0 && (
        <section>
          <h3 className="mb-2">What to fix</h3>
          <div className="list">
            {r.issues.map((it, i) => (
              <div key={i} className="flex flex-col gap-1 px-4 py-3">
                {it.snippet && <code className="w-fit rounded bg-wash px-1.5 py-0.5 text-[14px]">{it.snippet}</code>}
                <p>{it.problem}</p>
                <p className="text-ink-2">Fix: {it.fix}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {r.edgeCases.length > 0 && (
        <section>
          <h3 className="mb-2">Cases to check</h3>
          <ul className="list-disc pl-6">
            {r.edgeCases.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <div>
          <p className="label">Pattern</p>
          <p>
            {r.pattern.key ? (
              <a href={`#/pattern/${r.pattern.key}`}>{patternName(r.pattern.key)}</a>
            ) : (
              'No clear pattern'
            )}
            {r.pattern.key && !r.pattern.fits && <span className="text-danger"> (not the best fit)</span>}
          </p>
          {r.pattern.note && <p className="label mt-1">{r.pattern.note}</p>}
        </div>
        <div>
          <p className="label">Complexity</p>
          <p>
            Time {r.complexity.time}, space {r.complexity.space}
          </p>
        </div>
      </section>

      {r.next && (
        <section className="callout">
          <span className="label">Next step</span>
          <p>{r.next}</p>
        </section>
      )}

      {r.verdict === 'correct' && !solved && (
        <Button className="w-fit" onClick={onSolved}>
          Mark as solved
        </Button>
      )}
    </div>
  )
}
