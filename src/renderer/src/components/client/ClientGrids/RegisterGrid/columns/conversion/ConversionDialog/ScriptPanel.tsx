import Box from '@mui/material/Box'
import { EditorView } from '@codemirror/view'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useRef } from 'react'
import InsertMenu from './InsertMenu'
import ScriptEditor from './ScriptEditor'

interface ScriptPanelProps {
  /** The code the editor starts from; it keeps its own text after that. */
  code: string
  problem: string | undefined
  onChange: (code: string) => void
}

/** Custom's editor, the Insert menu over it, and why the script cannot be saved under it. */
const ScriptPanel = meme(({ code, problem, onChange }: ScriptPanelProps) => {
  const editorView = useRef<EditorView | null>(null)
  return (
    <>
      <InsertMenu viewRef={editorView} />
      <ScriptEditor code={code} onChange={onChange} viewRef={editorView} />
      {problem && (
        <Box
          data-testid="conversion-script-status"
          sx={(theme) => ({
            px: 1.5,
            py: 0.75,
            fontSize: 11.5,
            borderTop: `1px solid ${theme.palette.divider}`,
            color: 'error.main'
          })}
        >
          {problem}
        </Box>
      )}
    </>
  )
})

export default ScriptPanel
