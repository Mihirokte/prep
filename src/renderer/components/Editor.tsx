import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { python } from '@codemirror/lang-python'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

interface Props {
  initial: string
  onChange: (code: string) => void
}

// The editor is drawn from the same tokens as the rest of the app: pixel face,
// paper and ink, and no second hue. Structure comes from weight and tone:
// keywords and definitions in bold ink, strings and numbers in secondary ink,
// comments quieter still.
const theme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'var(--ink)', height: '100%' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', overflow: 'auto', lineHeight: '24px' },
  '.cm-content': { padding: '16px 0', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 20px' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--ink-2)', border: 'none', borderRight: '1px solid var(--hair)' },
  '.cm-gutterElement': { padding: '0 12px 0 16px' },
  '.cm-activeLine': { backgroundColor: 'var(--wash)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--hair-strong)',
  },
  '.cm-selectionMatch': { backgroundColor: 'var(--wash)' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'transparent', outline: '1px solid var(--accent)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--wash)', border: 'none', color: 'var(--ink-2)' },
  // No icons: code folding chevrons and autocomplete type badges are hidden.
  '.cm-foldGutter': { display: 'none !important' },
  '.cm-completionIcon': { display: 'none !important' },
  '.cm-tooltip': { backgroundColor: 'var(--surface)', border: '2px solid var(--ink)', borderRadius: '0' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--wash)', color: 'var(--accent)' },
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--ink)' },
  '.cm-searchMatch': { backgroundColor: 'var(--hair-strong)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--hair-strong)', outline: '1px solid var(--accent)' },
})

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: 'var(--ink)', fontWeight: '700' },
  { tag: [t.string, t.special(t.string), t.docString], color: 'var(--ink-2)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--ink-2)' },
  { tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom], color: 'var(--ink-2)', textDecoration: 'underline dotted' },
  { tag: [t.definition(t.variableName), t.function(t.definition(t.variableName)), t.definition(t.className)], color: 'var(--ink)', fontWeight: '700' },
  { tag: [t.function(t.variableName), t.className, t.typeName], color: 'var(--ink)' },
  { tag: [t.standard(t.variableName), t.standard(t.function(t.variableName))], color: 'var(--ink-2)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--ink)' },
  { tag: [t.operator, t.punctuation, t.bracket, t.paren, t.squareBracket, t.brace], color: 'var(--ink-2)' },
  { tag: [t.self, t.meta], color: 'var(--ink-2)' },
  { tag: t.invalid, color: 'var(--accent)' },
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
