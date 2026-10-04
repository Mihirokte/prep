import { createHash } from 'node:crypto'
import type { Area, Chapter, Company, Content, Course, Drill, Lesson, Pattern, Problem } from './types'

// Carrying a newer bundled seed into an existing data folder without losing
// anything the user (or the assistant) changed.
//
// The store on disk is the source of truth after first launch, so a new app
// version cannot simply overwrite it. Instead every record is compared with
// what the seed held when the store was last seeded (its hash):
//   - untouched since then  -> take the new seed version
//   - edited by the user    -> keep the user's version
//   - deleted by the user   -> stay deleted
//   - new in the seed       -> add it
//   - created by the user   -> keep it

export type Hashes = Record<string, string>

const hash = (v: unknown): string => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16)

type Rec = Record<string, unknown>
const omit = <T extends Rec>(o: T, k: string): Rec => {
  const { [k]: _dropped, ...rest } = o
  void _dropped
  return rest
}

/** Hash of every record in a content tree, keyed by a stable record key. */
export function entityHashes(c: Content): Hashes {
  const out: Hashes = {}
  for (const a of c.areas) {
    out[`area:${a.key}`] = hash(omit(a as unknown as Rec, 'drills'))
    for (const d of a.drills) out[`drill:${a.key}/${d.id}`] = hash(d)
  }
  for (const [id, p] of Object.entries(c.packs)) out[`pack:${id}`] = hash(p)
  for (const co of c.courses) {
    out[`course:${co.key}`] = hash(omit(co as unknown as Rec, 'chapters'))
    for (const ch of co.chapters) {
      out[`chapter:${co.key}/${ch.id}`] = hash(omit(ch as unknown as Rec, 'lessons'))
      for (const l of ch.lessons) out[`lesson:${co.key}/${ch.id}/${l.id}`] = hash(l)
    }
  }
  for (const p of c.patterns) out[`pattern:${p.key}`] = hash(p)
  for (const co of c.companies) out[`company:${co.key}`] = hash(co)
  return out
}

/** Decide one record. `undefined` means "no such record in the result". */
function pick<T>(key: string, cur: T | undefined, seed: T | undefined, base: Hashes, h: (v: T) => string = hash): T | undefined {
  const b = base[key]
  if (cur === undefined) return b === undefined ? seed : undefined
  if (seed === undefined) return h(cur) === b ? undefined : cur
  return h(cur) === b ? seed : cur
}

/** Merge a list of records: seed order first, then records only the user has. */
function mergeList<T>(
  prefix: string,
  cur: T[],
  seed: T[],
  idOf: (x: T) => string,
  base: Hashes,
  combine: (key: string, c: T | undefined, s: T | undefined) => T | undefined = (key, c, s) => pick(key, c, s, base),
): T[] {
  const curBy = new Map(cur.map((x) => [idOf(x), x]))
  const seedBy = new Map(seed.map((x) => [idOf(x), x]))
  const out: T[] = []
  for (const s of seed) {
    const id = idOf(s)
    const r = combine(`${prefix}${id}`, curBy.get(id), s)
    if (r !== undefined) out.push(r)
  }
  for (const c of cur) {
    const id = idOf(c)
    if (seedBy.has(id)) continue
    const r = combine(`${prefix}${id}`, c, undefined)
    if (r !== undefined) out.push(r)
  }
  return out
}

export function mergeSeed(current: Content, seed: Content, base: Hashes): Content {
  const areas = mergeList<Area>('area:', current.areas, seed.areas, (a) => a.key, base, (key, c, s) => {
    const meta = pick(key, c && (omit(c as unknown as Rec, 'drills') as unknown as Area), s && (omit(s as unknown as Rec, 'drills') as unknown as Area), base)
    if (!meta) return undefined
    const akey = (c ?? s)!.key
    const drills = mergeList<Drill>(
      '',
      c?.drills ?? [],
      s?.drills ?? [],
      (d) => d.id,
      base,
      (_k, cd, sd) => pick(`drill:${akey}/${(cd ?? sd)!.id}`, cd, sd, base),
    )
    return { ...(meta as unknown as Area), drills }
  })

  const packIds = new Set([...Object.keys(current.packs), ...Object.keys(seed.packs)])
  const packs: Record<string, Problem> = {}
  for (const id of [...Object.keys(seed.packs), ...Object.keys(current.packs)]) {
    if (id in packs || !packIds.has(id)) continue
    const r = pick(`pack:${id}`, current.packs[id], seed.packs[id], base)
    if (r !== undefined) packs[id] = r
  }

  const courses = mergeList<Course>('course:', current.courses, seed.courses, (c) => c.key, base, (key, c, s) => {
    const meta = pick(key, c && (omit(c as unknown as Rec, 'chapters') as unknown as Course), s && (omit(s as unknown as Rec, 'chapters') as unknown as Course), base)
    if (!meta) return undefined
    const ckey = (c ?? s)!.key
    const chapters = mergeList<Chapter>('', c?.chapters ?? [], s?.chapters ?? [], (ch) => ch.id, base, (_k, cc, sc) => {
      const chMeta = pick(`chapter:${ckey}/${(cc ?? sc)!.id}`, cc && (omit(cc as unknown as Rec, 'lessons') as unknown as Chapter), sc && (omit(sc as unknown as Rec, 'lessons') as unknown as Chapter), base)
      if (!chMeta) return undefined
      const chId = (cc ?? sc)!.id
      const lessons = mergeList<Lesson>('', cc?.lessons ?? [], sc?.lessons ?? [], (l) => l.id, base, (_k2, cl, sl) =>
        pick(`lesson:${ckey}/${chId}/${(cl ?? sl)!.id}`, cl, sl, base),
      )
      return { ...(chMeta as unknown as Chapter), lessons }
    })
    return { ...(meta as unknown as Course), chapters }
  })

  const patterns = mergeList<Pattern>('pattern:', current.patterns, seed.patterns, (p) => p.key, base)
  const companies = mergeList<Company>('company:', current.companies, seed.companies, (c) => c.key, base)

  return { schemaVersion: 1, areas, packs, courses, patterns, companies }
}
