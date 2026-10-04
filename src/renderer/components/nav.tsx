import type { ReactNode } from 'react'
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

export function Sidebar({ hash, open }: { hash: string; open: boolean }) {
  const m = useModel()
  const active = activeKey(hash, (id) => m.areaKeyOf(id))
  const study = m.homeAreas.filter((a) => a.kind === 'problems' || a.kind === 'study')

  const item = (key: string, href: string, label: string) => (
    <a key={key} href={href} className="side-item no-ring" aria-current={active === key ? 'page' : undefined}>
      <span className="truncate">{label}</span>
    </a>
  )

  // Three groups by job (proximity + a hairline, no header that could be
  // mistaken for an item): today's work, the courses, the reference lenses.
  const group = 'flex flex-col border-t border-hair py-3 first:border-t-0 first:pt-0'

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

        <div className="px-6 pb-6">
          <a href="#/" className="no-ring font-display text-[24px] leading-none text-ink no-underline hover:text-brand" aria-label="Prep home">
            PREP
          </a>
        </div>

        <div className="flex-1 overflow-y-auto pb-3">
          <div className={group}>
            {item('home', '#/', 'Overview')}
            {item('review', '#/review', 'Review')}
          </div>
          <div className={group}>{study.map((a) => item(a.key, a.href, a.label))}</div>
          <div className={group}>
            {item('patterns', '#/patterns', 'Patterns')}
            {item('companies', '#/companies', 'Companies')}
          </div>
        </div>

        <div className="shrink-0 border-t border-hair py-3">
          <a href={SITE} className="side-item w-full">
            <span className="flex-1">mihirokte.info</span>
          </a>
        </div>
      </div>
    </nav>
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
  // Every control here does the same kind of job, so every one looks the same
  // (similarity); related ones sit together, groups are split by space.
  return (
    <header
      data-chrome
      className={cn(
        'app-drag flex h-[52px] shrink-0 items-center gap-6 pr-4 transition-[padding] duration-[320ms] ease-[var(--ease)]',
        sidebarOpen ? 'pl-3' : 'pl-[88px]',
      )}
    >
      <div className="no-drag flex items-center">
        <button type="button" className="tool" onClick={onToggleSidebar} aria-label="Toggle sidebar" aria-pressed={sidebarOpen} title="Toggle sidebar (Cmd Option S)">
          Sidebar
        </button>
      </div>
      <div className="no-drag flex items-center">
        <button type="button" className="tool" onClick={() => history.back()} aria-label="Back" title="Back (Cmd [)">
          Back
        </button>
        <button type="button" className="tool" onClick={() => history.forward()} aria-label="Forward" title="Forward (Cmd ])">
          Forward
        </button>
      </div>
      <span className="flex-1" />
      <div className="no-drag flex items-center">
        <button type="button" className="tool" onClick={onSearch} aria-label="Search" title="Search (Cmd K)">
          Search
        </button>
        <button
          type="button"
          className={cn('tool', assistantOpen && '!text-brand')}
          onClick={onAssistant}
          aria-label="Assistant"
          aria-expanded={assistantOpen}
          aria-controls="assistant"
          title="Assistant (Cmd J)"
        >
          Assistant
        </button>
      </div>
      <div className="no-drag flex items-center">
        <button
          type="button"
          className="tool"
          onClick={onToggleTheme}
          aria-label={theme === 'night' ? 'Switch to day' : 'Switch to night'}
          title={theme === 'night' ? 'Switch to day' : 'Switch to night'}
        >
          {theme === 'night' ? 'Day' : 'Night'}
        </button>
      </div>
    </header>
  )
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-3xl pt-10">
      <h1>Not found</h1>
      <a href="#/" className="label mt-6 inline-block">
        Home
      </a>
    </div>
  )
}

/** The parent of a detail page. It takes the same 40px that top-level pages
 *  leave empty (pt-10), so every page title sits on the same line. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="label flex h-10 w-fit items-start no-underline hover:text-brand">
      {children}
    </a>
  )
}
