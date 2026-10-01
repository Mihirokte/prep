// Package dist/ + seed/ into out/Prep-darwin-<arch>/Prep.app.
import { packager } from '@electron/packager'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const KEEP = [/^\/package\.json$/, /^\/dist(\/|$)/, /^\/seed(\/|$)/]
const icon = join(ROOT, 'resources', 'icon.icns')

const paths = await packager({
  dir: ROOT,
  out: join(ROOT, 'out'),
  overwrite: true,
  platform: 'darwin',
  arch: process.arch,
  name: 'Prep',
  executableName: 'Prep',
  appBundleId: 'info.mihirokte.prep',
  appCategoryType: 'public.app-category.education',
  darwinDarkModeSupport: true,
  asar: true,
  prune: false,
  ...(existsSync(icon) ? { icon } : {}),
  // Everything else (sources, node_modules, the verification entry) stays out.
  ignore: (p) => (p !== '' && !KEEP.some((re) => re.test(p))) || p.startsWith('/dist/verify'),
})
console.log(`packaged: ${paths.map((p) => join(p, 'Prep.app')).join(', ')}`)
