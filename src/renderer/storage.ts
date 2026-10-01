import type { ProgressState } from './store/progressSlice'

export function exportProgress(state: ProgressState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `prep-progress-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function readProgressFile(file: File): Promise<ProgressState> {
  return file.text().then((text) => {
    const parsed = JSON.parse(text) as Partial<ProgressState>
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not a progress file')
    return { lessons: parsed.lessons ?? {}, problems: parsed.problems ?? {} }
  })
}
