import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Width of an element, updated on resize. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.floor(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** True once the element has been on screen (and stays true), or live while on screen. */
export function useInView<T extends HTMLElement>(once = true): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true)
          if (once) io.disconnect()
        } else if (!once) setSeen(false)
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [once])
  return [ref, seen]
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Re-render once the pixel faces are loaded, so measured text widths are real. */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    Promise.all([
      document.fonts.load('16px "Pixel Operator"'),
      document.fonts.load('12px "Determination"'),
      document.fonts.load('24px "Pixelta"'),
    ])
      .then(() => document.fonts.ready)
      .then(() => live && setReady(true))
      .catch(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [])
  return ready
}

let ctx: CanvasRenderingContext2D | null = null
const cache = new Map<string, number>()
export const BODY_FONT = '16px "Pixel Operator"'
export const LABEL_FONT = '12px "Determination"'

export function textWidth(text: string, font = BODY_FONT, tracking = 0): number {
  const key = `${font}|${tracking}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  ctx ??= document.createElement('canvas').getContext('2d')
  let w = text.length * 7.5
  if (ctx) {
    ctx.font = font
    w = ctx.measureText(text).width
  }
  w += tracking * text.length
  cache.set(key, w)
  return w
}

/** Greedy word wrap to a pixel width; words longer than the width are hard-broken. */
export function wrapText(text: string, maxPx: number, font = BODY_FONT, tracking = 0): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (let word of words) {
    while (textWidth(word, font, tracking) > maxPx && word.length > 1) {
      let cut = word.length - 1
      while (cut > 1 && textWidth(word.slice(0, cut), font, tracking) > maxPx) cut--
      if (cur) {
        lines.push(cur)
        cur = ''
      }
      lines.push(word.slice(0, cut))
      word = word.slice(cut)
    }
    const next = cur ? `${cur} ${word}` : word
    if (textWidth(next, font, tracking) <= maxPx) cur = next
    else {
      if (cur) lines.push(cur)
      cur = word
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}
