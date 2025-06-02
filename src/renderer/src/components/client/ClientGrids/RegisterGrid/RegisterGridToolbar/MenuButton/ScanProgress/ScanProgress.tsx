import { LinearProgress } from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { MaskInputProps } from '@renderer/components/shared/inputs/types'
import { useRootZustand } from '@renderer/context/root.zustand'
import { forwardRef } from 'react'
import { IMaskInput, IMask } from 'react-imask'

// Scan progress
export const ScanProgress = meme(() => {
  const scanning = useRootZustand(
    (z) => z.clientState.scanningUniId || z.clientState.scanningRegisters
  )
  const scanProgress = useRootZustand((z) => z.scanProgress)

  return scanning ? (
    <LinearProgress
      variant="determinate"
      value={scanProgress}
      color="primary"
      sx={{
        width: '100%',
        '& .MuiLinearProgress-bar1Determinate': { transition: 'none', animation: 'none' }
      }}
    />
  ) : null
})

export const TimeoutInput = meme(
  // eslint-disable-next-line react/display-name
  forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
    const { set, ...other } = props
    return (
      <IMaskInput
        {...other}
        mask={IMask.MaskedNumber}
        min={100}
        max={10000}
        autofix
        inputRef={ref}
        onAccept={(value) => set(value, true)}
      />
    )
  })
)
