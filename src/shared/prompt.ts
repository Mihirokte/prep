import type { TranscriptEntry } from './api'
import { buildIndex, renderRecords, type RecordRef } from './digest'
import { ENTITIES } from './locate'
import { LIST_FIELDS, OP_KINDS, RELATIONS } from './ops'
import type { Content } from './types'

// The assistant's contract with the model: instructions, the JSON schema its
// answer must match, and the assembly of one prompt. Pure — main/agent.ts does
// the process work.

/** Structured output enforced by `agy --json-schema`. */
export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: {
      type: 'string',
      description:
        'Shown to the user. For a change plan: one or two sentences saying what will change. For a question: the direct answer (markdown; link pages only with the #/ routes listed under PAGES).',
    },
    operations: {
      type: 'array',
      description: 'The change plan. Empty for questions, and empty while "need" is non-empty.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          op: { type: 'string', enum: [...OP_KINDS] },
          entity: { type: 'string', enum: [...ENTITIES] },
          id: { type: 'string' },
          parent: { type: 'string' },
          index: { type: 'integer' },
          field: { type: 'string' },
          relation: { type: 'string', enum: [...RELATIONS] },
          from: { type: 'string' },
          to: { type: 'string' },
          data_json: { type: 'string', description: 'A JSON object, encoded as a string.' },
          items_json: { type: 'string', description: 'A JSON array, encoded as a string.' },
        },
        required: ['op'],
      },
    },
    need: {
      type: 'array',
      description: 'Records you must read in full before you can plan. Leave empty when you have what you need.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          entity: { type: 'string', enum: [...ENTITIES] },
          id: { type: 'string' },
        },
        required: ['entity', 'id'],
      },
    },
  },
  required: ['reply', 'operations'],
} as const

const listFields = Object.entries(LIST_FIELDS)
  .flatMap(([e, fields]) =>
    Object.entries(fields ?? {}).map(([f, match]) => `${e}.${f}${match ? ` (objects, matched by ${match})` : ''}`),
  )
  .join(', ')

const INSTRUCTIONS = `You are the data editor inside "Prep", a personal interview-preparation app. Turn the user's command into a change plan over the app's content store, or answer their question about the content.

RULES
- Do not use any tools, commands or files. Everything you know about the data is in this message.
- If you need a record that is not shown in full below, list it in "need" and return no operations yet.
- Only change what the user asked for. Reference only ids that exist in the index, or ids you create in the same plan.
- A question gets an answer in "reply" and no operations.
- When a list gains or loses items, use add_items / remove_items (or link / unlink for mappings) instead of rewriting the whole list.
- Keep existing content intact, and match the tone, depth and accuracy of the existing records when you write new content (answers, variants, patterns, lessons). Be technically correct.
- If a command is ambiguous in a way that changes what gets edited, ask in "reply" and return no operations.

ENTITIES  (id = how the record is addressed; parent = where a child record lives)
- area      id = key. Fields: label. Children: problems.
- problem   id = "<area>-NNN". parent = area key. Fields: title, topic, difficulty ("Easy" | "Medium" | "Hard"), prompt, link, notes, solution? (markdown).
- pack      id = the problem id (only DSA problems have one). Runnable statement for the code editor. Fields: slug, title, difficulty, topic?, link, description_md (markdown statement with an example and constraints), signature {name, type? ("class" for design problems), params: [{name, kind?}], returns?: {kind?}}, starter_code (Python), reference_solution? (Python), solution_source?.
- course    id = key. Fields: label, blurb, problemAreaKey?, suppressedProblemIds?, references? [{label, url}]. Children: chapters.
- chapter   id = "<course key>-<slug>". parent = course key. Fields: title, summary, problemIds? (practice problems). Children: lessons.
- lesson    id = "<course key>-<slug>". parent = chapter id. Fields: title, minutes, body (markdown; \`\`\`mermaid sequenceDiagram fences render as diagrams), deeper? (markdown "Go deeper" section).
- pattern   id = key (slug of the name). Fields: name, family, canonical (true only for the 16 canonical patterns), essence (one sentence), cues [], mechanism (markdown), template (Python), complexity, pitfalls [], contrasts? [{key, how}], problemIds [].
- company   id = key (slug of the name). Fields: name, descriptor (one neutral line: what the company does, where, size), rolesCovered?, coverage ("good" | "moderate" | "thin"), lldPrep [{topic, why}], specialNotes [], dsaPatterns? [{key, basis ("reported" | "implied"), why}]. Children: rounds. The "updated" date is stamped automatically.
- round     id = "<company key>-<slug of round name>". parent = company key. Fields: round (its name, e.g. "DSA", "LLD / machine coding"). Children: questions.
- question  id = "<round id>-<n>". parent = round id. Fields: q (the question), answer (short answer sketch: enough to understand and answer it well), related? [variants an interviewer could form from it], patterns? [pattern keys].
Company research is written as neutral company data: never mention who compiled it, how it was gathered, or anyone's own interviews.

PAGES (the only valid links; any other #/ path opens "Not found")
- #/ (home), #/dsa (DSA problem list), #/patterns (pattern index), #/companies (company index)
- #/drill/<problem id>   one problem, DSA or discussion; its pack opens on the same page
- #/pattern/<pattern key>
- #/company/<company key>
- #/study/<course key>   and   #/study/<course key>/<lesson id>
Chapters, rounds and questions have no page of their own: link the course or company they belong to.

MAPPINGS (use link / unlink)
- pattern-problem   from = pattern key, to = problem id
- question-pattern  from = question id, to = pattern key
- company-pattern   from = company key, to = pattern key, data_json {"basis": "reported" | "implied", "why": "what in the round points here"}
- chapter-problem   from = chapter id,  to = problem id
- pattern-contrast  from = pattern key, to = pattern key, data_json {"how": "how to tell the two apart"}

OPERATIONS (data_json and items_json are JSON encoded as a string)
- create        entity, id, parent (for child records), data_json (the record's fields; child records may be nested, e.g. a company's "questions" as rounds with their questions), index? (0-based position)
- update        entity, id, data_json (only the fields that change; null removes an optional field). Ids never change.
- delete        entity, id. Children and every reference to the record are removed automatically.
- move          entity, id, parent? (a new parent), index? (0-based position)
- add_items     entity, id, field, items_json (values to append)
- remove_items  entity, id, field, items_json (exact values, or 0-based indexes)
- link / unlink relation, from, to, data_json? (link only)
List fields: ${listFields}.
New ids: lowercase letters and digits joined by hyphens, following the conventions above; problems take the next free number.`

export interface PromptInput {
  content: Content
  command: string
  transcript: TranscriptEntry[]
  records: RecordRef[]
  /** Errors from the previous attempt, to be fixed. */
  rejected?: string[]
  /** The previous attempt's operations, shown next to the errors. */
  previousPlan?: unknown
  date: string
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

export function buildPrompt(input: PromptInput): string {
  const { text, omitted } = renderRecords(input.content, input.records)
  const history = input.transcript
    .slice(-10)
    .map((t) => `${t.role === 'user' ? 'User' : t.role === 'assistant' ? 'Assistant' : 'Applied'}: ${clip(t.text, 700)}`)
    .join('\n')

  const sections = [
    INSTRUCTIONS,
    `TODAY: ${input.date}`,
    `INDEX (every record)\n${buildIndex(input.content)}`,
    `FULL RECORDS\n${text || '(none matched the command; request any you need via "need")'}` +
      (omitted.length ? `\n(Also relevant but not shown for space: ${omitted.map((r) => `${r.entity} ${r.id}`).join(', ')})` : ''),
  ]
  if (history) sections.push(`CONVERSATION SO FAR (oldest first)\n${history}`)
  if (input.rejected?.length)
    sections.push(
      (input.previousPlan ? `YOUR PREVIOUS PLAN\n${clip(JSON.stringify(input.previousPlan), 30_000)}\n\n` : '') +
        `IT WAS REJECTED. Fix every problem below and return the complete corrected plan:\n- ${input.rejected.join('\n- ')}`,
    )
  sections.push(`COMMAND\n${input.command}`)
  return sections.join('\n\n')
}
