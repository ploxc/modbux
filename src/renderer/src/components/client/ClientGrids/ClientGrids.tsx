import ResizeHandle from '@renderer/components/shared/ResizeHandle'
import { Group, Panel } from 'react-resizable-panels'
import TransactionGrid from '@renderer/components/client/ClientGrids/TransactionGrid/TransactionGrid'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import RegisterGrid from './RegisterGrid/RegisterGrid'
import { selectedSession, useClientZustand } from '@renderer/context/client.zustand'
import Paper from '@mui/material/Paper'
import { panelShadow } from '@renderer/theme'
import { RegisterType } from '@shared'
import { Fragment, useMemo } from 'react'
import ClientGridBar from './ClientGridBar'

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
  const openList = useClientZustand((z) => selectedSession(z).openTypes.join(','))
  const openTypes = useMemo(() => openList.split(',') as RegisterType[], [openList])

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
          <Group
            orientation="horizontal"
            id="client-sections"
            style={{ flexGrow: 1, minHeight: 0 }}
          >
            {openTypes.map((type, index) => (
              <Fragment key={type}>
                {index > 0 && (
                  <ResizeHandle orientation="vertical" testId="client-sections-handle" />
                )}
                <Panel id={`client-section-${index}`} minSize={240}>
                  <RegisterGrid type={type} />
                </Panel>
              </Fragment>
            ))}
          </Group>
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
