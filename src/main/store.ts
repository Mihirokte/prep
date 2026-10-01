import { freeze } from 'immer'
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { gunzip, gzip } from 'node:zlib'
import type { Content } from '../shared/types'
import { validateContent } from '../shared/validate'
import { isMissing, writeAtomic } from './fsutil'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

const KEEP_SNAPSHOTS = 100

interface Snapshot {
  at: string
  summary: string
  content: Content
}

/** The content store on disk: `content.json` is the source of truth, and every
 *  applied change set first snapshots the previous state into `history/`. */
export class ContentStore {
  private content!: Content
  private rev = 0
  private readonly file: string
  private readonly historyDir: string
  private readonly seedFile: string

  constructor(dir: string, seedFile: string) {
    this.seedFile = seedFile
    this.file = path.join(dir, 'content.json')
    this.historyDir = path.join(dir, 'history')
  }

  /** Load the store, seeding it from the bundled data on first run.
   *  Returns integrity problems (empty when the store is sound). */
  async init(): Promise<string[]> {
    await mkdir(this.historyDir, { recursive: true })
    let raw: string
    try {
      raw = await readFile(this.file, 'utf8')
    } catch (e) {
      if (!isMissing(e)) throw e
      raw = await readFile(this.seedFile, 'utf8')
      await writeAtomic(this.file, raw)
    }
    this.content = freeze(JSON.parse(raw) as Content, true)
    return validateContent(this.content)
  }

  get(): Content {
    return this.content
  }

  get revision(): number {
    return this.rev
  }

  async commit(next: Content, summary: string): Promise<void> {
    const snapshot: Snapshot = { at: new Date().toISOString(), summary, content: this.content }
    const name = `${Date.now()}-r${this.rev}.json.gz`
    await writeAtomic(path.join(this.historyDir, name), await gzipAsync(JSON.stringify(snapshot)))
    await writeAtomic(this.file, JSON.stringify(next, null, 1))
    this.content = freeze(next, true)
    this.rev++
    await this.prune()
  }

  async undoable(): Promise<number> {
    return (await this.snapshots()).length
  }

  /** Restore the state before the most recent change set. */
  async undo(): Promise<{ summary: string } | null> {
    const last = (await this.snapshots()).at(-1)
    if (!last) return null
    const file = path.join(this.historyDir, last)
    const snap = JSON.parse((await gunzipAsync(await readFile(file))).toString('utf8')) as Snapshot
    await writeAtomic(this.file, JSON.stringify(snap.content, null, 1))
    await rm(file)
    this.content = freeze(snap.content, true)
    this.rev++
    return { summary: snap.summary }
  }

  private async snapshots(): Promise<string[]> {
    const names = await readdir(this.historyDir)
    return names.filter((n) => /^\d+-r\d+\.json\.gz$/.test(n)).sort()
  }

  private async prune(): Promise<void> {
    const list = await this.snapshots()
    for (const name of list.slice(0, Math.max(0, list.length - KEEP_SNAPSHOTS)))
      await rm(path.join(this.historyDir, name))
  }
}
