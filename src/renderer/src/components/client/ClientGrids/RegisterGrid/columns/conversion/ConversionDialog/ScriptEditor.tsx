import Box from '@mui/material/Box'
import { completeFromList, snippetCompletion } from '@codemirror/autocomplete'
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript'
import { Diagnostic, linter, lintGutter } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import { EditorView } from '@codemirror/view'
import { meme } from '@renderer/components/shared/inputs/meme'
import { callSnippet, SCRIPT_HELPERS } from '@renderer/conversion/helpers'
import { scriptError } from '@renderer/conversion/scriptEngine'
import { basicSetup } from 'codemirror'
import { MutableRefObject, useEffect, useRef } from 'react'

/** The line a script does not compile on, underlined, with the reason on hover. */
const compileErrors = linter(
  (view): Diagnostic[] => {
    const code = view.state.doc.toString()
    const error = scriptError(code)
    if (!error) return []
    const line = view.state.doc.line(Math.min(Math.max(error.line ?? 1, 1), view.state.doc.lines))
    return [{ from: line.from, to: line.to, severity: 'error', message: error.message }]
  },
  { delay: 200 }
)

/** `raw` and the helpers, offered while typing with what each takes and does. */
const scriptCompletions = javascriptLanguage.data.of({
  autocomplete: completeFromList([
    { label: 'raw', type: 'variable', detail: 'the value its data type reads' },
    ...SCRIPT_HELPERS.map(({ name, signature, doc }) =>
      snippetCompletion(callSnippet(name, signature), {
        label: name,
        type: 'function',
        detail: signature,
        info: doc
      })
    )
  ])
})

/** The editor on the dialog's own surface rather than the theme's background. */
const surface = EditorView.theme({
  '&': { fontSize: '12.5px', height: '100%', backgroundColor: 'transparent' },
  '.cm-gutters': { backgroundColor: 'transparent', borderRight: 'none' },
  '.cm-scroller': { fontFamily: "'Roboto Mono', monospace", lineHeight: '20px' },
  '&.cm-focused': { outline: 'none' }
})

interface ScriptEditorProps {
  code: string
  onChange: (code: string) => void
  /** The editor, for the Insert menu to put a template at its cursor. */
  viewRef: MutableRefObject<EditorView | null>
}

/**
 * The code of a Custom conversion, coloured as JavaScript, with the line it
 * does not compile on underlined.
 */
const ScriptEditor = meme(({ code, onChange, viewRef }: ScriptEditorProps) => {
  const host = useRef<HTMLDivElement | null>(null)
  // The editor keeps its own text once mounted; `code` is where it starts.
  const start = useRef(code)
  const change = useRef(onChange)
  change.current = onChange

  useEffect(() => {
    const parent = host.current
    if (!parent) return
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: start.current,
        extensions: [
          basicSetup,
          javascript(),
          scriptCompletions,
          vscodeDark,
          surface,
          compileErrors,
          lintGutter(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) change.current(update.state.doc.toString())
          })
        ]
      })
    })
    viewRef.current = view
    view.focus()
    return (): void => {
      viewRef.current = null
      view.destroy()
    }
  }, [viewRef])

  return (
    <Box
      ref={host}
      data-testid="conversion-script-input"
      // Grows with the dialog, which the user resizes.
      sx={{ flexGrow: 1, minHeight: 180, overflow: 'visible' }}
    />
  )
})

export default ScriptEditor
