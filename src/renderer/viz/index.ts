import { SCENES_A } from './scenesA'
import { SCENES_B } from './scenesB'
import type { Scene } from './types'

export const SCENES: Record<string, Scene> = Object.fromEntries([...SCENES_A, ...SCENES_B].map((s) => [s.id, s]))

/** The walk-through for a pattern card, when one exists. */
export const sceneForPattern = (patternKey: string): Scene | undefined =>
  Object.values(SCENES).find((s) => s.pattern === patternKey)

export type { Scene } from './types'
