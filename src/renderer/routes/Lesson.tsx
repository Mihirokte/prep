import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useModel } from '../model/context'
import { useAppDispatch, useAppSelector } from '../store'
import { setLessonStatus } from '../store/progressSlice'
import Markdown from '../components/Markdown'
import { LessonNotes } from '../components/ui'
import { NotFound, BackLink } from '../components/nav'
import { Button } from '../ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion'

export function LessonPage({ courseKey, lessonId }: { courseKey: string; lessonId: string }) {
  const found = useModel().findLesson(courseKey, lessonId)
  const dispatch = useAppDispatch()
  const entry = useAppSelector((s) => s.progress.lessons[lessonId])
  if (!found) return <NotFound />
  const { course, chapter, lesson } = found

  const flat = course.chapters.flatMap((ch) => ch.lessons.map((l) => l.id))
  const idx = flat.indexOf(lessonId)
  const prev = idx > 0 ? flat[idx - 1] : null
  const next = idx < flat.length - 1 ? flat[idx + 1] : null
  const read = entry?.status === 'read'

  return (
    <div className="prose-col">
      <BackLink href={`#/study/${course.key}`}>
        {course.label} — {chapter.title}
      </BackLink>
      <h1 className="text-[1.875rem]">{lesson.title}</h1>
      <div className="mt-7">
        <Markdown body={lesson.body} />
      </div>

      {lesson.deeper && (
        <Accordion type="single" collapsible className="panel mt-10">
          <AccordionItem value="deeper" className="border-b-0">
            <AccordionTrigger className="text-brand">Go deeper</AccordionTrigger>
            <AccordionContent>
              <Markdown body={lesson.deeper} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      <div className="mt-12">
        <LessonNotes id={lessonId} initial={entry?.notes} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
        <Button
          variant={read ? 'outline' : 'default'}
          onClick={() => dispatch(setLessonStatus({ id: lessonId, status: read ? 'unread' : 'read' }))}
        >
          {read && <Check aria-hidden="true" className="text-brand" />}
          {read ? 'Marked read' : 'Mark as read'}
        </Button>
        <div className="flex gap-1">
          {prev && (
            <Button variant="ghost" asChild>
              <a href={`#/study/${course.key}/${prev}`}>
                <ChevronLeft aria-hidden="true" />
                Previous
              </a>
            </Button>
          )}
          {next && (
            <Button variant="ghost" asChild>
              <a href={`#/study/${course.key}/${next}`}>
                Next
                <ChevronRight aria-hidden="true" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
