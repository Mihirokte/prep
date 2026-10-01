import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

let seq = 0

/** Write via a temp file + rename, so a crash mid-write never leaves a torn file. */
export async function writeAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${++seq}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, file)
}

export const isMissing = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === 'ENOENT'
