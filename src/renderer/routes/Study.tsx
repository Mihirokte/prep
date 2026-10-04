import { useModel } from '../model/context'
import { useAppSelector } from '../store'
import { Bar, LessonRow, ProblemRow } from '../components/ui'
import { NotFound, BackLink } from '../components/nav'
import { pixelText } from '../components/pixelText'

export function CoursePage({ courseKey }: { courseKey: string }) {
  const m = useModel()
  const course = m.findCourse(courseKey)
  const lessons = useAppSelector((s) => s.progress.lessons)
  if (!course) return <NotFound />
  const { perChapter, leftovers } = m.courseProblemLayout(course)

  const all = course.chapters.flatMap((ch) => ch.lessons)
  const readAll = all.filter((l) => lessons[l.id]?.status === 'read').length
  const minutes = all.reduce((n, l) => n + l.minutes, 0)

  return (
    <div className="max-w-3xl">
      <BackLink href="#/">Overview</BackLink>
      <h1>{course.label}</h1>
      <p className="label mt-4">
        {readAll}/{all.length} lessons, about {Math.round(minutes / 6) / 10} h
      </p>
      <Bar value={all.length ? Math.round((readAll / all.length) * 100) : 0} label={`${course.label} progress`} className="mt-3 !h-[6px]" />

      {course.chapters.map((ch, n) => {
        const read = ch.lessons.filter((l) => lessons[l.id]?.status === 'read').length
        const probs = perChapter[ch.id] ?? []
        return (
          <section key={ch.id} className="mt-14">
            <div className="flex items-baseline gap-4">
              <span className="label num">{String(n + 1).padStart(2, '0')}</span>
              <h2 className="min-w-0 flex-1">{pixelText(ch.title)}</h2>
              <span className="label num">
                {read}/{ch.lessons.length}
              </span>
            </div>
            <div className="list mt-5">
              {ch.lessons.map((l) => (
                <LessonRow key={l.id} courseKey={course.key} lessonId={l.id} title={l.title} minutes={l.minutes} />
              ))}
            </div>
            {probs.length > 0 && (
              <>
                <p className="label mb-2 mt-8">Practice</p>
                <div className="list">
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
          <h2>More problems</h2>
          {leftovers.map((g) => (
            <div key={g.topic}>
              <p className="label mb-2 mt-8">{g.topic}</p>
              <div className="list">
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
          <h2>References</h2>
          <ul className="list mt-5">
            {course.references.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener" className="row no-underline">
                  <span className="min-w-0 flex-1 truncate">{pixelText(r.label)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
