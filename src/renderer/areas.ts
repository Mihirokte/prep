import type { Course } from '../shared/types'

// The home index, in learning order (from scratch): DSA → LLD → System Design
// → Architecture → Production & Ops → Security. DSA is drill-only (links to
// its problem list); each study area links to its course page.
export interface HomeArea {
  key: string
  label: string
  blurb: string
  href: string
  kind: 'problems' | 'study' | 'companies' | 'patterns'
}

// Explicit learning sequence by course key. DSA first, then the study areas
// in dependency order (single-machine design → distributed → above-a-system →
// how real systems run).
const ORDER = ['dsa', 'lld', 'sd', 'arch', 'ai', 'ops', 'sec']

const DSA_AREA: HomeArea = {
  key: 'dsa',
  label: 'DSA',
  blurb: 'Data structures & algorithms — straight to the problems. Patterns, drills, links to LeetCode.',
  href: '#/dsa',
  kind: 'problems',
}

export function buildHomeAreas(courses: Course[]): HomeArea[] {
  const toCard = (key: string): HomeArea | null => {
    if (key === 'dsa') return DSA_AREA
    const c = courses.find((x) => x.key === key)
    return c ? { key: c.key, label: c.label, blurb: c.blurb, href: `#/study/${c.key}`, kind: 'study' } : null
  }
  const ordered = ORDER.map(toCard).filter((a): a is HomeArea => a !== null)
  // Patterns sits directly after DSA: it is the lens on the same problem set.
  ordered.splice(1, 0, {
    key: 'patterns',
    label: 'Patterns',
    blurb: 'The recurring shapes behind the problems — recognition cues, templates, and every problem each one solves.',
    href: '#/patterns',
    kind: 'patterns',
  })
  // Safety net: surface any course the ORDER list does not know, so a new
  // area can never silently vanish from the home index.
  const seen = new Set(ORDER)
  for (const c of courses) if (!seen.has(c.key)) ordered.push(toCard(c.key)!)
  // Company Research sits last: reference data rather than a study track.
  ordered.push({
    key: 'companies',
    label: 'Company Research',
    blurb:
      'What specific companies ask: round structure, reported questions, and what their LLD and machine-coding rounds expect.',
    href: '#/companies',
    kind: 'companies',
  })
  return ordered
}
