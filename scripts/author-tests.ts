// Author local correctness cases for DSA packs that have none.
//
//   node scripts/run-ts.mjs scripts/author-tests.ts [--limit=N] [--batch=8]
//
// agy proposes inputs only: the examples from each problem statement (with the
// answer the statement gives) and a few edge inputs. Nothing it says is trusted:
// python3 runs the pack's reference solution on every input. A problem is kept
// only if the reference reproduces every statement example under the chosen
// compare mode; edge expectations are the reference's own output. Only plain
// function packs (value parameters, value return) qualify, since the worker
// passes values straight through.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Content, Problem, TestCase } from '../src/shared/types'
import { findAgy, runAgy } from '../src/main/agy'

const root = process.cwd()
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const limit = Number(arg('limit') ?? 1000)
const batchSize = Number(arg('batch') ?? 8)
const seedFile = path.join(root, 'seed', 'content.json')
const seed = JSON.parse(readFileSync(seedFile, 'utf8')) as Content
const tmp = mkdtempSync(path.join(os.tmpdir(), 'prep-tests-'))

const plain = (p: Problem) =>
  !p.tests?.length &&
  !!p.reference_solution &&
  p.signature?.returns?.kind === 'value' &&
  p.signature.params.every((x) => x.kind === 'value')
const todo = Object.values(seed.packs).filter(plain).slice(0, limit)
console.log(`${todo.length} packs to author`)

const schemaFile = path.join(tmp, 'schema.json')
writeFileSync(
  schemaFile,
  JSON.stringify({
    type: 'object',
    required: ['problems'],
    properties: {
      problems: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'compare', 'examples', 'edges'],
          properties: {
            id: { type: 'string' },
            compare: { type: 'string', enum: ['exact', 'unordered', 'unordered_deep', 'float'] },
            examples: {
              type: 'array',
              items: { type: 'object', required: ['args_json', 'expected_json'], properties: { args_json: { type: 'string' }, expected_json: { type: 'string' } } },
            },
            edges: { type: 'array', items: { type: 'object', required: ['args_json'], properties: { args_json: { type: 'string' } } } },
          },
        },
      },
    },
  }),
)

const RUNNER = `
import json, sys, copy, signal
def _same(actual, expected, mode):
    if mode == "unordered" and isinstance(actual, list) and isinstance(expected, list):
        return sorted(actual, key=repr) == sorted(expected, key=repr)
    if mode == "unordered_deep" and isinstance(actual, list) and isinstance(expected, list):
        norm = lambda xs: sorted([sorted(x, key=repr) if isinstance(x, list) else x for x in xs], key=repr)
        return norm(actual) == norm(expected)
    if mode == "float" and isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        return abs(actual - expected) <= 1e-6 * max(1, abs(expected))
    return actual == expected
job = json.load(open(sys.argv[1]))
ns = {}
exec("from typing import *\\nimport collections, heapq, math, bisect, itertools, functools\\nfrom collections import *\\n" + job["code"], ns)
fn = ns[job["name"]] if job["name"] in ns else getattr(ns["Solution"](), job["name"])
def alarm(*_): raise TimeoutError("slow")
signal.signal(signal.SIGALRM, alarm)
out = []
for case in job["cases"]:
    try:
        signal.alarm(3)
        actual = fn(*copy.deepcopy(case["args"]))
        signal.alarm(0)
        json.dumps(actual)
        ok = None if "expected" not in case else _same(actual, case["expected"], job["compare"])
        out.append({"ok": ok, "actual": actual})
    except Exception as e:
        signal.alarm(0)
        out.append({"error": type(e).__name__ + ": " + str(e)[:200]})
print(json.dumps(out))
`
const runnerFile = path.join(tmp, 'runner.py')
writeFileSync(runnerFile, RUNNER)

interface Proposal { id: string; compare: string; examples: { args_json: string; expected_json: string }[]; edges: { args_json: string }[] }
const parse = (s: string): unknown => {
  try { return JSON.parse(s) } catch { return undefined }
}

function check(p: Problem, prop: Proposal): { tests: TestCase[]; compare: string } | string {
  const examples = prop.examples.map((e) => ({ args: parse(e.args_json), expected: parse(e.expected_json) }))
  const edges = prop.edges.map((e) => ({ args: parse(e.args_json) }))
  const arity = p.signature.params.length
  const okArgs = (a: unknown) => Array.isArray(a) && a.length === arity
  if (examples.length < 1) return 'no statement example'
  if (!examples.every((e) => okArgs(e.args) && e.expected !== undefined)) return 'malformed example arguments'
  const edgesOk = edges.filter((e) => okArgs(e.args))
  const job = path.join(tmp, `${p.id}.json`)
  writeFileSync(job, JSON.stringify({ code: p.reference_solution, name: p.signature.name, compare: prop.compare, cases: [...examples, ...edgesOk] }))
  let res: { ok?: boolean | null; actual?: unknown; error?: string }[]
  try {
    res = JSON.parse(execFileSync('python3', [runnerFile, job], { encoding: 'utf8', timeout: 30_000 }))
  } catch (e) {
    return `runner failed: ${(e as Error).message.slice(0, 120)}`
  }
  const ex = res.slice(0, examples.length)
  const bad = ex.findIndex((r) => r.ok !== true)
  if (bad >= 0) return `statement example ${bad + 1} not reproduced (${ex[bad].error ?? JSON.stringify(ex[bad].actual).slice(0, 80)})`
  const tests: TestCase[] = examples.map((e) => ({ input: e.args as unknown[], expected: e.expected, kind: 'example', source: `${p.link} (problem statement example)` }))
  const seen = new Set(tests.map((t) => JSON.stringify(t.input)))
  res.slice(examples.length).forEach((r, i) => {
    const input = edgesOk[i].args as unknown[]
    if (r.error || seen.has(JSON.stringify(input))) return
    seen.add(JSON.stringify(input))
    tests.push({ input, expected: r.actual, kind: 'edge', source: 'expected value computed by the reference solution' })
  })
  if (tests.length < 4) return `only ${tests.length} usable cases`
  return { tests: tests.slice(0, 8), compare: prop.compare }
}

const bin = await findAgy()
if (!bin) throw new Error('agy not found')
let kept = 0
const rejected: string[] = []
for (let i = 0; i < todo.length; i += batchSize) {
  const batch = todo.slice(i, i + batchSize)
  const prompt = [
    'For each coding problem below, return test inputs as JSON. Rules:',
    '- examples: every worked example in the problem statement, with args_json = a JSON array of the positional arguments in signature order, and expected_json = the answer the statement gives. Copy them exactly; do not invent examples here.',
    '- edges: 3 to 4 small edge-case inputs (empty or minimal input, duplicates, negatives, boundaries) that satisfy the constraints. args_json only.',
    '- compare: "unordered" if the answer is a list whose order does not matter, "unordered_deep" if it is a list of lists where neither order matters, "float" for a floating-point answer, else "exact".',
    'Use JSON values (true/false/null), never Python literals.',
    '',
    ...batch.map((p) => `### id: ${p.id}\nTitle: ${p.title}\nSignature: ${p.signature.name}(${p.signature.params.map((x) => x.name).join(', ')})\n${p.description_md}\n`),
  ].join('\n')
  let props: Proposal[] = []
  try {
    const out = await runAgy(bin, prompt, { schemaFile, cwd: tmp, timeoutSec: 240, effort: 'low' }, () => {})
    props = ((out.structured as { problems?: Proposal[] } | null)?.problems ?? [])
  } catch (e) {
    console.log(`batch ${i / batchSize + 1}: agy failed: ${(e as Error).message.split('\n')[0]}`)
    continue
  }
  for (const p of batch) {
    const prop = props.find((x) => x.id === p.id)
    const r = prop ? check(p, prop) : 'no proposal'
    if (typeof r === 'string') { rejected.push(`${p.id} ${p.title}: ${r}`); continue }
    seed.packs[p.id] = { ...p, tests: r.tests, compare: r.compare }
    kept++
  }
  writeFileSync(seedFile, JSON.stringify(seed))
  console.log(`batch ${i / batchSize + 1}: kept ${kept} so far`)
}
console.log(`kept ${kept}/${todo.length}`)
for (const r of rejected) console.log(`  rejected ${r}`)
