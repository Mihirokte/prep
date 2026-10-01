// Install out/Prep-darwin-<arch>/Prep.app into /Applications.
// Replaces an existing /Applications/Prep.app only if it is this app (same
// bundle id); anything else with that name is left alone.
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const BUNDLE_ID = 'info.mihirokte.prep'
const src = join(ROOT, 'out', `Prep-darwin-${process.arch}`, 'Prep.app')
const dst = '/Applications/Prep.app'

if (!existsSync(src)) throw new Error(`${src} not found; run npm run package first`)

if (existsSync(dst)) {
  const id = execFileSync('/usr/bin/defaults', ['read', join(dst, 'Contents', 'Info'), 'CFBundleIdentifier'], {
    encoding: 'utf8',
  }).trim()
  if (id !== BUNDLE_ID) throw new Error(`${dst} belongs to another app (${id}); not replacing it`)
  rmSync(dst, { recursive: true, force: true })
}
execFileSync('/usr/bin/ditto', [src, dst])
console.log(`installed ${dst}`)
