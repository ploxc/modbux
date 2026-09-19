import LinearProgress from '@mui/material/LinearProgress'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'

/** The bar both scan dialogs put under their controls. */
const ScanProgress = meme((): JSX.Element | null => {
  const scanning = useClientZustand(
    (z) => z.clientState.scanningUnitIds || z.clientState.scanningRegisters
  )
  const scanProgress = useClientZustand((z) => z.scanProgress)

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

export default ScanProgress
