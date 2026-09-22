import LinearProgress from '@mui/material/LinearProgress'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand } from '@renderer/context/data.zustand'

/** The bar both scan dialogs put under their controls. */
const ScanProgress = meme((): JSX.Element | null => {
  const scanning = useDataZustand(
    (z) => z.clientState.scanningUnitIds || z.clientState.scanningRegisters
  )
  const scanProgress = useDataZustand((z) => z.scanProgress)

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
