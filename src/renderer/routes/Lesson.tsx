import { useEffect, useMemo, useRef, useState } from 'react'
import { useModel } from '../model/context'
import { useAppDispatch, useAppSelector } from '../store'
import { setLessonStatus } from '../store/progressSlice'
import Markdown, { slug } from '../components/Markdown'
import { LessonNotes } from '../components/ui'
import { NotFound, BackLink } from '../components/nav'
import { Button } from '../ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion'
import { pixelText } from '../components/pixelText'
import { cn } from '../lib/utils'

/** The `##` sections of a lesson, outside code fences. */
function outline(body: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = []
  let fence = false
  for (const line of body.split('\n')) {
    if (/^```/.test(line)) fence = !fence
    if (fence) continue
    const m = /^##\s+(.+)$/.exec(line)
    if (m) out.push({ id: slug(m[1].replace(/[*`]/g, '')), text: pixelText(m[1].replace(/[*`]/g, '')) })
  }
  return out
}

export function LessonPage({ courseKey, lessonId }: { courseKey: string; lessonId: string }) {
  const found = useModel().findLesson(courseKey, lessonId)
  const dispatch = useAppDispatch()
  const entry = useAppSelector((s) => s.progress.lessons[lessonId])
  const root = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState('')
  const [pct, setPct] = useState(0)
  const sections = useMemo(() => (found ? outline(found.lesson.body) : []), [found])

  // Reading progress and the current section follow the content pane's scroll.
  useEffect(() => {
    const scroller = root.current?.closest<HTMLElement>('[data-scroll]')
    if (!scroller) return
    const onScroll = () => {
      const max = scroller.scrollHeight - scroller.clientHeight
      setPct(max > 0 ? Math.min(100, Math.round((scroller.scrollTop / max) * 100)) : 0)
      let cur = ''
      for (const s of sections) {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top - scroller.getBoundingClientRect().top < 120) cur = s.id
      }
      setActive(cur)
    }
    onScroll()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [sections, lessonId])

  if (!found) return <NotFound />
  const { course, chapter, lesson } = found

  const flat = course.chapters.flatMap((ch) => ch.lessons.map((l) => l.id))
  const idx = flat.indexOf(lessonId)
  const prev = idx > 0 ? flat[idx - 1] : null
  const next = idx < flat.length - 1 ? flat[idx + 1] : null
  const nextTitle = next ? course.chapters.flatMap((c) => c.lessons).find((l) => l.id === next)?.title : null
  const read = entry?.status === 'read'

  return (
    // Balance: the 640px reading column and its 200px outline are centered as
    // one unit; without the outline the column is centered on its own.
    <div ref={root} className={cn('mx-auto grid max-w-[640px] gap-x-16 pt-2', sections.length > 1 && 'xl:w-fit xl:max-w-none xl:grid-cols-[640px_200px]')}>
      <div aria-hidden="true" className="pointer-events-none sticky top-0 z-20 col-span-full -mt-2 mb-4 h-[2px]">
        <div className="h-full bg-ink transition-[width] duration-150" style={{ width: `${pct}%` }} />
      </div>
      <article className="min-w-0">
        <BackLink href={`#/study/${course.key}`}>
          {course.label} / {pixelText(chapter.title)}
        </BackLink>
        <h1 className="text-balance">{pixelText(lesson.title)}</h1>
        <p className="label mt-4">
          {lesson.minutes} min
          {lesson.deeper ? ', with a deeper dive' : ''}
        </p>
        <div className="mt-10">
          <Markdown body={lesson.body} scope={lessonId} />
        </div>

        {lesson.deeper && (
          <Accordion type="single" collapsible className="mt-14 border-y-2 border-ink">
            <AccordionItem value="deeper" className="border-b-0">
              <AccordionTrigger>Go deeper</AccordionTrigger>
              <AccordionContent className="pt-4">
                <Markdown body={lesson.deeper} scope={lessonId} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <div className="mt-14">
          <p className="label mb-2">Notes</p>
          <LessonNotes id={lessonId} initial={entry?.notes} />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-hair pt-6">
          <Button variant={read ? 'outline' : 'default'} onClick={() => dispatch(setLessonStatus({ id: lessonId, status: read ? 'unread' : 'read' }))}>
            {read ? 'Marked read' : 'Mark as read'}
          </Button>
          <div className="flex gap-2">
            {prev && (
              <Button variant="ghost" asChild>
                <a href={`#/study/${course.key}/${prev}`}>Previous</a>
              </Button>
            )}
            {next && (
              <Button variant="ghost" asChild>
                <a href={`#/study/${course.key}/${next}`} title={nextTitle ?? undefined}>
                  Next
                </a>
              </Button>
            )}
          </div>
        </div>
      </article>

      {sections.length > 1 && (
        <aside className="sticky top-6 hidden h-fit xl:block" aria-label="In this lesson">
          <p className="label mb-3">On this page</p>
          <ol className="border-l border-hair">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#/study/${course.key}/${lessonId}`}
                  onClick={(e) => {
                    e.preventDefault()
                    const el = document.getElementById(s.id)
                    const sc = root.current?.closest<HTMLElement>('[data-scroll]')
                    if (el && sc) sc.scrollTo({ top: sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 16, behavior: 'smooth' })
                  }}
                  className={cn(
                    '-ml-px block border-l-2 py-1.5 pl-4 text-[16px] leading-5 no-underline',
                    active === s.id ? 'border-ink text-ink' : 'border-transparent text-ink-2 hover:text-brand',
                  )}
                >
                  {s.text}
                </a>
              </li>
            ))}
          </ol>
          <p className="label mt-6">{pct}% read</p>
        </aside>
      )}
    </div>
  )
}
