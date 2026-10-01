// Load the original web portal's data straight from its TypeScript modules —
// the same objects its pages render — by bundling them in memory with esbuild.
//
// Optional, maintainer-only. The app never depends on the web portal: its
// data ships in seed/content.json. These scripts exist to re-import from a
// checkout of the web portal's source, which must be named explicitly:
//
//   PORTFOLIO=/path/to/portfolio npm run import:seed
//   PORTFOLIO=/path/to/portfolio npm run import:verify
import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Area, Course, Pattern, Problem } from '../../src/shared/types'

/** Companies as the web portal models them: rounds and questions carry no ids. */
export interface PortalCompany {
  key: string
  questions: { round: string; questions: Record<string, unknown>[] }[]
  [field: string]: unknown
}

export interface PortalData {
  COURSES: Course[]
  PATTERNS: Pattern[]
  COMPANIES: PortalCompany[]
  AREAS: Area[]
  PACKS: Record<string, Problem>
}

/** The web portal checkout, from PORTFOLIO. No default: a clone of this repo
 *  stands alone and must not reach for a sibling directory by accident. */
export function portfolioDir(): string {
  const dir = process.env.PORTFOLIO
  if (!dir) {
    console.error(
      [
        'PORTFOLIO is not set.',
        'These import scripts read the original web portal source and are optional;',
        'the app already ships its data in seed/content.json.',
        'To re-import: PORTFOLIO=/path/to/portfolio npm run import:seed',
      ].join('\n'),
    )
    process.exit(2)
  }
  const resolved = path.resolve(dir)
  if (!existsSync(path.join(resolved, 'src', 'prep'))) {
    console.error(`${resolved} has no src/prep — PORTFOLIO must point at the web portal checkout.`)
    process.exit(2)
  }
  return resolved
}

export async function loadPortal(portfolio: string): Promise<PortalData> {
  const src = path.join(portfolio, 'src', 'prep')
  const mod = (p: string) => JSON.stringify(path.join(src, p))
  const entry = [
    `export { COURSES } from ${mod('content/index.ts')}`,
    `export { PATTERNS } from ${mod('content/patterns/index.ts')}`,
    `export { COMPANIES } from ${mod('content/companies/index.ts')}`,
    `export { AREAS } from ${mod('data/drills.ts')}`,
    `export { PACKS } from ${mod('data/packs.ts')}`,
  ].join('\n')
  const result = await build({
    stdin: { contents: entry, resolveDir: src, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'warning',
  })
  const code = result.outputFiles[0].text
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)) as PortalData
}

/** JSON is the storage format; compare what JSON can carry. */
export const asJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
