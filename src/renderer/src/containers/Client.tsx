import { meme } from '@renderer/components/shared/inputs/meme'
import Box from '@mui/material/Box'
import Fade from '@mui/material/Fade'
import MessageReceiver from '@renderer/components/shared/MessageReceiver'
import HomeButton from '@renderer/components/shared/HomeButton'
import SettingsButton from '@renderer/components/settings/SettingsButton'
import ClientGrids from '@renderer/components/client/ClientGrids/ClientGrids'
import ConnectionConfig from '@renderer/components/client/ConnectionConfig/ConnectionConfig'
import ClientSidebar from '@renderer/components/client/ClientSidebar/ClientSidebar'
import ClientRail from '@renderer/components/client/ClientSidebar/ClientRail'
import ScanRegisters from '@renderer/components/client/ScanRegisters/ScanRegisters'
import ScanUnitIds from '@renderer/components/client/ScanUnitIds/ScanUnitIds'
import ResizeHandle from '@renderer/components/shared/ResizeHandle'
import { useClientZustand, selectedSession } from '@renderer/context/client.zustand'
import { useCallback, useState } from 'react'
import { Group, Panel, PanelSize, useDefaultLayout, usePanelRef } from 'react-resizable-panels'

/** The rail's width, which is the sidebar folded. */
const RAIL_WIDTH = 40

const Client = meme(() => {
  const ready = useClientZustand((z) => selectedSession(z).ready)
  const sidebarRef = usePanelRef()
  const [collapsed, setCollapsed] = useState(false)
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'client-layout',
    storage: localStorage
  })

  const handleSidebarResize = useCallback(
    (size: PanelSize) => setCollapsed(size.inPixels <= RAIL_WIDTH),
    []
  )
  const collapse = useCallback(() => sidebarRef.current?.collapse(), [sidebarRef])
  const expand = useCallback(() => sidebarRef.current?.expand(), [sidebarRef])

  return (
    <Fade in={ready} timeout={500}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          p: 1.75
        }}
      >
        <MessageReceiver />
        <Box
          data-testid="client-top-bar"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'nowrap',
            '& > *': { flexShrink: 0 }
          }}
        >
          <Box sx={{ display: 'flex', gap: 1 }}>
            <HomeButton />
            <SettingsButton testId="client-settings-btn" size="large" variant="outlined" />
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <ConnectionConfig />
        </Box>
        <Group
          id="client-layout"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          style={{ flexGrow: 1, minHeight: 0 }}
        >
          <Panel id="client-main" minSize={400}>
            <ClientGrids />
          </Panel>
          <ResizeHandle orientation="vertical" testId="client-sidebar-handle" />
          <Panel
            id="client-sidebar"
            panelRef={sidebarRef}
            collapsible
            collapsedSize={RAIL_WIDTH}
            minSize={240}
            defaultSize={320}
            maxSize={480}
            groupResizeBehavior="preserve-pixel-size"
            onResize={handleSidebarResize}
          >
            <Box sx={{ height: '100%' }}>
              {collapsed ? (
                <ClientRail onExpand={expand} />
              ) : (
                <ClientSidebar onCollapse={collapse} />
              )}
            </Box>
          </Panel>
        </Group>
        <ScanRegisters />
        <ScanUnitIds />
      </Box>
    </Fade>
  )
})
export default Client
