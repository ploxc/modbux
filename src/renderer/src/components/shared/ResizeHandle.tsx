import Box from '@mui/material/Box'
import { meme } from '@renderer/components/shared/inputs/meme'
import { Separator } from 'react-resizable-panels'

interface ResizeHandleProps {
  /** Which way the line runs: vertical between columns, horizontal between rows. */
  orientation: 'vertical' | 'horizontal'
  testId: string
  /** The gutter's width in theme spacing. */
  gutter?: number
}

/** The grip between two panels, a short line in the middle of a gutter. */
const ResizeHandle = meme(({ orientation, testId, gutter = 1 }: ResizeHandleProps): JSX.Element => {
  const vertical = orientation === 'vertical'
  return (
    // A Separator writes its id as its test id, over a data-testid it is given.
    <Separator id={testId} data-testid={testId} style={{ outline: 'none' }}>
      <Box
        // theme.spacing, because a bare 1 in sx reads as 100%.
        sx={(theme) => ({
          width: vertical ? theme.spacing(gutter) : '100%',
          height: vertical ? '100%' : theme.spacing(gutter),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          '& > span': { transition: 'background 0.15s' },
          '&:hover > span': { background: '#5b9279' }
        })}
      >
        <Box
          component="span"
          sx={{
            width: vertical ? 2 : 40,
            height: vertical ? 40 : 2,
            borderRadius: 1,
            background: '#3a3a3a'
          }}
        />
      </Box>
    </Separator>
  )
})

export default ResizeHandle
