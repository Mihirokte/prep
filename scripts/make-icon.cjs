// Build resources/icon.icns from resources/icon.svg, rasterized by Electron's
// own Chromium (no image tooling needed). Run: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')

if (process.env.PREP_VERIFY_NO_SANDBOX === '1') app.commandLine.appendSwitch('no-sandbox')
app.dock?.hide()

const ROOT = path.resolve(__dirname, '..')
/** iconset names: icon_<n>x<n>.png and icon_<n>x<n>@2x.png for each base n */
const BASES = [16, 32, 128, 256, 512]

app.whenReady().then(async () => {
  const svg = readFileSync(path.join(ROOT, 'resources', 'icon.svg'), 'utf8')
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  })
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((r) => setTimeout(r, 400))
  const full = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })

  const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'prep-icon-')), 'Prep.iconset')
  require('node:fs').mkdirSync(dir)
  const png = (size) => full.resize({ width: size, height: size, quality: 'best' }).toPNG()
  for (const base of BASES) {
    writeFileSync(path.join(dir, `icon_${base}x${base}.png`), png(base))
    writeFileSync(path.join(dir, `icon_${base}x${base}@2x.png`), png(base * 2))
  }
  writeFileSync(path.join(ROOT, 'resources', 'icon.png'), full.toPNG())
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', dir, '-o', path.join(ROOT, 'resources', 'icon.icns')])
  console.log('wrote resources/icon.icns and resources/icon.png')
  app.exit(0)
})
