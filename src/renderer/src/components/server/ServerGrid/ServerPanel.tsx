import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import { SxProps, Theme } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { gridSurface } from '@renderer/theme'
import { RegisterType } from '@shared'
import { ReactNode } from 'react'
import ServerPartTitle from './ServerPartTitle'
import useServerGridZustand from './serverGrid.zustand'

interface ServerPanelProps {
  name: string
  type: RegisterType
  /** What the outer box takes of the row's width while the section is open. */
  openFlex: number
  openMinWidth: number
  /** What the scroll box adds to the anchoring below. */
  contentSx: SxProps<Theme>
  children: ReactNode
}

/**
 * One titled section of the server grid, with its own scroll box.
 *
 * The scroll box is positioned rather than flexed. A flex child takes its share
 * of a parent that has a height, and this one does not: the Paper asks for 100%
 * of a box that only carries a minHeight. So the list grew instead, and the
 * overflow landed on the view rather than here. Anchored top to bottom, the
 * height comes from the Paper and the scrollbar appears where it belongs.
 *
 * That anchor is why the box lives here rather than in each caller: `top: 38`
 * is `ServerPartTitle`'s `height: 38`, and the two have to move together.
 *
 * `children` is guarded on `collapse` here, so neither caller reads it.
 */
const ServerPanel = meme(
  ({ name, type, openFlex, openMinWidth, contentSx, children }: ServerPanelProps) => {
    const collapse = useServerGridZustand((z) => z.collapse[type])
    const allOtherCollapsed = useServerGridZustand((z) => {
      const entries = Object.entries(z.collapse)
      const filtered = entries.filter(([registerType]) => registerType !== type)
      return filtered.every((entry) => entry[1])
    })

    return (
      <Box
        sx={{
          flex: collapse ? 0 : openFlex,
          minWidth: collapse ? 160 : openMinWidth,
          minHeight: collapse ? undefined : allOtherCollapsed ? '80%' : { xs: '30%', md: '48%' }
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            flex: 1,
            width: '100%',
            height: '100%',
            backgroundColor: gridSurface,
            fontSize: '0.95em',
            position: 'relative'
          }}
        >
          <ServerPartTitle name={name} registerType={type} />
          <Box
            sx={[
              {
                position: 'absolute',
                top: 38,
                left: 0,
                right: 0,
                bottom: 0,
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column'
              },
              ...(Array.isArray(contentSx) ? contentSx : [contentSx])
            ]}
          >
            {!collapse && children}
          </Box>
        </Paper>
      </Box>
    )
  }
)

export default ServerPanel
