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
import type { MenuEvent } from '../shared/api'
import type { Content } from '../shared/types'
import { Agent, type AgentSettings } from './agent'
import { bus } from './events'
import { createHandlers, type Handler } from './handlers'
import { isMissing, writeAtomic } from './fsutil'
import { ProgressStore } from './progress'
import { ContentStore } from './store'
import { tailnetIdentity } from './tailscale'
import { Tutor } from './tutor'
import { startWebServer, type WebServer } from './webserver'

// Main process. Owns the data on disk and the assistant; the renderer is a
// sandboxed page that reaches them only through the preload bridge.

const SCHEME = 'prep'
const ORIGIN = `${SCHEME}://app`
const RENDERER_DIR = path.join(__dirname, '..', 'renderer')
const PRELOAD = path.join(__dirname, '..', 'preload', 'index.cjs')
const SEED = path.join(__dirname, '..', '..', 'seed', 'content.json')
const BACKGROUND = '#212529' // dark body colour, so no flash on open

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
  /** Phone web server. By default it starts on loopback for the tailnet login
   *  that owns this Mac; verification runs pass their own settings or false. */
  web?: false | { port: number; logins: string[]; hosts: string[] }
}

export interface AppHandles {
  window(): BrowserWindow | null
  store: ContentStore
  progress: ProgressStore
  agent: Agent
  dataDir: string
  web: WebServer | null
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
    const broadcast = (content: Content) => {
      win?.webContents.send('content:changed', content)
      bus.emit('content')
    }
    bus.on('progress', (key) => win?.webContents.send('progress:changed', key))
    const progressLine = (text: string) => win?.webContents.send('agent:progress', text)
    const agent = new Agent(store, path.join(userData, 'agent'), settings.agent ?? {}, broadcast, progressLine)
    await agent.init()
    const tutorLine = (text: string) => win?.webContents.send('tutor:progress', text)
    const tutor = new Tutor(path.join(userData, 'agent'), settings.agent ?? {}, () => store.get(), tutorLine)
    await tutor.init()

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

    const handlers = createHandlers({ store, progress, agent, tutor })
    registerIpc(handlers, isAppUrl)

    let web: WebServer | null = null
    const webSettings = settings.web ?? {}
    const webConfig = opts.web ?? (opts.userData || webSettings.enabled === false ? false : await defaultWebConfig(webSettings.port))
    if (webConfig) {
      try {
        web = await startWebServer({
          handlers,
          rendererDir: RENDERER_DIR,
          csp: CSP,
          mime: MIME,
          allowedLogins: webConfig.logins,
          allowedHosts: webConfig.hosts,
          port: webConfig.port,
        })
      } catch (e) {
        console.error(`phone web server could not start on port ${webConfig.port}:`, e)
      }
    }

    const send = (ev: MenuEvent) => (BrowserWindow.getFocusedWindow() ?? win)?.webContents.send('menu', ev)
    const history = () => (BrowserWindow.getFocusedWindow() ?? win)?.webContents.navigationHistory
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate({ send, history, dataDir })))
    // The type credit lives here rather than in the sidebar: CC BY 3.0 asks for
    // a reasonable attribution, and the About panel is where a Mac app keeps it.
    app.setAboutPanelOptions({
      applicationName: 'Prep',
      applicationVersion: app.getVersion(),
      credits:
        'Interface in the Bootstrap 5.3 style, set in the system font.',
    })

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

    return { window: () => win, store, progress, agent, dataDir, web }
  })
}

// ---------------------------------------------------------------------------

interface Settings {
  agent?: AgentSettings
  /** Phone web server: on by default; set enabled false to switch it off. */
  web?: { enabled?: boolean; port?: number }
}

export const DEFAULT_WEB_PORT = 5390

async function defaultWebConfig(port?: number) {
  const me = await tailnetIdentity()
  if (!me) {
    console.error('phone web server not started: Tailscale is not running or not signed in')
    return false
  }
  return { port: port ?? DEFAULT_WEB_PORT, logins: [me.login], hosts: [me.dnsName, 'localhost', '127.0.0.1'] }
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

function registerIpc(handlers: Record<string, Handler>, isAppUrl: (url: string) => boolean) {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
      const url = e.senderFrame?.url ?? ''
      if (!isAppUrl(url)) throw new Error(`blocked IPC from ${url || 'unknown frame'}`)
      return handler(args, 'ipc')
    })
  }
}
