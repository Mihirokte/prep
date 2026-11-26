import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { brotliCompress, constants, gzip } from 'node:zlib'
import { bus } from './events'
import { type Handler, WEB_CHANNELS } from './handlers'

// The phone's door. A small HTTP server that listens on loopback only; Tailscale
// Serve puts HTTPS in front of it for the tailnet. It serves the built pages and
// a JSON API over the same call table the Mac window uses, restricted to
// WEB_CHANNELS. Idle cost is one listening socket: no polling, no timers while
// nobody is connected, and every compressed file is built once and kept.

const brotliAsync = promisify(brotliCompress)
// Quality 5 compresses the 8 MB library in about a tenth of a second; the default 11 takes many seconds of CPU.
const brotli = (buf: Buffer) => brotliAsync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 5, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } })
const gz = promisify(gzip)

const MAX_BODY = 8_100_000
const MAX_EVENT_CLIENTS = 8
const HEARTBEAT_MS = 25_000
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/

export interface WebServerOptions {
  handlers: Record<string, Handler>
  rendererDir: string
  csp: string
  mime: Record<string, string>
  /** Tailscale logins that may use the server, lower case. */
  allowedLogins: string[]
  /** Host names the server answers to (without port), lower case. */
  allowedHosts: string[]
  port: number
  host?: string
}

export interface WebServer {
  port: number
  close(): Promise<void>
}

interface Packed {
  etag: string
  type: string
  raw: Buffer
  br?: Buffer
  gz?: Buffer
}

export function startWebServer(opts: WebServerOptions): Promise<WebServer> {
  const logins = new Set(opts.allowedLogins.map((l) => l.toLowerCase()))
  const hosts = new Set(opts.allowedHosts.map((h) => h.toLowerCase()))
  const root = path.resolve(opts.rendererDir)
  const files = new Map<string, Packed>()
  let contentVersion = 0
  let contentPack: Packed | null = null
  const offContent = bus.on('content', () => {
    contentVersion++
    contentPack = null
  })

  const common: Record<string, string> = {
    'content-security-policy': opts.csp,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'cross-origin-resource-policy': 'same-origin',
  }

  const send = (res: ServerResponse, status: number, body: string | Buffer, headers: Record<string, string> = {}) => {
    const buf = typeof body === 'string' ? Buffer.from(body) : body
    res.writeHead(status, { ...common, 'content-length': String(buf.length), ...headers })
    res.end(buf)
  }
  const sendJson = (res: ServerResponse, status: number, value: unknown) =>
    send(res, status, JSON.stringify(value), { 'content-type': 'application/json', 'cache-control': 'no-store' })

  const authorize = (req: IncomingMessage): string | null => {
    const login = String(req.headers['tailscale-user-login'] ?? '').toLowerCase()
    if (!login || !logins.has(login)) return 'forbidden'
    const host = String(req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '')
    if (!hosts.has(host)) return 'unknown host'
    const origin = req.headers.origin
    if (origin) {
      try {
        if (new URL(origin).host.toLowerCase() !== String(req.headers.host ?? '').toLowerCase()) return 'cross-origin request'
      } catch {
        return 'cross-origin request'
      }
    }
    return null
  }

  /** Answer with the best encoding the browser accepts; compress at most once per file. */
  const sendPacked = async (req: IncomingMessage, res: ServerResponse, pack: Packed, cache: string) => {
    if (req.headers['if-none-match'] === pack.etag) {
      res.writeHead(304, { ...common, etag: pack.etag, 'cache-control': cache })
      res.end()
      return
    }
    const accept = String(req.headers['accept-encoding'] ?? '')
    const headers: Record<string, string> = { 'content-type': pack.type, etag: pack.etag, 'cache-control': cache, vary: 'accept-encoding' }
    if (COMPRESSIBLE.test(pack.type) && pack.raw.length > 1024) {
      if (/\bbr\b/.test(accept)) {
        pack.br ??= await brotli(pack.raw)
        send(res, 200, pack.br, { ...headers, 'content-encoding': 'br' })
        return
      }
      if (/\bgzip\b/.test(accept)) {
        pack.gz ??= await gz(pack.raw)
        send(res, 200, pack.gz, { ...headers, 'content-encoding': 'gzip' })
        return
      }
    }
    send(res, 200, pack.raw, headers)
  }

  const serveContent = async (req: IncomingMessage, res: ServerResponse) => {
    if (!contentPack) {
      const raw = Buffer.from(JSON.stringify(await opts.handlers['content:get']([], 'web')))
      contentPack = { etag: `"c${contentVersion}-${raw.length}"`, type: 'application/json', raw }
    }
    await sendPacked(req, res, contentPack, 'no-cache')
  }

  const serveStatic = async (req: IncomingMessage, res: ServerResponse, pathname: string) => {
    let rel: string
    try {
      rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
    } catch {
      return send(res, 400, 'bad path')
    }
    const file = path.resolve(root, `.${rel}`)
    // The phone never runs Python, so the 13 MB runtime is not offered to it.
    if (!file.startsWith(root + path.sep) || /^\/(pyodide\/|validate-worker\.mjs)/.test(rel))
      return send(res, 404, 'Not found')
    try {
      const info = await stat(file)
      if (!info.isFile()) return send(res, 404, 'Not found')
      let pack = files.get(file)
      const etag = `"${info.size}-${Math.floor(info.mtimeMs)}"`
      if (!pack || pack.etag !== etag) {
        pack = { etag, type: opts.mime[path.extname(file)] ?? 'application/octet-stream', raw: await readFile(file) }
        files.set(file, pack)
      }
      await sendPacked(req, res, pack, rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
    } catch {
      send(res, 404, 'Not found')
    }
  }

  const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_BODY) {
          reject(new Error('request too large'))
          req.destroy()
          return
        }
        chunks.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })

  const call = async (req: IncomingMessage, res: ServerResponse, channel: string) => {
    if (!WEB_CHANNELS.has(channel) || !opts.handlers[channel]) return sendJson(res, 404, { ok: false, error: 'unknown call' })
    if (!/^application\/json/.test(String(req.headers['content-type'] ?? ''))) return sendJson(res, 415, { ok: false, error: 'JSON only' })
    try {
      const body: unknown = JSON.parse((await readBody(req)) || '{}')
      const args = body && typeof body === 'object' && Array.isArray((body as { args?: unknown }).args) ? (body as { args: unknown[] }).args : []
      const result = await opts.handlers[channel](args, 'web')
      sendJson(res, 200, { ok: true, result: result ?? null })
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  // Server-sent events: one tiny notice per change; the heartbeat runs only while someone is listening.
  const clients = new Set<ServerResponse>()
  let heartbeat: NodeJS.Timeout | null = null
  const broadcast = (event: string, data: unknown) => {
    for (const c of clients) c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  const offBus = [bus.on('content', () => broadcast('content', {})), bus.on('progress', (key) => broadcast('progress', { key }))]
  const events = (req: IncomingMessage, res: ServerResponse) => {
    if (clients.size >= MAX_EVENT_CLIENTS) {
      const oldest = clients.values().next().value
      if (oldest) {
        clients.delete(oldest)
        oldest.end()
      }
    }
    res.writeHead(200, { ...common, 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
    res.write('retry: 3000\n\nevent: hello\ndata: {}\n\n')
    clients.add(res)
    heartbeat ??= setInterval(() => {
      for (const c of clients) c.write(': keep-alive\n\n')
    }, HEARTBEAT_MS)
    req.on('close', () => {
      clients.delete(res)
      if (clients.size === 0 && heartbeat) {
        clearInterval(heartbeat)
        heartbeat = null
      }
    })
  }

  const server: Server = createServer((req, res) => {
    void (async () => {
      const denied = authorize(req)
      if (denied) return send(res, 403, denied)
      const url = new URL(req.url ?? '/', 'http://local')
      if (url.pathname === '/api/events' && req.method === 'GET') return events(req, res)
      if (url.pathname === '/api/content' && req.method === 'GET') return await serveContent(req, res)
      const m = /^\/api\/call\/([a-z]+:[a-z]+)$/.exec(url.pathname)
      if (m && req.method === 'POST') return await call(req, res, m[1])
      if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, error: 'unknown call' })
      if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res, url.pathname)
      send(res, 405, 'Method not allowed')
    })().catch((e) => {
      console.error('web server request failed:', e)
      if (!res.headersSent) send(res, 500, 'Server error')
      else res.destroy()
    })
  })
  server.requestTimeout = 60_000
  server.headersTimeout = 20_000
  server.keepAliveTimeout = 5_000
  server.maxConnections = 32

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port, opts.host ?? '127.0.0.1', () => {
      const addr = server.address()
      resolve({
        port: typeof addr === 'object' && addr ? addr.port : opts.port,
        close: () =>
          new Promise<void>((done) => {
            offContent()
            offBus.forEach((off) => off())
            if (heartbeat) clearInterval(heartbeat)
            for (const c of clients) c.end()
            server.close(() => done())
            server.closeAllConnections()
          }),
      })
    })
  })
}
