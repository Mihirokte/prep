/// <reference types="vite/client" />
import type { PrepApi } from '../shared/api'

declare global {
  interface Window {
    prep: PrepApi
  }
}
