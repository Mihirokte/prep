import type { ReactNode } from 'react'
import {
  ArrowUpRight,
  BookOpen,
  Boxes,
  Braces,
  Building,
  ChevronLeft,
  ChevronRight,
  Cpu,
  House,
  Layers,
  PanelLeft,
  Search,
  Server,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react'
import { useModel } from '../model/context'
import { cn } from '../lib/utils'

const SITE = 'https://mihirokte.info'

// App chrome. Everything here carries data-chrome so the parity check can
// strip it: the chrome is the app's, the page content is the portal's.

const AREA_ICON: Record<string, typeof BookOpen> = {
  dsa: Braces,
  lld: Boxes,
  sd: Server,
  arch: Layers,
  ai: Cpu,
  ops: Zap,
}

/** Which sidebar entry the current hash belongs to. */
function activeKey(hash: string, areaKeyOf: (id: string) => string | null | undefined): string {
  if (/^#\/?$/.test(hash)) return 'home'
  if (/^#\/dsa\/?$/.test(hash)) return 'dsa'
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

  const item = (key: string, href: string, label: string, Icon: typeof BookOpen) => (
    <a key={key} href={href} className="side-item" aria-current={active === key ? 'page' : undefined}>
      <Icon aria-hidden="true" />
      <span className="truncate">{label}</span>
    </a>
  )

  return (
    <nav
      data-chrome
      aria-label="Sidebar"
      aria-hidden={!open}
      className={cn(
        'relative h-full shrink-0 overflow-hidden bg-sidebar border-r border-hairline',
        'transition-[width] duration-[220ms] ease-[var(--ease-out-expo)]',
        open ? 'w-60' : 'w-0 border-r-0',
      )}
    >
      <div className="flex h-full w-60 flex-col">
        {/* Title-bar strip: drags the window and hosts the traffic lights. */}
        <div className="app-drag h-[52px] shrink-0" />

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="flex flex-col gap-0.5">
            {item('home', '#/', 'Overview', House)}
            {study.map((a) => item(a.key, a.href, a.label, AREA_ICON[a.key] ?? BookOpen))}
          </div>

          <p className="label mt-6 mb-1.5 px-2.5">Reference</p>
          <div className="flex flex-col gap-0.5">
            {item('patterns', '#/patterns', 'Patterns', Workflow)}
            {item('companies', '#/companies', 'Companies', Building)}
          </div>
        </div>

        <div className="shrink-0 border-t border-hairline p-3 flex flex-col gap-0.5">
          <button type="button" className="side-item w-full" onClick={onSearch}>
            <Search aria-hidden="true" />
            <span className="flex-1 text-left">Search</span>
            <span className="kbd" aria-hidden="true">
              ⌘K
            </span>
          </button>
          <button
            type="button"
            className="side-item w-full"
            onClick={onAssistant}
            aria-expanded={assistantOpen}
            aria-controls="assistant"
          >
            <Sparkles aria-hidden="true" className={assistantOpen ? 'text-brand' : undefined} />
            <span className="flex-1 text-left">Assistant</span>
            <span className="kbd" aria-hidden="true">
              ⌘J
            </span>
          </button>
          <a href={SITE} className="side-item w-full">
            <ArrowUpRight aria-hidden="true" />
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
}: {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  onSearch: () => void
  onAssistant: () => void
  assistantOpen: boolean
}) {
  return (
    <header
      data-chrome
      className={cn(
        'app-drag flex h-[52px] shrink-0 items-center gap-1 pr-3 transition-[padding] duration-[220ms] ease-[var(--ease-out-expo)]',
        sidebarOpen ? 'pl-3' : 'pl-[88px]',
      )}
    >
      <button type="button" className="tool no-drag" onClick={onToggleSidebar} aria-label="Toggle sidebar" aria-pressed={sidebarOpen}>
        <PanelLeft aria-hidden="true" />
      </button>
      <span className="mx-1 h-4 w-px bg-hairline" aria-hidden="true" />
      <button type="button" className="tool no-drag" onClick={() => history.back()} aria-label="Back">
        <ChevronLeft aria-hidden="true" />
      </button>
      <button type="button" className="tool no-drag" onClick={() => history.forward()} aria-label="Forward">
        <ChevronRight aria-hidden="true" />
      </button>
      <span className="flex-1" />
      <button type="button" className="tool no-drag" onClick={onSearch} aria-label="Search">
        <Search aria-hidden="true" />
      </button>
      <button
        type="button"
        className={cn('tool no-drag', assistantOpen && 'text-brand')}
        onClick={onAssistant}
        aria-label="Assistant"
        aria-expanded={assistantOpen}
        aria-controls="assistant"
      >
        <Sparkles aria-hidden="true" />
      </button>
    </header>
  )
}

export function NotFound() {
  return (
    <div className="max-w-3xl">
      <h1>Not found</h1>
      <a href="#/" className="mt-4 inline-block text-sm text-muted-foreground no-underline hover:text-foreground">
        Home
      </a>
    </div>
  )
}

/** Where this page sits — the crumb at the top of every detail page. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="group mb-5 inline-flex items-center gap-1 -ml-1.5 pl-1 pr-2 h-7 rounded-md text-[0.8125rem] text-muted-foreground no-underline transition-colors hover:text-foreground hover:bg-muted"
    >
      <ChevronLeft aria-hidden="true" className="size-3.5 text-faint transition-colors group-hover:text-foreground" />
      <span>{children}</span>
    </a>
  )
}
