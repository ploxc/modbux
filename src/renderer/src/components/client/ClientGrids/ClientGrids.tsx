import ResizeHandle from '@renderer/components/shared/ResizeHandle'
import { Group, Panel } from 'react-resizable-panels'
import TransactionGrid from '@renderer/components/client/ClientGrids/TransactionGrid/TransactionGrid'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { useClientZustand } from '@renderer/context/client.zustand'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import { panelShadow } from '@renderer/theme'
import ClientGridBar from './ClientGridBar'
import LayoutView from './LayoutView'

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
  const scanning = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)

  if (scanning && !showWhileScanning) return null

  return (
    <Group orientation="vertical" id="client-grids" style={{ height: '100%' }}>
      <Panel id="client-register-grid" minSize={160}>
        <Paper
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: panelShadow
          }}
        >
          <ClientGridBar />
          <Box sx={{ flexGrow: 1, minHeight: 0 }}>
            <LayoutView />
          </Box>
        </Paper>
      </Panel>
      {/* The log takes a row per chunk, so during a scan it is a second grid
          rendering thousands of times over rows nobody is reading. */}
      {showLog && !scanning && (
        <>
          <ResizeHandle orientation="horizontal" testId="client-log-handle" />
          <Panel id="client-log" minSize={120} defaultSize={260}>
            <TransactionGrid />
          </Panel>
        </>
      )}
    </Group>
  )
})

export default ClientGrids
