import { readFile, rename } from 'node:fs/promises'
import { isMissing, writeAtomic } from './fsutil'

/** Key/value file behind redux-persist: the same serialized progress the web
 *  portal kept in localStorage, now in Application Support. Writes are
 *  serialized so a burst of status changes can never interleave. */
export class ProgressStore {
  private data: Record<string, string> = {}
  private queue: Promise<void> = Promise.resolve()
  private readonly file: string

  constructor(file: string) {
    this.file = file
  }

  async init(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file, 'utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        this.data = Object.fromEntries(
          Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'),
        )
    } catch (e) {
      if (isMissing(e)) return
      // Unreadable file: keep it for inspection and start clean rather than crash.
      await rename(this.file, `${this.file}.unreadable-${Date.now()}`)
      console.error('progress file was unreadable and has been set aside:', e)
    }
  }

  get(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null
  }

  set(key: string, value: string): Promise<void> {
    this.data[key] = value
    return this.flush()
  }

  remove(key: string): Promise<void> {
    delete this.data[key]
    return this.flush()
  }

  private flush(): Promise<void> {
    const snapshot = JSON.stringify(this.data)
    this.queue = this.queue.then(() => writeAtomic(this.file, snapshot)).catch((e) => {
      console.error('could not save progress:', e)
    })
    return this.queue
  }
}
