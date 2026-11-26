import { useEffect, useState } from 'react'

/** Tracks a CSS media query, e.g. useMedia('(max-width: 767px)'). */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

/** A phone-sized window: the sidebar becomes a drawer and pages use one column. */
export const NARROW = '(max-width: 767px)'
