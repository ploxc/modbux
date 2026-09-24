import LinearProgress from '@mui/material/LinearProgress'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand, dataOf } from '@renderer/context/data.zustand'
import { useClientZustand } from '@renderer/context/client.zustand'

/** The bar both scan dialogs put under their controls. */
const ScanProgress = meme((): JSX.Element | null => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const scanning = useDataZustand(
    (z) =>
      dataOf(z, selectedUuid).clientState.scanningUnitIds ||
      dataOf(z, selectedUuid).clientState.scanningRegisters
  )
  const scanProgress = useDataZustand((z) => dataOf(z, selectedUuid).scanProgress)

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
