import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { python } from '@codemirror/lang-python'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

interface Props {
  initial: string
  onChange: (code: string) => void
}

// The editor is a panel in the app, so it is themed from the same tokens as
// everything else: one warm accent for keywords, a sage for strings, and the
// rest in the ink tiers.
const theme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: 'var(--foreground)', height: '100%' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', overflow: 'auto' },
    '.cm-content': { padding: '14px 0', caretColor: 'var(--brand)' },
    '.cm-line': { padding: '0 16px' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--faint)',
      border: 'none',
      paddingLeft: '10px',
    },
    '.cm-gutterElement': { padding: '0 10px 0 4px' },
    '.cm-activeLine': { backgroundColor: 'oklch(1 0 0 / 0.035)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--muted-foreground)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--brand)', borderLeftWidth: '2px' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'oklch(0.82 0.13 80 / 0.28)',
    },
    '.cm-selectionMatch': { backgroundColor: 'oklch(1 0 0 / 0.08)' },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'oklch(0.82 0.13 80 / 0.18)', outline: 'none' },
    '.cm-foldPlaceholder': { backgroundColor: 'var(--muted)', border: 'none', color: 'var(--muted-foreground)' },
    '.cm-tooltip': {
      backgroundColor: 'var(--popover)',
      border: '1px solid var(--hairline)',
      borderRadius: '8px',
      boxShadow: 'var(--shadow-float)',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--muted)', color: 'var(--foreground)' },
    '.cm-panels': { backgroundColor: 'var(--card)', color: 'var(--foreground)' },
    '.cm-searchMatch': { backgroundColor: 'oklch(0.82 0.13 80 / 0.25)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'oklch(0.82 0.13 80 / 0.45)' },
  },
  { dark: true },
)

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: 'var(--brand)' },
  { tag: [t.string, t.special(t.string), t.docString], color: 'oklch(0.80 0.07 150)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--faint)', fontStyle: 'italic' },
  { tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom], color: 'oklch(0.86 0.06 50)' },
  { tag: [t.definition(t.variableName), t.function(t.definition(t.variableName)), t.definition(t.className)], color: 'var(--foreground)', fontWeight: '500' },
  { tag: [t.function(t.variableName), t.className, t.typeName], color: 'var(--foreground)' },
  { tag: [t.standard(t.variableName), t.standard(t.function(t.variableName))], color: 'var(--muted-foreground)' },
  { tag: [t.propertyName, t.attributeName], color: 'oklch(0.86 0.04 80)' },
  { tag: [t.operator, t.punctuation, t.bracket, t.paren, t.squareBracket, t.brace], color: 'oklch(0.78 0.01 60)' },
  { tag: [t.self, t.meta], color: 'var(--muted-foreground)' },
  { tag: t.invalid, color: 'var(--destructive)' },
])

/** CodeMirror 6 Python editor. Remount (via key) to reset contents. */
export default function Editor({ initial, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const cbRef = useRef(onChange)
  cbRef.current = onChange

  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      doc: initial,
      parent: host.current,
      extensions: [
        basicSetup,
        python(),
        theme,
        syntaxHighlighting(highlight),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cbRef.current(u.state.doc.toString())
        }),
      ],
    })
    return () => view.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className="editor-host h-full" ref={host} />
}
