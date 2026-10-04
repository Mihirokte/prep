import { useCallback, useEffect, useRef, useState } from 'react'

export type Theme = 'night' | 'day'

const KEY = 'prep.theme'

const read = (): Theme => (localStorage.getItem(KEY) === 'day' ? 'day' : 'night')

/** Apply a theme to the document. Night is the default and is the `dark` class. */
export function applyTheme(theme: Theme, animate = false) {
  const root = document.documentElement
  if (animate) {
    root.classList.add('theming')
    window.setTimeout(() => root.classList.remove('theming'), 500)
  }
  root.classList.toggle('dark', theme === 'night')
  root.style.colorScheme = theme === 'night' ? 'dark' : 'light'
}

/** Set before first paint so the window never flashes the wrong theme. */
export function initTheme() {
  applyTheme(read())
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(read)
  const first = useRef(true)
  useEffect(() => {
    localStorage.setItem(KEY, theme)
    applyTheme(theme, !first.current)
    first.current = false
  }, [theme])
  const toggle = useCallback(() => setTheme((t) => (t === 'night' ? 'day' : 'night')), [])
  return [theme, toggle]
}
