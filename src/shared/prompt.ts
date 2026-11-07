import type { AskContext, TranscriptEntry } from './api'
import { buildIndex, renderRecords, type RecordRef } from './digest'
import { ENTITIES } from './locate'
import { type MemoryNote, renderMemory } from './memory'
import { LIST_FIELDS, OP_KINDS, RELATIONS, TEXT_FIELDS } from './ops'
import { renderSources, type Source } from './sources'
import { TEACHING } from './teaching'
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
          find: { type: 'string', description: 'replace_text only: the exact passage to replace, copied from the record.' },
          replace: { type: 'string', description: 'replace_text only: the new text for that passage.' },
        },
        required: ['op'],
      },
    },
    remember: {
      type: 'array',
      description: 'New things to remember about the learner (preferences, goals, level, feedback on how they want to be taught), one short sentence each. Usually empty.',
      items: { type: 'string' },
    },
    forget: {
      type: 'array',
      description: 'Ids of LEARNER MEMORY notes the learner asked you to drop.',
      items: { type: 'string' },
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
    fetch: {
      type: 'array',
      description: 'Web or GitHub URLs to read before you can plan or answer. The app downloads them and asks again with their text under SOURCES.',
      items: { type: 'string' },
    },
    tasks: {
      type: 'array',
      description: 'For work too large for one plan: independent slices, each run as its own command and combined into one plan.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'A few words, shown to the user.' },
          instructions: { type: 'string', description: 'The complete brief for this slice, naming every id it creates or changes.' },
          urls: { type: 'array', items: { type: 'string' }, description: 'Source URLs this slice must read.' },
        },
        required: ['title', 'instructions'],
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

const textFields = Object.entries(TEXT_FIELDS)
  .flatMap(([e, fields]) => (fields ?? []).map((f) => `${e}.${f}`))
  .join(', ')

const INSTRUCTIONS = `You are the data editor and the teacher inside "Prep", a personal interview-preparation app. Turn the user's command into a change plan over the app's content store, or answer their question as a teacher (see EXPLAINING).

RULES
- Do not use any tools, commands or files. Everything you know is in this message. To read a web page or a GitHub repository, list its URL in "fetch" (see SOURCES).
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
- lesson    id = "<course key>-<slug>". parent = chapter id. Fields: title, minutes, body (markdown with the blocks under LESSONS), deeper? (markdown "Go deeper" section).
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
- replace_text  entity, id, field, find, replace. Edits one passage in place: "find" is copied exactly from the record and appears once in that field; "replace" is the new text ("" deletes it). Text fields: ${textFields}. Prefer it over update when only part of a long text changes.
List fields: ${listFields}.
New ids: lowercase letters and digits joined by hyphens, following the conventions above; problems take the next free number.

${TEACHING}

LESSONS (format)
- Body 650 to 1100 words; "deeper" 250 to 700 words of internals, formulas or edge cases. minutes = round(words / 180).
- Titles 4 to 8 words; headings 2 to 6 words; no quotes or apostrophes in either (the display font has a tiny glyph set). Plain ASCII punctuation: "->" for arrows, no em dashes, no emojis.
- At least one diagram block in the body, one check block right after the core mechanism, and the body ends with exactly one recall block of 3 to 5 questions that test understanding (why, when, what breaks).
- Rich blocks are fenced code blocks with these exact info strings:
  flow: optional first line "dir: LR" or "dir: TB"; node lines "id: Label | kind" with kind one of step, actor, model, store, tool, gate (labels <= 28 chars, <= 12 nodes); edge lines "a -> b : label" or "a --> b" for dashed (labels <= 24 chars). Declare every node before an edge uses it.
  mermaid: "sequenceDiagram" then "participant X as Name" lines (<= 6), messages "X->>Y: text" or "X-->>Y: text" (<= 40 chars), and "Note over X: text". Nothing else.
  stack (one bar split into parts) and bars (compared magnitudes): optional "title: ..." and "unit: ..." lines, then 2 to 8 rows "Label | number | optional note"; the number has no unit in it.
  steps: 3 to 8 rows "Title | one-sentence description".
  recall: "Q: question" then "A: answer" lines, repeated.
  check: one question with instant feedback: "Q: question", then 2 to 5 option lines "- wrong option" or "* right option" (exactly one "*"), then "Why: explanation".
- Callouts: a blockquote starting with a bold label, one of Pitfall, Interview, Rule of thumb, Numbers, Key idea: "> **Pitfall.** text". At most 4 per lesson.
- Code fences take a language (python, json, text); Python sketches at most 25 lines and correct. Never invent statistics or prices; label illustrative numbers as illustrative.

SOURCES (web pages and GitHub repositories)
- To read a page, a repository, a directory or a file, put its URL in "fetch" and return no operations yet. The app downloads it and asks you again with the text under SOURCES. URLs in the command are read before you see it.
- A GitHub repository URL gives its description, licence, README and a two-level directory listing. Fetch https://github.com/<owner>/<repo>/tree/<branch>/<dir> to list a directory and https://github.com/<owner>/<repo>/blob/<branch>/<file> to read a file.
- Fetch only what the work needs: at most 8 URLs a round. FETCH ROUNDS LEFT says how many rounds remain.
- Content built from a source:
  - Map it onto this app first: compare the source with the courses, chapters and lessons in the INDEX, extend what overlaps, and add only what is missing. Never duplicate a lesson that exists.
  - Write it as lessons in this app's format (LESSONS above), enriched with diagrams, a worked example and a recall deck. Keep the source's facts; do not pad it with claims it does not make.
  - Copy text word for word only when the source's licence (shown with it) allows reuse, and otherwise write it in your own words. Either way, add the source to the course's "references" ({label, url}) unless it is there already.
  - In "reply", say what you took from the source and what is left for a later command.

LARGE WORK (tasks)
- One plan holds at most about 4 new or rewritten lessons. For more, return "tasks" instead: 2 to 10 slices, each a complete brief for one part (for example one new chapter with its lessons, or new lessons for one existing chapter), with the source URLs that slice must read in "urls".
- Every task runs on its own, in parallel, under these same rules, and the app combines all slices into one plan the user reviews. So each brief names the exact ids it creates and the existing ids it changes, and no two tasks touch the same record: a chapter and its new lessons go in the same task.
- Next to "tasks" you may return "operations" for shared edits that belong to no single slice, such as adding the source to a course's references. They apply first, and no task may touch those records.
- Read enough of the source before you split it (the listing and the key files), so each brief is specific. "reply" says how the work is split.`

/** Set when the command is one slice of a larger job. */
export interface SliceContext {
  /** The user's original command. */
  parent: string
  /** What the planning step said about the split. */
  planReply: string
  titles: string[]
  index: number
}

export interface PromptInput {
  content: Content
  command: string
  transcript: TranscriptEntry[]
  records: RecordRef[]
  sources?: Source[]
  fetchRoundsLeft?: number
  slice?: SliceContext
  /** Errors from the previous attempt, to be fixed. */
  rejected?: string[]
  /** The previous attempt's operations, shown next to the errors. */
  previousPlan?: unknown
  /** The passage the reader selected, when the command came from a page. */
  context?: AskContext
  /** What the assistant remembers about the learner. */
  memory?: readonly MemoryNote[]
  date: string
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

const MEMORY_RULES = `To save something new the learner tells you about how they learn, what they already know, their goal or their level, put it in "remember" as one short third-person sentence ("Prefers worked examples before formulas."). Never save content facts or anything secret. Follow these notes in every answer and every lesson you write. If the learner retracts a note, put its id in "forget".`

function readerContext(c: AskContext, content: Content): string {
  let page: string
  if (c.kind === 'lesson') {
    const course = content.courses.find((x) => x.key === c.courseKey)
    const lesson = course?.chapters.flatMap((ch) => ch.lessons).find((l) => l.id === c.lessonId)
    page = `lesson ${c.lessonId}${lesson ? ` "${lesson.title}"` : ''} in course ${c.courseKey} (#/study/${c.courseKey}/${c.lessonId}). Its full record is under FULL RECORDS.`
  } else {
    const rec = contextRecord(c)
    page = `${c.route}${rec ? `, which shows ${rec.entity} ${rec.id} (its full record is under FULL RECORDS)` : ''}.`
  }
  const target = c.kind === 'lesson' ? 'that lesson' : 'the record the page shows'
  return `READER CONTEXT (the learner selected a passage while reading and wrote the command about it)
Page: ${page}
Selected passage (as rendered on the page, so markdown marks may be missing):
"""
${clip(c.quote, 3_000)}
"""
Decide what the command is, and do every part that applies:
- A question about the passage: answer in "reply" following EXPLAINING, with no operations.
- A request to change the content (simplify, add an example, expand, rewrite, fix): operations on ${target} plus a one-sentence "reply". For one passage use replace_text, with "find" copied exactly from the record's markdown (long enough to be unique) and "replace" written following TEACHING. For "rewrite this lesson", update its body (and deeper) as a whole, following TEACHING. Keep every other part intact.
- Feedback that the passage is wrong, unclear, too dense or too shallow: fix it as above and say in "reply" what you changed and why.
- A preference about how they want to learn: put it in "remember" and apply it now.
A command can be several of these at once, for example a question that shows the passage is unclear: answer it in "reply" and also propose the fix.`
}

/** The record a page shows, so its full text goes into the prompt. */
export function contextRecord(c: AskContext): RecordRef | null {
  if (c.kind === 'lesson') return { entity: 'lesson', id: c.lessonId }
  const m = /^#\/(pattern|drill|company|study)\/([^/]+)$/.exec(c.route)
  if (!m) return null
  const entity = ({ pattern: 'pattern', drill: 'problem', company: 'company', study: 'course' } as const)[m[1] as 'pattern']
  return { entity, id: decodeURIComponent(m[2]) }
}

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
  if (input.sources?.length) sections.push(`SOURCES (downloaded for this command)\n\n${renderSources(input.sources)}`)
  const left = input.fetchRoundsLeft ?? 0
  sections.push(`FETCH ROUNDS LEFT: ${left}${left === 0 ? ' (work with the sources you have; "fetch" is ignored now)' : ''}`)
  if (history) sections.push(`CONVERSATION SO FAR (oldest first)\n${history}`)
  sections.push(`LEARNER MEMORY\n${renderMemory(input.memory ?? [])}\n${MEMORY_RULES}`)
  if (input.context) sections.push(readerContext(input.context, input.content))
  if (input.slice) {
    const s = input.slice
    sections.push(
      `THIS COMMAND IS ONE SLICE OF A LARGER JOB\nThe user's command: ${clip(s.parent, 4_000)}\nHow the work was split: ${clip(s.planReply, 2_000)}\nAll slices:\n${s.titles
        .map((t, i) => `${i + 1}. ${t}${i === s.index ? '   <- yours' : ''}`)
        .join('\n')}\nDo only your slice, exactly as briefed, and return its operations. Do not return tasks. Other slices create their own records at the same time, so never reference an id another slice creates.`,
    )
  }
  if (input.rejected?.length)
    sections.push(
      (input.previousPlan ? `YOUR PREVIOUS PLAN\n${clip(JSON.stringify(input.previousPlan), 30_000)}\n\n` : '') +
        `IT WAS REJECTED. Fix every problem below and return the complete corrected plan:\n- ${input.rejected.join('\n- ')}`,
    )
  sections.push(`COMMAND\n${input.command}`)
  return sections.join('\n\n')
}
