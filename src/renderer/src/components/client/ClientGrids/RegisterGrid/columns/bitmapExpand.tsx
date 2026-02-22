import { KeyboardArrowDown, KeyboardArrowRight } from '@mui/icons-material'
import { Box } from '@mui/material'
import { useBitMapZustand } from '@renderer/context/bitmap.zustand'

interface ExpandCellProps {
  address: number
  isBitmap: boolean
}

export const ExpandCell = ({ address, isBitmap }: ExpandCellProps): JSX.Element => {
  const expandedAddress = useBitMapZustand((z) => z.expandedAddress)
  const toggleExpanded = useBitMapZustand((z) => z.toggleExpanded)
  const isExpanded = expandedAddress === address

  if (!isBitmap) return <></>

  return (
    <Box
      onClick={() => toggleExpanded(address)}
      title={isExpanded ? 'Hide bitmap detail' : 'Show bitmap detail'}
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        height: '100%',
        width: '100%',
        cursor: 'pointer',
        color: isExpanded ? theme.palette.primary.main : theme.palette.text.secondary,
        '&:hover': { color: theme.palette.primary.main }
      })}
    >
      {isExpanded ? (
        <KeyboardArrowDown fontSize="small" />
      ) : (
        <KeyboardArrowRight fontSize="small" />
      )}
      <Box
        component="span"
        sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600, letterSpacing: 0.5 }}
      >
        {isExpanded ? 'hide' : 'show'}
      </Box>
    </Box>
  )
}
