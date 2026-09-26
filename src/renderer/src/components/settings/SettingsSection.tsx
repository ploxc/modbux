import ChevronRight from '@mui/icons-material/ChevronRight'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Collapse from '@mui/material/Collapse'
import { meme } from '@renderer/components/shared/inputs/meme'
import { ReactNode, useCallback, useState } from 'react'

interface SettingsSectionProps {
  title: string
  /** What the section is set to, on the title row, so a closed section still says it. */
  summary: ReactNode
  testId: string
  children: ReactNode
}

/** One collapsible section of the settings. Its title row is always there. */
const SettingsSection = meme(
  ({ title, summary, testId, children }: SettingsSectionProps): JSX.Element => {
    const [open, setOpen] = useState(true)
    const toggle = useCallback(() => setOpen((was) => !was), [])

    return (
      <Box>
        <ButtonBase
          aria-expanded={open}
          onClick={toggle}
          data-testid={testId}
          sx={{ width: '100%', height: 56, gap: 1.25, px: 1, justifyContent: 'flex-start' }}
        >
          <ChevronRight
            sx={{
              fontSize: 18,
              color: '#a3a3a3',
              transform: open ? 'rotate(90deg)' : 'none',
              transition: 'transform 120ms'
            }}
          />
          <Box
            component="span"
            sx={{ fontSize: 15, fontWeight: 500, flexGrow: 1, textAlign: 'left' }}
          >
            {title}
          </Box>
          {summary}
        </ButtonBase>
        <Collapse in={open}>
          <Box
            sx={{ pr: 1, pb: 3.75, pl: 4.5, display: 'flex', flexDirection: 'column', gap: 1.75 }}
          >
            {children}
          </Box>
        </Collapse>
      </Box>
    )
  }
)

export default SettingsSection

interface SettingsRowProps {
  title: string
  description: string
  control: ReactNode
}

/** A setting: its name and what it does on the left, the control on the right. */
export const SettingsRow = meme(
  ({ title, description, control }: SettingsRowProps): JSX.Element => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.75 }}>
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <Box component="span" sx={{ fontSize: 14, fontWeight: 500 }}>
          {title}
        </Box>
        <Box component="span" sx={{ fontSize: 12, lineHeight: '17px', color: '#a3a3a3' }}>
          {description}
        </Box>
      </Box>
      <Box sx={{ flexShrink: 0, display: 'flex', justifyContent: 'center', minWidth: 40 }}>
        {control}
      </Box>
    </Box>
  )
)

/** Rows that belong together, in one bordered card with a line between each. */
export const SettingsCard = meme(
  ({ children }: { children: ReactNode }): JSX.Element => (
    <Box
      sx={{
        border: '1px solid #2e2e2e',
        borderRadius: 1.5,
        '& > * + *': { borderTop: '1px solid #2a2a2a' }
      }}
    >
      {children}
    </Box>
  )
)
