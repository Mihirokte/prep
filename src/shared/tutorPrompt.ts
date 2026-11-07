// Prompts and output schemas for the tutor graphs. agy enforces the schema;
// src/shared/tutor.ts then checks the content (grounding, snippets, keys).

import type { Pattern, Problem } from './types'

export const PROMPT_VERSION = 1

export const QUESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['q', 'options', 'answer', 'why', 'quote'],
        properties: {
          q: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'integer', description: 'Index 0 to 3 of the right option.' },
          why: { type: 'string' },
          quote: { type: 'string', description: 'A sentence copied word for word from the lesson.' },
        },
      },
    },
  },
}

export const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'summary', 'pattern', 'issues', 'edgeCases', 'complexity', 'next'],
  properties: {
    verdict: { type: 'string', enum: ['correct', 'partial', 'incorrect'] },
    summary: { type: 'string' },
    pattern: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'fits', 'note'],
      properties: { key: { type: ['string', 'null'] }, fits: { type: 'boolean' }, note: { type: 'string' } },
    },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['snippet', 'problem', 'fix'],
        properties: { snippet: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } },
      },
    },
    edgeCases: { type: 'array', items: { type: 'string' } },
    complexity: {
      type: 'object',
      additionalProperties: false,
      required: ['time', 'space'],
      properties: { time: { type: 'string' }, space: { type: 'string' } },
    },
    next: { type: 'string' },
  },
}

export function questionsPrompt(input: { title: string; source: string; want: number; keep: string[]; rejected: string[] }): string {
  const parts = [
    'You write test questions for one lesson in a technical interview-prep course.',
    'Use ONLY facts stated in the lesson below. Do not add outside knowledge.',
    '',
    `Write ${input.want} multiple-choice questions. Rules:`,
    '- Test understanding and use of the idea (apply it to a case, predict an outcome, pick the right trade-off), not recall of wording.',
    '- Exactly 4 options, exactly one right. Wrong options must be plausible mistakes a learner makes. Keep the options a similar length.',
    '- "answer" is the 0-based index of the right option. Vary its position across questions.',
    '- "why": two sentences. Why the right option is right, and why the most tempting wrong option is wrong.',
    '- "quote": copy one sentence from the lesson, word for word, that supports the right answer. 20 to 300 characters. Do not paraphrase it.',
    '- Each question covers a different point of the lesson.',
  ]
  if (input.keep.length) parts.push('', 'These questions are already accepted. Do not repeat them:', ...input.keep.map((q) => `- ${q}`))
  if (input.rejected.length)
    parts.push('', 'Your last answer had these problems. Fix them:', ...input.rejected.slice(0, 12).map((r) => `- ${r}`))
  parts.push('', `LESSON: ${input.title}`, '"""', input.source, '"""')
  return parts.join('\n')
}

export function reviewPrompt(input: { problem: Problem; patterns: Pattern[]; allPatternKeys: string[]; code: string; rejected: string[] }): string {
  const { problem, patterns } = input
  const numbered = input.code
    .split('\n')
    .map((l, i) => `${String(i + 1).padStart(3)} | ${l}`)
    .join('\n')
  const parts = [
    'You review a learner\'s solution to a coding interview problem. The learner may write pseudocode or Python.',
    'Judge the algorithm, not the syntax: pseudocode that is clear and would work is correct.',
    '',
    'Rules:',
    '- verdict: "correct" if the approach solves every valid input within the constraints; "partial" if the idea is right but there are bugs or missed cases; "incorrect" if the approach does not solve the problem or is empty.',
    '- issues: each issue names a real mistake. "snippet" must be copied exactly from the learner\'s code (without the line numbers). Use an empty snippet only for something missing entirely.',
    '- A correct solution may have zero issues. Do not invent problems.',
    '- pattern.key: the key of the pattern the code uses, from the list below, or null. pattern.fits: whether that pattern suits this problem.',
    '- complexity: the time and space of the LEARNER\'S code, in big-O.',
    '- edgeCases: inputs the code gets wrong or does not handle. Empty if none.',
    '- next: one concrete step for the learner. Do not paste a full solution.',
    '- Use the reference solution only to check correctness. Never quote it.',
    '',
    `PATTERN KEYS: ${input.allPatternKeys.join(', ')}`,
  ]
  for (const p of patterns) parts.push('', `MAPPED PATTERN ${p.key}: ${p.name}. ${p.essence}`, `Template:\n${p.template}`)
  if (input.rejected.length)
    parts.push('', 'Your last review had these problems. Fix them:', ...input.rejected.slice(0, 12).map((r) => `- ${r}`))
  parts.push('', `PROBLEM: ${problem.title} (${problem.difficulty})`, '"""', problem.description_md, '"""')
  if (problem.reference_solution) parts.push('', 'REFERENCE SOLUTION (private):', '"""', problem.reference_solution, '"""')
  parts.push('', "LEARNER'S CODE:", '"""', numbered || '(empty)', '"""')
  return parts.join('\n')
}
