// Dev loop: Vite dev server for the renderer (hot reload) + Electron pointed at it.
import { spawn, spawnSync } from 'node:child_process'
import electronPath from 'electron'
import { createServer } from 'vite'

const built = spawnSync(process.execPath, ['scripts/build-main.mjs'], { stdio: 'inherit' })
if (built.status !== 0) process.exit(built.status ?? 1)

const server = await createServer({ configFile: 'vite.config.ts' })
await server.listen()
const url = server.resolvedUrls?.local[0]
if (!url) throw new Error('vite dev server has no local URL')

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, PREP_DEV_URL: url } })
child.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})
