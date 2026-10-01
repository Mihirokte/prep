// Copy the Pyodide runtime the validator worker loads into the renderer's
// public dir (git-ignored), so it ships inside the app and works offline.
import { copyFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'node_modules', 'pyodide')
const DST = join(ROOT, 'src', 'renderer', 'public', 'pyodide')
const FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']

mkdirSync(DST, { recursive: true })
for (const f of FILES) copyFileSync(join(SRC, f), join(DST, f))
console.log(`pyodide: copied ${FILES.length} runtime files`)
