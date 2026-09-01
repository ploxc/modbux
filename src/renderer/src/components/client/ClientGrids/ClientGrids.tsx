import Box from '@mui/material/Box'
import TransactionGrid from '@renderer/components/client/ClientGrids/TransactionGrid/TransactionGrid'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import RegisterGrid from './RegisterGrid/RegisterGrid'

/**
 * The grid stays up while a scan runs. It used to be unmounted, because the
 * rows arriving one chunk at a time re-rendered the whole list each time and
 * the window stopped answering. The rows are written in batches now, and a
 * scan with the grid on screen costs about as much as one without. The eye in
 * the scan dialog puts it back the old way for anyone who would rather not
 * watch.
 */
const ClientGrids = meme((): JSX.Element | null => {
  const showLog = useLayoutZustand((z) => z.showLog)
  const showWhileScanning = useLayoutZustand((z) => z.showGridWhileScanning)
  const scanning = useRootZustand((z) => z.clientState.scanningRegisters)

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
