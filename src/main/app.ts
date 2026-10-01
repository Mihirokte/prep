import {
  app,
  BrowserWindow,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  protocol,
  screen,
  session,
  shell,
} from 'electron'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { MenuEvent, TranscriptEntry } from '../shared/api'
import type { Content } from '../shared/types'
import { Agent, type AgentSettings } from './agent'
import { isMissing, writeAtomic } from './fsutil'
import { ProgressStore } from './progress'
import { ContentStore } from './store'

// Main process. Owns the data on disk and the assistant; the renderer is a
// sandboxed page that reaches them only through the preload bridge.

const SCHEME = 'prep'
const ORIGIN = `${SCHEME}://app`
const RENDERER_DIR = path.join(__dirname, '..', 'renderer')
const PRELOAD = path.join(__dirname, '..', 'preload', 'index.cjs')
const SEED = path.join(__dirname, '..', '..', 'seed', 'content.json')
const BACKGROUND = '#1c1917' // --background (content surface), so no flash on open

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "form-action 'none'",
].join('; ')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
}

export interface StartOptions {
  /** Use this directory instead of ~/Library/Application Support/Prep. */
  userData?: string
  /** Load the renderer from a dev server instead of the bundled files. */
  devUrl?: string
  /** Keep the window hidden (verification runs). */
  hidden?: boolean
}

export interface AppHandles {
  window(): BrowserWindow | null
  store: ContentStore
  progress: ProgressStore
  agent: Agent
  dataDir: string
}

const isHttp = (url: string) => /^https?:\/\//i.test(url)

export function startApp(opts: StartOptions = {}): Promise<AppHandles> {
  if (opts.userData) app.setPath('userData', opts.userData)
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ])

  if (!opts.userData && !app.requestSingleInstanceLock()) {
    app.quit()
    return new Promise(() => {})
  }

  const appOrigin = opts.devUrl ? new URL(opts.devUrl).origin : ORIGIN
  const isAppUrl = (url: string) => url === appOrigin || url.startsWith(`${appOrigin}/`)

  // Links leave the app for the default browser; the app itself never navigates away.
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-navigate', (event, url) => {
      if (isAppUrl(url)) return
      event.preventDefault()
      if (isHttp(url)) void shell.openExternal(url)
    })
    wc.setWindowOpenHandler(({ url }) => {
      if (isHttp(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    wc.on('will-attach-webview', (event) => event.preventDefault())
  })

  return app.whenReady().then(async () => {
    const userData = app.getPath('userData')
    const dataDir = path.join(userData, 'data')
    const store = new ContentStore(dataDir, SEED)
    const problems = await store.init()
    if (problems.length) console.error(`content store has ${problems.length} integrity problem(s):\n${problems.join('\n')}`)

    const progress = new ProgressStore(path.join(userData, 'progress.json'))
    await progress.init()

    const settings = await readSettings(path.join(userData, 'settings.json'))
    let win: BrowserWindow | null = null
    const broadcast = (content: Content) => win?.webContents.send('content:changed', content)
    const agent = new Agent(store, path.join(userData, 'agent'), settings.agent ?? {}, broadcast)
    await agent.init()

    protocol.handle(SCHEME, async (request) => {
      const url = new URL(request.url)
      if (url.host !== 'app') return new Response('Not found', { status: 404 })
      const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
      const file = path.normalize(path.join(RENDERER_DIR, rel))
      if (!file.startsWith(RENDERER_DIR + path.sep)) return new Response('Forbidden', { status: 403 })
      try {
        const body = await readFile(file)
        return new Response(body, {
          headers: {
            'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
            'content-security-policy': CSP,
            'x-content-type-options': 'nosniff',
          },
        })
      } catch (e) {
        if (!isMissing(e)) console.error('protocol read failed:', file, e)
        return new Response('Not found', { status: 404 })
      }
    })

    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    // Export writes a file through the standard download path: show a Save dialog.
    session.defaultSession.on('will-download', (_e, item) => {
      item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) })
    })

    registerIpc({ store, progress, agent, isAppUrl })

    const send = (ev: MenuEvent) => (BrowserWindow.getFocusedWindow() ?? win)?.webContents.send('menu', ev)
    const history = () => (BrowserWindow.getFocusedWindow() ?? win)?.webContents.navigationHistory
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate({ send, history, dataDir })))
    app.setAboutPanelOptions({ applicationName: 'Prep', applicationVersion: app.getVersion() })

    const windowFile = path.join(userData, 'window.json')
    const createWindow = async () => {
      const bounds = await readBounds(windowFile)
      win = new BrowserWindow({
        ...(bounds ?? { width: 1280, height: 900 }),
        minWidth: 760,
        minHeight: 560,
        show: false,
        title: 'Prep',
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 13 },
        backgroundColor: BACKGROUND,
        webPreferences: {
          preload: PRELOAD,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          spellcheck: true,
        },
      })
      if (!opts.hidden) win.once('ready-to-show', () => win?.show())
      win.on('close', () => {
        if (win) void writeAtomic(windowFile, JSON.stringify(win.getNormalBounds()))
      })
      win.on('closed', () => {
        win = null
      })
      // Two-finger swipe (when enabled in System Settings) walks history.
      win.on('swipe', (_e, direction) => {
        const h = win?.webContents.navigationHistory
        if (direction === 'left' && h?.canGoBack()) h.goBack()
        if (direction === 'right' && h?.canGoForward()) h.goForward()
      })
      await win.loadURL(opts.devUrl ?? `${ORIGIN}/index.html`)
    }

    await createWindow()
    app.on('activate', () => {
      if (!win) void createWindow()
    })
    app.on('second-instance', () => {
      if (win?.isMinimized()) win.restore()
      win?.focus()
    })
    app.on('window-all-closed', () => {
      if (opts.userData) app.quit() // verification runs exit; the real app stays in the Dock like any Mac app
    })

    return { window: () => win, store, progress, agent, dataDir }
  })
}

// ---------------------------------------------------------------------------

interface Settings {
  agent?: AgentSettings
}

async function readSettings(file: string): Promise<Settings> {
  try {
    const v: unknown = JSON.parse(await readFile(file, 'utf8'))
    return v && typeof v === 'object' ? (v as Settings) : {}
  } catch (e) {
    if (!isMissing(e)) console.error('settings.json is unreadable; using defaults:', e)
    return {}
  }
}

async function readBounds(file: string): Promise<Electron.Rectangle | null> {
  try {
    const b = JSON.parse(await readFile(file, 'utf8')) as Electron.Rectangle
    if (![b.x, b.y, b.width, b.height].every((n) => typeof n === 'number')) return null
    // Only restore onto a display that still exists.
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y
    })
    return visible ? b : null
  } catch (e) {
    if (!isMissing(e)) console.error('window.json is unreadable:', e)
    return null
  }
}

function menuTemplate(ctx: {
  send: (ev: MenuEvent) => void
  history: () => Electron.NavigationHistory | undefined
  dataDir: string
}): MenuItemConstructorOptions[] {
  return [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'Reveal Data Folder', click: () => void shell.openPath(ctx.dataDir) },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+Alt+S', registerAccelerator: false, click: () => ctx.send('sidebar') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Go',
      submenu: [
        { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => ctx.send('home') },
        // Shortcuts below are shown here but handled in the page, so the code
        // editor keeps ⌘[ / ⌘] for indentation while it has focus.
        { label: 'Back', accelerator: 'CmdOrCtrl+[', registerAccelerator: false, click: () => ctx.history()?.goBack() },
        { label: 'Forward', accelerator: 'CmdOrCtrl+]', registerAccelerator: false, click: () => ctx.history()?.goForward() },
        { type: 'separator' },
        { label: 'Search…', accelerator: 'CmdOrCtrl+K', registerAccelerator: false, click: () => ctx.send('palette') },
        { label: 'Assistant', accelerator: 'CmdOrCtrl+J', registerAccelerator: false, click: () => ctx.send('assistant') },
      ],
    },
    { role: 'windowMenu' },
  ]
}

// ---- IPC: every handler checks its sender and its arguments ----

function registerIpc(ctx: { store: ContentStore; progress: ProgressStore; agent: Agent; isAppUrl: (url: string) => boolean }) {
  const { store, progress, agent, isAppUrl } = ctx
  const guard = (e: IpcMainInvokeEvent) => {
    const url = e.senderFrame?.url ?? ''
    if (!isAppUrl(url)) throw new Error(`blocked IPC from ${url || 'unknown frame'}`)
  }
  const str = (v: unknown, max: number, what: string): string => {
    if (typeof v !== 'string' || v.length > max) throw new Error(`invalid ${what}`)
    return v
  }

  ipcMain.handle('content:get', (e) => {
    guard(e)
    return store.get()
  })
  ipcMain.handle('progress:get', (e, key: unknown) => {
    guard(e)
    return progress.get(str(key, 200, 'key'))
  })
  ipcMain.handle('progress:set', (e, key: unknown, value: unknown) => {
    guard(e)
    return progress.set(str(key, 200, 'key'), str(value, 50_000_000, 'value'))
  })
  ipcMain.handle('progress:remove', (e, key: unknown) => {
    guard(e)
    return progress.remove(str(key, 200, 'key'))
  })
  ipcMain.handle('agent:run', (e, req: unknown) => {
    guard(e)
    const r = (req ?? {}) as { message?: unknown; transcript?: unknown }
    const message = str(r.message, 20_000, 'message').trim()
    if (!message) throw new Error('empty command')
    const transcript: TranscriptEntry[] = (Array.isArray(r.transcript) ? r.transcript : [])
      .filter((t): t is TranscriptEntry => {
        const x = t as TranscriptEntry
        return Boolean(x) && ['user', 'assistant', 'applied'].includes(x.role) && typeof x.text === 'string'
      })
      .slice(-20)
      .map((t) => ({ role: t.role, text: t.text.slice(0, 4000) }))
    return agent.run(message, transcript)
  })
  ipcMain.handle('agent:cancel', (e) => {
    guard(e)
    agent.cancel()
  })
  ipcMain.handle('agent:apply', (e, id: unknown) => {
    guard(e)
    return agent.apply(str(id, 100, 'plan id'))
  })
  ipcMain.handle('agent:discard', (e, id: unknown) => {
    guard(e)
    agent.discard(str(id, 100, 'plan id'))
  })
  ipcMain.handle('agent:undo', (e) => {
    guard(e)
    return agent.undo()
  })
  ipcMain.handle('agent:status', (e) => {
    guard(e)
    return agent.status()
  })
}
