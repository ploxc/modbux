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
import { useCallback, useRef } from 'react'
import { ScanRegistersMenuItem, ScanUnitIdsMenuItem } from '../ScanMenuItems'

interface ClientMenuProps {
  uuid: string
  anchor: HTMLElement | null
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
const ClientMenu = meme(({ uuid, anchor, onClose, onRename, deletable }: ClientMenuProps) => {
  // The press that connects waits on the field the protocol connects through, as Connect does.
  const addressValid = useClientZustand((z) =>
    z.clients[uuid]?.connectionConfig.protocol === 'ModbusRtu'
      ? (z.sessions[uuid]?.valid.com ?? false)
      : (z.sessions[uuid]?.valid.host ?? false)
  )
  const connectState = useLiveZustand((z) => dataOf(z, uuid).clientState.connectState)

  const handleConnect = useCallback(() => {
    onClose()
    void toggleConnection()
  }, [onClose])
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
    <Menu
      anchorEl={anchor}
      open={anchor !== null}
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
  )
})

export default ClientMenu
