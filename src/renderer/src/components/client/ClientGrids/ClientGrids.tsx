import Box from '@mui/material/Box'
import TransactionGrid from '@renderer/components/client/ClientGrids/TransactionGrid/TransactionGrid'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useDataZustand, dataOf } from '@renderer/context/data.zustand'
import RegisterGrid from './RegisterGrid/RegisterGrid'
import { useClientZustand } from '@renderer/context/client.zustand'

/**
 * The grid stays up while a scan runs, because the rows are written in
 * batches: a chunk at a time re-renders the whole list, which is what taking
 * the grid down bought. A scan with the grid on screen costs about as much as
 * one without. The eye in the scan dialog takes it down for anyone who would
 * rather not watch.
 */
const ClientGrids = meme((): JSX.Element | null => {
  const showLog = useLayoutZustand((z) => z.showLog)
  const showWhileScanning = useLayoutZustand((z) => z.showGridWhileScanning)
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const scanning = useDataZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)

  if (scanning && !showWhileScanning) return null

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 0,
        gap: 2
      }}
    >
      <RegisterGrid />
      {/* The log takes a row per chunk, so during a scan it is a second grid
          rendering thousands of times over rows nobody is reading. */}
      {showLog && !scanning && <TransactionGrid />}
    </Box>
  )
})

export default ClientGrids
