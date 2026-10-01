// Run a TypeScript script: bundle it with esbuild (bare imports stay external
// and resolve from this project's node_modules), then import it.
import { build } from 'esbuild'
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const entry = process.argv[2]
if (!entry) throw new Error('usage: node scripts/run-ts.mjs <script.ts>')

const dir = join(resolve(import.meta.dirname, '..'), 'node_modules', '.cache', 'prep-run')
mkdirSync(dir, { recursive: true })
const out = join(dir, `script-${process.pid}.mjs`)
await build({
  entryPoints: [resolve(entry)],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  logLevel: 'warning',
})
try {
  await import(pathToFileURL(out).href)
} finally {
  rmSync(out, { force: true })
}
