/** The pixel faces lack a few typographic glyphs; map them to ones they have so
 *  no character ever falls through to a system face. Emoji are dropped. */
const MAP: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '⇒': '=>',
  '≤': '<=',
  '≥': '>=',
  '−': '-',
  '²': '^2',
  '³': '^3',
  '⁴': '^4',
  '⁵': '^5',
  '⁶': '^6',
  '⁹': '^9',
  '⁰': '^0',
  '¹': '^1',
  '✓': 'ok',
  '✗': 'x',
  '⌘': 'Cmd ',
  '₁': '_1',
  '₋': '-',
  '₍': '(',
  '₎': ')',
  'ᵢ': '_i',
  'ₖ': '_k',
  '∈': 'in',
  'α': 'a',
}
const RE = new RegExp(`[${Object.keys(MAP).join('')}]`, 'g')
export const pixelText = (s: string): string => s.replace(RE, (c) => MAP[c] ?? c).replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
