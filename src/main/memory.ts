import { readFile } from 'node:fs/promises'
import { addNotes, forgetNotes, type MemoryNote, readNotes } from '../shared/memory'
import { isMissing, writeAtomic } from './fsutil'

/** The learner memory file (agent/memory.json in the app's data folder). */
export class MemoryStore {
  private notes: MemoryNote[] = []
  private readonly file: string

  constructor(file: string) {
    this.file = file
  }

  async load(): Promise<void> {
    try {
      this.notes = readNotes(JSON.parse(await readFile(this.file, 'utf8')))
    } catch (e) {
      if (!isMissing(e)) console.error('could not read the learner memory; starting empty:', e)
      this.notes = []
    }
  }

  list(): MemoryNote[] {
    return this.notes
  }

  private async save(): Promise<void> {
    await writeAtomic(this.file, JSON.stringify({ notes: this.notes }, null, 1))
  }

  async add(texts: string[], meta: { at: string; lessonId?: string }): Promise<MemoryNote[]> {
    const r = addNotes(this.notes, texts, meta)
    if (!r.added.length) return []
    this.notes = r.notes
    await this.save()
    return r.added
  }

  async forget(ids: string[]): Promise<string[]> {
    const r = forgetNotes(this.notes, ids)
    if (!r.removed.length) return []
    this.notes = r.notes
    await this.save()
    return r.removed
  }
}
