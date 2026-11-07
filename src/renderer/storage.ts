import type { ProgressState } from './store/progressSlice'
import { parseProgress, type ParseResult } from './progressFile'

export function exportProgress(state: ProgressState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `prep-progress-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function readProgressFile(file: File): Promise<ParseResult> {
  return file
    .text()
    .then(parseProgress)
    .catch((e: unknown) => ({ ok: false as const, error: `The file could not be read: ${String(e)}` }))
}
