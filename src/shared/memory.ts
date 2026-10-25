// What the assistant remembers about the learner: preferences, goals and
// feedback they gave while reading. Pure functions over an immutable list;
// main/memory.ts does the file I/O. Every prompt carries the notes, so later
// answers and lessons follow them.

export interface MemoryNote {
  id: string
  /** ISO date the note was saved. */
  at: string
  text: string
  /** The lesson the learner was reading when they said it. */
  lessonId?: string
}

export const MAX_NOTES = 200
const MAX_CHARS = 300
const SHOWN = 60

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Append new notes, skipping blanks and repeats. Returns the new list and what was added. */
export function addNotes(
  notes: readonly MemoryNote[],
  texts: readonly string[],
  meta: { at: string; lessonId?: string },
): { notes: MemoryNote[]; added: MemoryNote[] } {
  const seen = new Set(notes.map((n) => norm(n.text)))
  let max = notes.reduce((m, n) => Math.max(m, Number(n.id.slice(1)) || 0), 0)
  const added: MemoryNote[] = []
  for (const raw of texts) {
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS)
    if (!text || seen.has(norm(text))) continue
    seen.add(norm(text))
    added.push({ id: `m${++max}`, at: meta.at, text, ...(meta.lessonId ? { lessonId: meta.lessonId } : {}) })
  }
  return { notes: [...notes, ...added].slice(-MAX_NOTES), added }
}

export function forgetNotes(notes: readonly MemoryNote[], ids: readonly string[]): { notes: MemoryNote[]; removed: string[] } {
  const drop = new Set(ids)
  const removed = notes.filter((n) => drop.has(n.id)).map((n) => n.id)
  return { notes: notes.filter((n) => !drop.has(n.id)), removed }
}

/** The prompt section: the most recent notes, oldest first. */
export function renderMemory(notes: readonly MemoryNote[]): string {
  const shown = notes.slice(-SHOWN)
  if (!shown.length) return '(nothing yet)'
  return shown.map((n) => `- [${n.id}] ${n.text} (${n.at}${n.lessonId ? `, while reading ${n.lessonId}` : ''})`).join('\n')
}

/** Shape-check notes read from disk. */
export function readNotes(v: unknown): MemoryNote[] {
  const list = v && typeof v === 'object' && Array.isArray((v as { notes?: unknown }).notes) ? (v as { notes: unknown[] }).notes : []
  return list
    .filter((n): n is MemoryNote => {
      const x = n as MemoryNote
      return Boolean(x) && typeof x.id === 'string' && typeof x.text === 'string' && typeof x.at === 'string'
    })
    .slice(-MAX_NOTES)
}
