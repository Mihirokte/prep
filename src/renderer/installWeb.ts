// Imported first by main.tsx. In a browser there is no preload, so build the
// bridge from HTTP before the store (which reads progress at import) loads.
import { createWebApi } from './webApi'

if ((window as { prep?: unknown }).prep === undefined) {
  ;(window as unknown as { __prepWeb: boolean }).__prepWeb = true
  window.prep = createWebApi()
}
