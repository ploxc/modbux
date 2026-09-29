import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { EditorView } from '@codemirror/view'
import { meme } from '@renderer/components/shared/inputs/meme'
import { SCRIPT_TEMPLATES } from '@renderer/conversion/helpers'
import { MouseEvent, MutableRefObject, useCallback, useState } from 'react'

interface InsertMenuProps {
  viewRef: MutableRefObject<EditorView | null>
}

/** A strip over the script with the templates, each put in at the cursor. */
const InsertMenu = meme(({ viewRef }: InsertMenuProps) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget)
  }, [])
  const handleClose = useCallback(() => setAnchor(null), [])
  const insert = useCallback(
    (code: string) => {
      setAnchor(null)
      const view = viewRef.current
      if (!view) return
      view.dispatch(view.state.replaceSelection(code))
      view.focus()
    },
    [viewRef]
  )

  return (
    <Box
      sx={(theme) => ({
        display: 'flex',
        justifyContent: 'flex-end',
        px: 0.75,
        py: 0.5,
        borderBottom: `1px solid ${theme.palette.divider}`
      })}
    >
      <Button data-testid="conversion-insert-btn" size="small" variant="text" onClick={handleOpen}>
        Insert
      </Button>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={handleClose}>
        {SCRIPT_TEMPLATES.map(({ label, code }, i) => (
          <TemplateItem key={label} index={i} label={label} code={code} onInsert={insert} />
        ))}
      </Menu>
    </Box>
  )
})

interface TemplateItemProps {
  index: number
  label: string
  code: string
  onInsert: (code: string) => void
}

const TemplateItem = meme(({ index, label, code, onInsert }: TemplateItemProps) => {
  const handleClick = useCallback(() => onInsert(code), [onInsert, code])
  return (
    <MenuItem data-testid={`conversion-template-${index}`} onClick={handleClick}>
      {label}
    </MenuItem>
  )
})

export default InsertMenu
