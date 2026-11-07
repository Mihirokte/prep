import type { Course, Lesson } from '../../shared/types'

export interface Resource {
  label: string
  url: string
}

const URL_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(?<![([])(https?:\/\/[^\s)>\]]+)/g

/** Links the lesson cites (markdown links and bare URLs, outside code), then
 *  the course's reference list. First mention wins; each URL appears once. */
export function lessonResources(lesson: Lesson, course: Course): Resource[] {
  const out: Resource[] = []
  const seen = new Set<string>()
  const add = (label: string, url: string) => {
    const u = url.replace(/[.,;:]+$/, '')
    if (seen.has(u)) return
    seen.add(u)
    out.push({ label: label.trim() || u, url: u })
  }
  for (const md of [lesson.body, lesson.deeper ?? '']) {
    const prose = md.replace(/```[\s\S]*?```/g, '')
    for (const m of prose.matchAll(URL_RE)) {
      if (m[2]) add(m[1].replace(/[*`]/g, ''), m[2])
      else if (m[3]) add(m[3], m[3])
    }
  }
  for (const r of course.references ?? []) add(r.label, r.url)
  return out
}
