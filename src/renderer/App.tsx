import { useEffect, useRef, useState } from 'react'
import { Sidebar, Toolbar, NotFound } from './components/nav'
import { useHashRoute } from './useHashRoute'
import Assistant from './components/Assistant'
import CommandPalette from './components/CommandPalette'
import Home from './routes/Home'
import { CoursePage } from './routes/Study'
import { LessonPage } from './routes/Lesson'
import { DsaList } from './routes/Dsa'
import { DrillPage } from './routes/Drill'
import { CompanyIndex, CompanyPage } from './routes/Company'
import { PatternIndex, PatternPage } from './routes/Patterns'
import { cn } from './lib/utils'

const ROUTES: { re: RegExp; render: (m: RegExpExecArray) => React.ReactNode; wide?: boolean }[] = [
  { re: /^#\/study\/([^/]+)\/([^/]+)$/, render: (m) => <LessonPage courseKey={m[1]} lessonId={m[2]} /> },
  { re: /^#\/study\/([^/]+)$/, render: (m) => <CoursePage courseKey={m[1]} /> },
  { re: /^#\/dsa\/?$/, render: () => <DsaList /> },
  { re: /^#\/patterns\/?$/, render: () => <PatternIndex /> },
  { re: /^#\/pattern\/([^/]+)$/, render: (m) => <PatternPage patternKey={m[1]} /> },
  { re: /^#\/companies\/?$/, render: () => <CompanyIndex /> },
  { re: /^#\/company\/([^/]+)$/, render: (m) => <CompanyPage companyKey={m[1]} /> },
  { re: /^#\/drill\/(.+)$/, render: (m) => <DrillPage id={m[1]} />, wide: true },
  { re: /^#\/?$/, render: () => <Home /> },
]

/** Text fields and the code editor keep their own ⌘[ / ⌘] (indentation). */
const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || el.closest('input, textarea, select, .cm-editor') !== null)

const SIDEBAR_KEY = 'prep.sidebar'

export default function App() {
  const hash = useHashRoute()
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem(SIDEBAR_KEY) !== 'closed')
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? 'open' : 'closed')
  }, [sidebarOpen])

  // A new page starts at the top; the content pane is the scroller, not the window.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [hash])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key.toLowerCase()
      if (e.altKey) {
        if (key === 's' || e.code === 'KeyS') {
          e.preventDefault()
          setSidebarOpen((v) => !v)
        }
        return
      }
      if (key === 'j') {
        e.preventDefault()
        setAssistantOpen((v) => !v)
      } else if (key === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if ((key === '[' || key === ']') && !isEditable(e.target)) {
        e.preventDefault()
        if (key === '[') history.back()
        else history.forward()
      }
    }
    window.addEventListener('keydown', onKey)
    const off = window.prep.onMenu((ev) => {
      if (ev === 'assistant') setAssistantOpen((v) => !v)
      if (ev === 'palette') setPaletteOpen((v) => !v)
      if (ev === 'sidebar') setSidebarOpen((v) => !v)
      if (ev === 'home') window.location.hash = '/'
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      off()
    }
  }, [])

  let view: React.ReactNode = <NotFound />
  let wide = false
  for (const r of ROUTES) {
    const m = r.re.exec(hash)
    if (m) {
      view = r.render(m)
      wide = Boolean(r.wide)
      break
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <Sidebar
        hash={hash}
        open={sidebarOpen}
        onSearch={() => setPaletteOpen(true)}
        onAssistant={() => setAssistantOpen((v) => !v)}
        assistantOpen={assistantOpen}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onSearch={() => setPaletteOpen(true)}
          onAssistant={() => setAssistantOpen((v) => !v)}
          assistantOpen={assistantOpen}
        />
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn('px-8 pb-24 pt-2 sm:px-12', !wide && 'max-w-[920px]')}>{view}</div>
        </div>
      </div>

      <Assistant open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
