// Bundle the main process, the preload bridge and the verification entry into
// self-contained CommonJS files. The packaged app needs no node_modules.
import { build } from 'esbuild'

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  legalComments: 'none',
  logLevel: 'warning',
}

await Promise.all([
  build({ ...common, entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.cjs' }),
  build({ ...common, entryPoints: ['src/main/verify.ts'], outfile: 'dist/verify/index.cjs' }),
  build({ ...common, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.cjs' }),
])
console.log('main, preload and verify bundles built')
