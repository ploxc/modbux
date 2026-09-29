import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import { textMuted } from '@renderer/theme'
import { toggleConnection } from '@renderer/components/client/ConnectionConfig/toggleConnection'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { useCallback, useRef, useState } from 'react'
import StopPollDialog, {
  asksBeforeDisconnecting
} from '@renderer/components/client/Logging/StopPollDialog'
import { MenuPosition } from '@renderer/components/client/UnitMenu/UnitMenu'
import { ScanRegistersMenuItem, ScanUnitIdsMenuItem } from '../ScanMenuItems'

interface ClientMenuProps {
  uuid: string
  /** The ⋮ it opened from, or where a right click on the card opened it. */
  anchor: HTMLElement | null
  position: MenuPosition | null
  onClose: () => void
  onRename: () => void
  /** The last client left cannot be deleted. */
  deletable: boolean
}

/** A menu item's label with the key that goes with it on the right. */
const Hint = meme(({ label, hint }: { label: string; hint: string }) => (
  <>
    <Box component="span" sx={{ flexGrow: 1 }}>
      {label}
    </Box>
    <Box component="span" sx={{ display: 'flex', fontSize: 11.5, color: textMuted, ml: 2 }}>
      {hint}
    </Box>
  </>
))

/**
 * What a client's ⋮ opens. Opening it selects the client, so every item here
 * acts on the client on screen, as the top bar's controls do.
 */
const ClientMenu = meme(
  ({ uuid, anchor, position, onClose, onRename, deletable }: ClientMenuProps) => {
    // The press that connects waits on the field the protocol connects through, as Connect does.
    const addressValid = useClientZustand((z) =>
      z.clients[uuid]?.connectionConfig.protocol === 'ModbusRtu'
        ? (z.sessions[uuid]?.valid.com ?? false)
        : (z.sessions[uuid]?.valid.host ?? false)
    )
    const connectState = useLiveZustand((z) => dataOf(z, uuid).clientState.connectState)

    // Disconnecting a client that logs stops the log, which is asked about first.
    const logging = useLiveZustand(
      (z) => dataOf(z, uuid).clientState.log.enabled && dataOf(z, uuid).clientState.polling
    )
    const [asking, setAsking] = useState(false)
    const handleConnect = useCallback(() => {
      onClose()
      if (logging && connectState !== 'disconnected' && asksBeforeDisconnecting()) {
        setAsking(true)
        return
      }
      void toggleConnection()
    }, [onClose, logging, connectState])
    const handleCloseAsking = useCallback(() => setAsking(false), [])
    const disconnect = useCallback(() => {
      void toggleConnection()
    }, [])
    // Rename opens a field that closes on blur. The menu takes focus back while
    // it closes, so the field opens once the menu has gone.
    const afterClose = useRef<(() => void) | undefined>(undefined)
    const handleExited = useCallback(() => {
      afterClose.current?.()
      afterClose.current = undefined
    }, [])
    const handleRename = useCallback(() => {
      afterClose.current = onRename
      onClose()
    }, [onClose, onRename])
    const handleDuplicate = useCallback(() => {
      onClose()
      const clientZustand = useClientZustand.getState()
      clientZustand.duplicateClient(uuid)
    }, [onClose, uuid])
    const handleDelete = useCallback(() => {
      onClose()
      const clientZustand = useClientZustand.getState()
      void clientZustand.deleteClient(uuid)
    }, [onClose, uuid])

    const connected = connectState === 'connecting' || connectState === 'connected'
    const connectDisabled =
      connectState === 'disconnecting' || (connectState === 'disconnected' && !addressValid)

    return (
      <>
        <Menu
          anchorEl={anchor}
          anchorReference={position === null ? 'anchorEl' : 'anchorPosition'}
          anchorPosition={position ?? undefined}
          open={anchor !== null || position !== null}
          onClose={onClose}
          disableRestoreFocus
          slotProps={{ transition: { onExited: handleExited } }}
        >
          <MenuItem
            data-testid={`client-connect-${uuid}`}
            disabled={connectDisabled}
            onClick={handleConnect}
          >
            {connected ? 'Disconnect' : 'Connect'}
          </MenuItem>
          <MenuItem data-testid={`client-rename-${uuid}`} onClick={handleRename}>
            <Hint label="Rename" hint="F2" />
          </MenuItem>
          <MenuItem data-testid={`client-duplicate-${uuid}`} onClick={handleDuplicate}>
            Duplicate
          </MenuItem>
          <Divider />
          <ScanUnitIdsMenuItem uuid={uuid} onClose={onClose} />
          <ScanRegistersMenuItem uuid={uuid} onClose={onClose} />
          <Tooltip title="Client and workspace files are not there yet" placement="left">
            {/* A disabled item fires no pointer events, so the tooltip listens on the span. */}
            <span>
              <MenuItem data-testid={`client-export-${uuid}`} disabled>
                Export client
              </MenuItem>
            </span>
          </Tooltip>
          <Divider />
          <MenuItem
            data-testid={`client-delete-${uuid}`}
            disabled={!deletable}
            onClick={handleDelete}
            sx={{ color: 'error.light' }}
          >
            Delete
          </MenuItem>
        </Menu>
        {asking && (
          <StopPollDialog stopping="disconnect" onStop={disconnect} onClose={handleCloseAsking} />
        )}
      </>
    )
  }
)

export default ClientMenu
