import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { useClientZustand } from '@renderer/context/client.zustand'

/**
 * The bar and the percentage both scan dialogs put in their button band. It
 * takes the band's free width while nothing runs, so the buttons stay right.
 */
const ScanProgress = meme((): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const scanning = useLiveZustand(
    (z) =>
      dataOf(z, selectedUuid).clientState.scanningUnitIds ||
      dataOf(z, selectedUuid).clientState.scanningRegisters
  )
  const scanProgress = useLiveZustand((z) => dataOf(z, selectedUuid).scanProgress)

  return (
    <Box
      sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, pl: 1.25 }}
    >
      {scanning && (
        <>
          <LinearProgress
            variant="determinate"
            value={scanProgress}
            color="primary"
            sx={{
              flexGrow: 1,
              maxWidth: 360,
              height: 4,
              borderRadius: 0.25,
              '& .MuiLinearProgress-bar1Determinate': { transition: 'none', animation: 'none' }
            }}
          />
          <Box
            component="span"
            sx={{ fontFamily: 'monospace', fontSize: 12, color: '#a3a3a3', whiteSpace: 'nowrap' }}
          >
            {Math.round(scanProgress)} %
          </Box>
        </>
      )}
    </Box>
  )
})

export default ScanProgress
