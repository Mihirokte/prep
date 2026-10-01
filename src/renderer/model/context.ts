import { createContext, useContext } from 'react'
import type { Model } from './buildModel'

export const ModelContext = createContext<Model | null>(null)

/** The live content model. Re-renders whenever the store changes. */
export function useModel(): Model {
  const model = useContext(ModelContext)
  if (!model) throw new Error('useModel must be used inside <DataProvider>')
  return model
}
