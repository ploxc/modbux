import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { alpha } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback } from 'react'
import { DraftKind, KINDS } from './draft'

interface KindListProps {
  active: DraftKind
  onPick: (kind: DraftKind) => void
}

/** The kinds of conversion, the one being edited marked. */
const KindList = meme(({ active, onPick }: KindListProps) => (
  <Box
    sx={(theme) => ({
      display: 'flex',
      flexDirection: 'column',
      gap: 0.25,
      p: 1,
      borderRight: `1px solid ${theme.palette.divider}`
    })}
  >
    {KINDS.map(({ kind, label }) => (
      <KindButton key={kind} kind={kind} label={label} active={active === kind} onPick={onPick} />
    ))}
  </Box>
))

interface KindButtonProps {
  kind: DraftKind
  label: string
  active: boolean
  onPick: (kind: DraftKind) => void
}

const KindButton = meme(({ kind, label, active, onPick }: KindButtonProps) => {
  const handleClick = useCallback(() => onPick(kind), [kind, onPick])
  return (
    <ButtonBase
      data-testid={`conversion-kind-${kind}-btn`}
      aria-pressed={active}
      onClick={handleClick}
      sx={(theme) => ({
        justifyContent: 'flex-start',
        height: 28,
        px: 1,
        borderRadius: '4px',
        fontSize: 13,
        color: active ? 'primary.light' : 'text.primary',
        background: active ? alpha(theme.palette.primary.main, 0.16) : 'transparent'
      })}
    >
      {label}
    </ButtonBase>
  )
})

export default KindList
