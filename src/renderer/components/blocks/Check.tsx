import { useState } from 'react'
import type { CheckSpec } from '../../../shared/blocks'
import { cn } from '../../lib/utils'
import { Button } from '../../ui/button'
import { pixelText } from '../pixelText'
import { useInView } from './hooks'

// ```check — a question placed mid-lesson, answered before the reader moves
// on. Picking an option gives immediate feedback and the reason, so a wrong
// mental model surfaces at the paragraph that built it.

export default function CheckBlock({ spec }: { spec: CheckSpec }) {
  const [picked, setPicked] = useState<number | null>(null)
  const [ref, seen] = useInView<HTMLDivElement>(true)
  const done = picked !== null
  const right = done && spec.options[picked].right

  return (
    <section ref={ref} aria-label="Quick check" className={cn('check my-10', seen ? 'rise' : 'opacity-0')}>
      <p className="label mb-2 text-ink">Quick check</p>
      <div className="cast-sm">
        <div className="panel px-8 py-6">
          <p className="font-display text-[24px] leading-[1.15]">{pixelText(spec.q)}</p>
          <ul className="m-0 mt-6 flex list-none flex-col gap-2 p-0" role="list">
            {spec.options.map((o, i) => {
              const mine = picked === i
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={done}
                    aria-pressed={mine}
                    onClick={() => setPicked(i)}
                    className={cn(
                      'w-full border px-4 py-3 text-left leading-6 transition-colors',
                      !done && 'border-hair-strong hover:border-ink',
                      done && o.right && 'border-ink bg-ink text-paper',
                      done && mine && !o.right && 'border-brand text-brand',
                      done && !mine && !o.right && 'border-hair text-ink-2',
                    )}
                  >
                    {pixelText(o.text)}
                    {done && o.right && <span className="sr-only"> (correct answer)</span>}
                    {done && mine && !o.right && <span className="sr-only"> (your answer, incorrect)</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          {done && (
            <div className="rise mt-6 border-t border-hair pt-6" aria-live="polite">
              <p className={cn('label', right ? '!text-ink' : '!text-brand')}>{right ? 'Correct' : 'Not quite'}</p>
              <p className="mt-2">{pixelText(spec.why)}</p>
              <Button className="mt-6" variant="ghost" size="sm" onClick={() => setPicked(null)}>
                Try again
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
