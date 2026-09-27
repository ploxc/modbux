import Divider from '@mui/material/Divider'
import { meme } from '@renderer/components/shared/inputs/meme'
import Box from '@mui/material/Box'
import Fade from '@mui/material/Fade'
import Paper from '@mui/material/Paper'
import { panelShadow } from '@renderer/theme'
import MessageReceiver from '@renderer/components/shared/MessageReceiver'
import HomeButton from '@renderer/components/shared/HomeButton'
import SettingsButton from '@renderer/components/settings/SettingsButton'
import ClientGrids from '@renderer/components/client/ClientGrids/ClientGrids'
import ConnectionConfig from '@renderer/components/client/ConnectionConfig/ConnectionConfig'
import WorkspaceBar from '@renderer/components/client/WorkspaceBar'
import ClientSidebar from '@renderer/components/client/ClientSidebar/ClientSidebar'
import ClientRail from '@renderer/components/client/ClientSidebar/ClientRail'
import ScanRegisters from '@renderer/components/client/ScanRegisters/ScanRegisters'
import ScanUnitIds from '@renderer/components/client/ScanUnitIds/ScanUnitIds'
import ResizeHandle from '@renderer/components/shared/ResizeHandle'
import { useClientZustand, selectedSession } from '@renderer/context/client.zustand'
import { useCallback, useEffect, useState } from 'react'
import useMediaQuery from '@mui/material/useMediaQuery'
import { NARROW_WINDOW } from '@renderer/components/client/ClientGrids/breakpoints'
import { Group, Panel, PanelSize, useDefaultLayout, usePanelRef } from 'react-resizable-panels'

/** The rail's width, which is the sidebar folded. */
const RAIL_WIDTH = 40

/** The sidebar unfolded at its narrowest, which is all it may take in a narrow window. */
const SIDEBAR_MIN_WIDTH = 240

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
  const narrow = useMediaQuery(`(max-width: ${NARROW_WINDOW}px)`)
  // Shrink an unfolded sidebar that is wider than a narrow window allows; the
  // max size alone only stops it from being dragged wider.
  useEffect(() => {
    const sidebar = sidebarRef.current
    if (!narrow || !sidebar || sidebar.isCollapsed()) return
    if (sidebar.getSize().inPixels > SIDEBAR_MIN_WIDTH) sidebar.resize(SIDEBAR_MIN_WIDTH)
  }, [narrow, sidebarRef])

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
          // The same card as the sidebar.
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'nowrap',
            '& > *': { flexShrink: 0 },
            p: 1,
            background: theme.palette.background.paper,
            borderRadius: '8px',
            boxShadow: panelShadow
          })}
        >
          <Box sx={{ display: 'flex', gap: 1 }}>
            <HomeButton />
            <SettingsButton testId="client-settings-btn" size="large" variant="outlined" />
          </Box>
          <WorkspaceBar />
          <Divider orientation="vertical" flexItem sx={{ my: 0.75 }} />
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
            minSize={SIDEBAR_MIN_WIDTH}
            defaultSize={320}
            maxSize={narrow ? SIDEBAR_MIN_WIDTH : 420}
            groupResizeBehavior="preserve-pixel-size"
            onResize={handleSidebarResize}
          >
            {/* The same card as the tab container beside it. */}
            <Paper
              sx={(theme) => ({
                height: '100%',
                boxSizing: 'border-box',
                p: collapsed ? 0.5 : 1,
                background: theme.palette.background.paper,
                borderRadius: '8px',
                boxShadow: panelShadow
              })}
            >
              {collapsed ? (
                <ClientRail onExpand={expand} />
              ) : (
                <ClientSidebar onCollapse={collapse} />
              )}
            </Paper>
          </Panel>
        </Group>
        <ScanRegisters />
        <ScanUnitIds />
      </Box>
    </Fade>
  )
})
export default Client
