import { ArrowUpRight } from 'lucide-react'
import { useModel } from '../model/context'
import { useAppSelector } from '../store'
import { LessonRow, ProblemRow } from '../components/ui'
import { NotFound, BackLink } from '../components/nav'

export function CoursePage({ courseKey }: { courseKey: string }) {
  const m = useModel()
  const course = m.findCourse(courseKey)
  const lessons = useAppSelector((s) => s.progress.lessons)
  if (!course) return <NotFound />
  const { perChapter, leftovers } = m.courseProblemLayout(course)

  return (
    <div className="max-w-3xl">
      <BackLink href="#/">Home</BackLink>
      <h1>{course.label}</h1>

      {course.chapters.map((ch) => {
        const read = ch.lessons.filter((l) => lessons[l.id]?.status === 'read').length
        const probs = perChapter[ch.id] ?? []
        return (
          <section key={ch.id} className="mt-12">
            <div className="flex items-baseline justify-between gap-4 px-1">
              <h2>{ch.title}</h2>
              <span className="num text-[0.8125rem] text-faint">
                {read}/{ch.lessons.length}
              </span>
            </div>
            <p className="label mt-4 mb-2 px-1">Learn</p>
            <div className="list panel">
              {ch.lessons.map((l) => (
                <LessonRow key={l.id} courseKey={course.key} lessonId={l.id} title={l.title} minutes={l.minutes} />
              ))}
            </div>
            {probs.length > 0 && (
              <>
                <p className="label mt-6 mb-2 px-1">Practice</p>
                <div className="list panel">
                  {probs.map((d) => (
                    <ProblemRow key={d.id} drill={d} />
                  ))}
                </div>
              </>
            )}
          </section>
        )
      })}

      {leftovers.length > 0 && (
        <section className="mt-16">
          <h2 className="px-1">More problems</h2>
          {leftovers.map((g) => (
            <div key={g.topic}>
              <p className="label mt-6 mb-2 px-1">{g.topic}</p>
              <div className="list panel">
                {g.drills.map((d) => (
                  <ProblemRow key={d.id} drill={d} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {course.references && course.references.length > 0 && (
        <section className="mt-16">
          <h2 className="px-1">References</h2>
          <ul className="mt-3 list panel">
            {course.references.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener" className="row text-[0.9375rem]">
                  <span className="flex-1 min-w-0 truncate">{r.label}</span>
                  <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 text-faint" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
