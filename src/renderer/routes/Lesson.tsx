import { useEffect, useMemo, useRef, useState } from 'react'
import { useModel } from '../model/context'
import { useAppDispatch, useAppSelector } from '../store'
import { setLessonStatus } from '../store/progressSlice'
import Markdown, { slug } from '../components/Markdown'
import { LessonNotes } from '../components/ui'
import { NotFound, BackLink } from '../components/nav'
import { Button } from '../ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { pixelText } from '../components/pixelText'
import { LessonQuestions } from '../components/Questions'
import { lessonResources } from '../components/resources'
import { stripQuestions } from '../../shared/tutor'
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
  const m = useModel()
  const found = m.findLesson(courseKey, lessonId)
  const dispatch = useAppDispatch()
  const entry = useAppSelector((s) => s.progress.lessons[lessonId])
  const root = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState('')
  const [pct, setPct] = useState(0)
  const [tab, setTab] = useState('read')
  const sections = useMemo(() => (found && tab === 'read' ? outline(found.lesson.body) : []), [found, tab])
  const resources = useMemo(() => (found ? lessonResources(found.lesson, found.course) : []), [found])
  const practice = useMemo(
    () => (found?.chapter.problemIds ?? []).map((id) => m.drillById(id)).filter((d): d is NonNullable<typeof d> => Boolean(d)),
    [found, m],
  )
  useEffect(() => setTab('read'), [lessonId])

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
    // The rail sits beside the column only when the pane (not the window) has
    // room: with the assistant open the pane is 420px narrower.
    <div ref={root} className={cn('mx-auto grid max-w-[640px] gap-x-16 pt-2', sections.length > 1 && '@min-[904px]:w-fit @min-[904px]:max-w-none @min-[904px]:grid-cols-[640px_200px]')}>
      <div aria-hidden="true" className="pointer-events-none sticky top-0 z-20 col-span-full -mt-2 mb-4 h-[2px]">
        <div className="h-full bg-fill transition-[width] duration-150" style={{ width: `${pct}%` }} />
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
        {/* One topic, three parts: read it, read around it, test yourself. */}
        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <TabsList>
            <TabsTrigger value="read">Read</TabsTrigger>
            <TabsTrigger value="resources">Resources{resources.length + practice.length > 0 && ` (${resources.length + practice.length})`}</TabsTrigger>
            <TabsTrigger value="questions">Questions</TabsTrigger>
          </TabsList>
          <TabsContent value="read" forceMount className="data-[state=inactive]:hidden">
            <Markdown body={stripQuestions(lesson.body)} scope={lessonId} />
            {lesson.deeper && (
              <section className="mt-12 border-t border-hair pt-8">
                <h2 className="mb-4">Go deeper</h2>
                <Markdown body={stripQuestions(lesson.deeper)} scope={lessonId} />
              </section>
            )}
          </TabsContent>
          <TabsContent value="resources">
            {resources.length === 0 && practice.length === 0 ? (
              <p className="text-ink-2">No extra reading for this topic yet.</p>
            ) : (
              <div className="flex flex-col gap-8">
                {resources.length > 0 && (
                  <section>
                    <h2 className="mb-3">Further reading</h2>
                    <div className="list">
                      {resources.map((r) => (
                        <a key={r.url} href={r.url} target="_blank" rel="noopener" className="row flex-col !items-start !gap-0">
                          <span className="text-brand">{r.label}</span>
                          <span className="label truncate">{r.url.replace(/^https?:\/\//, '')}</span>
                        </a>
                      ))}
                    </div>
                  </section>
                )}
                {practice.length > 0 && (
                  <section>
                    <h2 className="mb-3">Practice</h2>
                    <div className="list">
                      {practice.map((d) => (
                        <a key={d.id} href={`#/drill/${d.id}`} className="row">
                          <span className="min-w-0 flex-1 truncate">{d.title}</span>
                          <span className="label">{d.difficulty}</span>
                        </a>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </TabsContent>
          <TabsContent value="questions">
            <LessonQuestions lesson={lesson} />
          </TabsContent>
        </Tabs>

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
        <aside className="sticky top-6 hidden h-fit @min-[904px]:block" aria-label="In this lesson">
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
