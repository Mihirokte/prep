import type { ArrayPanel, Cell, Frame, Panel, Tone } from './types'

export const cells = (vals: (string | number)[], tones: Record<number, Tone | undefined> = {}): Cell[] =>
  vals.map((v, i) => ({ v, tone: tones[i] }))

export function arr(
  vals: (string | number)[],
  opts: {
    title?: string
    tones?: Record<number, Tone | undefined>
    pointers?: ArrayPanel['pointers']
    window?: [number, number]
    indices?: boolean
  } = {},
): ArrayPanel {
  return {
    kind: 'array',
    title: opts.title,
    cells: cells(vals, opts.tones),
    pointers: opts.pointers,
    window: opts.window,
    indices: opts.indices,
  }
}

export const frame = (note: string, panels: Panel[], extra: Partial<Frame> = {}): Frame => ({ note, panels, ...extra })

/** Tone every index in [a, b] (inclusive). */
export function range(a: number, b: number, tone: Tone): Record<number, Tone> {
  const out: Record<number, Tone> = {}
  for (let i = a; i <= b; i++) out[i] = tone
  return out
}
