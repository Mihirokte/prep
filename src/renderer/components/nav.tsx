import { useEffect, useState, type ReactNode } from 'react'
import { useModel } from '../model/context'
import { cn } from '../lib/utils'
import type { Theme } from '../useTheme'

const SITE = 'https://mihirokte.info'

// App chrome. Everything here carries data-chrome so the parity check can
// strip it: the chrome is the app's, the page content is the portal's.
// Text only: no icons anywhere in the chrome.

/** Which sidebar entry the current hash belongs to. */
function activeKey(hash: string, areaKeyOf: (id: string) => string | null | undefined): string {
  if (/^#\/?$/.test(hash)) return 'home'
  if (/^#\/dsa\/?$/.test(hash)) return 'dsa'
  if (/^#\/review\/?$/.test(hash)) return 'review'
  if (/^#\/patterns?(\/|$)/.test(hash)) return 'patterns'
  if (/^#\/compan(y|ies)(\/|$)/.test(hash)) return 'companies'
  const study = /^#\/study\/([^/]+)/.exec(hash)
  if (study) return study[1]
  const drill = /^#\/drill\/(.+)$/.exec(hash)
  if (drill) return areaKeyOf(drill[1]) ?? ''
  return ''
}

export function Sidebar({
  hash,
  open,
  onSearch,
  onAssistant,
  assistantOpen,
}: {
  hash: string
  open: boolean
  onSearch: () => void
  onAssistant: () => void
  assistantOpen: boolean
}) {
  const m = useModel()
  const active = activeKey(hash, (id) => m.areaKeyOf(id))
  const study = m.homeAreas.filter((a) => a.kind === 'problems' || a.kind === 'study')

  const item = (key: string, href: string, label: string) => (
    <a key={key} href={href} className="side-item no-ring" aria-current={active === key ? 'page' : undefined}>
      <span className="truncate">{label}</span>
    </a>
  )

  return (
    <nav
      data-chrome
      aria-label="Sidebar"
      aria-hidden={!open}
      className={cn(
        'relative h-full shrink-0 overflow-hidden border-r border-hair bg-paper',
        'transition-[width] duration-[320ms] ease-[var(--ease)]',
        open ? 'w-64' : 'w-0 border-r-0',
      )}
    >
      <div className="flex h-full w-64 flex-col">
        {/* Title-bar strip: drags the window and hosts the traffic lights. */}
        <div className="app-drag h-[52px] shrink-0" />

        <div className="px-6 pb-5">
          <a href="#/" className="no-ring font-display text-[24px] leading-none text-ink no-underline hover:text-brand" aria-label="Prep home">
            PREP
          </a>
        </div>

        <div className="flex-1 overflow-y-auto pb-3">
          <div className="flex flex-col">
            {item('home', '#/', 'Overview')}
            {study.map((a) => item(a.key, a.href, a.label))}
          </div>

          <p className="label mt-7 mb-1 px-6">Reference</p>
          <div className="flex flex-col">
            {item('patterns', '#/patterns', 'Patterns')}
            {item('companies', '#/companies', 'Companies')}
            {item('review', '#/review', 'Review')}
          </div>
        </div>

        <div className="shrink-0 border-t border-hair py-3">
          <button type="button" className="side-item w-full" onClick={onSearch}>
            <span className="flex-1 text-left">Search</span>
            <span className="kbd" aria-hidden="true">
              CMD K
            </span>
          </button>
          <button
            type="button"
            className="side-item w-full"
            onClick={onAssistant}
            aria-expanded={assistantOpen}
            aria-controls="assistant"
          >
            <span className={cn('flex-1 text-left', assistantOpen && 'text-brand')}>Assistant</span>
            <span className="kbd" aria-hidden="true">
              CMD J
            </span>
          </button>
          <a href={SITE} className="side-item w-full">
            <span className="flex-1">mihirokte.info</span>
          </a>
          <p className="label px-6 pt-3 text-[12px] leading-4 normal-case tracking-normal opacity-80">
            Type: Pixelta, Pixel Operator, Determination (CC BY 3.0)
          </p>
        </div>
      </div>
    </nav>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Render only on change: tick at each minute boundary.
    let t: number
    const tick = () => {
      setNow(new Date())
      t = window.setTimeout(tick, 60000 - (Date.now() % 60000) + 50)
    }
    t = window.setTimeout(tick, 60000 - (Date.now() % 60000) + 50)
    return () => clearTimeout(t)
  }, [])
  return (
    <span className="label tag num hidden h-7 items-center px-3 sm:inline-flex" aria-label="Local time">
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
    </span>
  )
}

export function Toolbar({
  sidebarOpen,
  onToggleSidebar,
  onSearch,
  onAssistant,
  assistantOpen,
  theme,
  onToggleTheme,
}: {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  onSearch: () => void
  onAssistant: () => void
  assistantOpen: boolean
  theme: Theme
  onToggleTheme: () => void
}) {
  return (
    <header
      data-chrome
      className={cn(
        'app-drag flex h-[52px] shrink-0 items-center gap-1 pr-4 transition-[padding] duration-[320ms] ease-[var(--ease)]',
        sidebarOpen ? 'pl-3' : 'pl-[88px]',
      )}
    >
      <button type="button" className="tool no-drag" onClick={onToggleSidebar} aria-label="Toggle sidebar" aria-pressed={sidebarOpen}>
        Sidebar
      </button>
      <button type="button" className="tool no-drag" onClick={() => history.back()} aria-label="Back">
        Back
      </button>
      <button type="button" className="tool no-drag" onClick={() => history.forward()} aria-label="Forward">
        Forward
      </button>
      <span className="flex-1" />
      <div className="no-drag flex items-center gap-2">
        <Clock />
        <button
          type="button"
          className="tool tag"
          onClick={onToggleTheme}
          aria-label={theme === 'night' ? 'Switch to day' : 'Switch to night'}
          title={theme === 'night' ? 'Switch to day' : 'Switch to night'}
        >
          {theme === 'night' ? 'Day' : 'Night'}
        </button>
        <button type="button" className="tool" onClick={onSearch} aria-label="Search">
          Search
        </button>
        <button
          type="button"
          className={cn('tool', assistantOpen && 'text-brand')}
          onClick={onAssistant}
          aria-label="Assistant"
          aria-expanded={assistantOpen}
          aria-controls="assistant"
        >
          Assistant
        </button>
      </div>
    </header>
  )
}

export function NotFound() {
  return (
    <div className="max-w-3xl pt-6">
      <h1>Not found</h1>
      <a href="#/" className="label mt-6 inline-block">
        Home
      </a>
    </div>
  )
}

/** Where this page sits: the crumb at the top of every detail page. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="label group mb-6 inline-flex items-center gap-2 no-underline hover:text-brand">
      <span>{children}</span>
    </a>
  )
}
