import ResizeHandle from '@renderer/components/shared/ResizeHandle'
import { Group, Panel, PanelSize, usePanelRef } from 'react-resizable-panels'
import { useCallback } from 'react'
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
import Monitor from '@renderer/components/client/Monitor/Monitor'
import { useClientViewZustand } from '@renderer/context/clientView.zustand'

/** How low the open log may get; any lower and it closes to its bar. */
const LOG_MIN_HEIGHT = 160
const LOG_DEFAULT_HEIGHT = 260

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
  const monitor = useClientViewZustand((z) => z.view === 'monitor')

  if (scanning && !showWhileScanning) return null

  // The log takes a row per chunk, so during a scan it is a second grid
  // rendering thousands of times over rows nobody is reading.
  const logOpen = showLog && !scanning

  const logRef = usePanelRef()
  const handleLogResize = useCallback(
    (size: PanelSize, _id: unknown, previous: PanelSize | undefined) => {
      if (size.inPixels > 0) return
      // The group remembers the log folded shut, so a log opened again mounts
      // at 0: that is a mount to open, not a drag to close.
      if (previous === undefined) {
        logRef.current?.resize(LOG_DEFAULT_HEIGHT)
        return
      }
      const layoutZustand = useLayoutZustand.getState()
      if (layoutZustand.showLog) layoutZustand.toggleShowLog()
    },
    [logRef]
  )

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Group orientation="vertical" id="client-grids" style={{ flexGrow: 1, minHeight: 0 }}>
        <Panel id="client-register-grid" minSize={260}>
          <Paper
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRadius: '8px',
              boxShadow: panelShadow
            }}
          >
            {monitor ? (
              <Monitor />
            ) : (
              <>
                <ClientGridBar />
                <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                  <LayoutView />
                </Box>
              </>
            )}
          </Paper>
        </Panel>
        {logOpen && (
          <>
            <ResizeHandle orientation="horizontal" testId="client-log-handle" />
            {/* Dragged lower than it is useful, the log closes to its bar. */}
            <Panel
              id="client-log"
              minSize={LOG_MIN_HEIGHT}
              defaultSize={LOG_DEFAULT_HEIGHT}
              panelRef={logRef}
              collapsible
              collapsedSize={0}
              onResize={handleLogResize}
            >
              <TransactionGrid open />
            </Panel>
          </>
        )}
      </Group>
      {!logOpen && <TransactionGrid open={false} />}
    </Box>
  )
})

export default ClientGrids
