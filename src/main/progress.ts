import { readFile, rename } from 'node:fs/promises'
import { PROGRESS_KEY, mergePersisted } from '../shared/progressMerge'
import { TODOS_KEY, mergeTodosRaw } from '../shared/todos'
import { bus } from './events'
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

  /** Replace the value. The Mac window uses this, so Reset still empties progress;
   *  the to-do list always merges because deleted items are tombstones. */
  set(key: string, value: string): Promise<void> {
    this.data[key] = key === TODOS_KEY ? mergeTodosRaw(this.get(key), value) : value
    bus.emit('progress', key)
    return this.flush()
  }

  /** Merge the value into what is stored, so a phone that was offline or stale
   *  can never erase newer progress made elsewhere. */
  setMerged(key: string, value: string): Promise<void> {
    if (key === PROGRESS_KEY) this.data[key] = mergePersisted(this.get(key), value)
    else if (key === TODOS_KEY) this.data[key] = mergeTodosRaw(this.get(key), value)
    else throw new Error(`key ${key} cannot be written from here`)
    bus.emit('progress', key)
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
