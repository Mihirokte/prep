// Read URLs the way the assistant does and print what the model would see.
//   node scripts/run-ts.mjs scripts/read-sources.ts <url> [<url> ...]
// Useful to check a source before asking the assistant to build from it.

import { renderSources } from '../src/shared/sources'
import { WebReader } from '../src/main/web'

const urls = process.argv.slice(2).filter((a) => /^https?:\/\//.test(a))
if (!urls.length) throw new Error('usage: node scripts/run-ts.mjs scripts/read-sources.ts <url> [<url> ...]')
const sources = await new WebReader().readAll(urls, new AbortController().signal)
for (const s of sources) console.error(`${s.error ? 'FAIL' : 'ok  '} ${s.kind.padEnd(12)} ${String(s.text.length).padStart(7)} chars  ${s.url}${s.error ? `  (${s.error})` : ''}`)
console.log(renderSources(sources))
