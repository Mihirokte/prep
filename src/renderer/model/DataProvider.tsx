import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { Content } from '../../shared/types'
import { buildModel } from './buildModel'
import { ModelContext } from './context'

/** Loads the content store from the main process and swaps in every new
 *  version it broadcasts (after an assistant change or an undo). */
export function DataProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Content | null>(null)

  useEffect(() => {
    let live = true
    window.prep.content.get().then((c) => {
      if (live) setContent(c)
    })
    const off = window.prep.content.onChanged(setContent)
    return () => {
      live = false
      off()
    }
  }, [])

  const model = useMemo(() => (content ? buildModel(content) : null), [content])
  if (!model) return null
  return <ModelContext.Provider value={model}>{children}</ModelContext.Provider>
}
