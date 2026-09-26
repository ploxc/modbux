import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import MoreVert from '@mui/icons-material/MoreVert'
import { alpha } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { PROTOCOL_LABELS } from '@shared'
import { MouseEvent, useCallback, useState } from 'react'
import { PROTOCOL_COLORS, STATUS_COLORS, clientAddress, clientStatus } from './clientStatus'
import ProtocolIcon from './ProtocolIcon'

interface ClientCardProps {
  uuid: string
  /** The last client left cannot be deleted. */
  deletable: boolean
}

const ClientCard = meme(({ uuid, deletable }: ClientCardProps): JSX.Element | null => {
  const selected = useClientZustand((z) => z.selectedUuid === uuid)
  const name = useClientZustand((z) => z.clients[uuid]?.name)
  const protocol = useClientZustand((z) => z.clients[uuid]?.connectionConfig.protocol)
  const address = useClientZustand((z) => {
    const config = z.clients[uuid]?.connectionConfig
    return config && clientAddress(config)
  })
  const connectState = useLiveZustand((z) => dataOf(z, uuid).clientState.connectState)
  const polling = useLiveZustand((z) => dataOf(z, uuid).clientState.polling)
  const offline = useLiveZustand((z) => dataOf(z, uuid).clientState.offlineUnits.length > 0)

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  const handleSelect = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setSelectedUuid(uuid)
  }, [uuid])
  const handleMenuOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget)
  }, [])
  const handleMenuClose = useCallback(() => setMenuAnchor(null), [])
  const handleDelete = useCallback(() => {
    setMenuAnchor(null)
    const clientZustand = useClientZustand.getState()
    void clientZustand.deleteClient(uuid)
  }, [uuid])

  if (protocol === undefined || address === undefined) return null
  const status = clientStatus({ connectState, polling, offline })
  const color = PROTOCOL_COLORS[protocol]

  return (
    <Box
      sx={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        borderRadius: 2,
        background: '#232323',
        overflow: 'hidden'
      }}
    >
      <ButtonBase
        data-testid={`client-card-${uuid}`}
        aria-pressed={selected}
        onClick={handleSelect}
        sx={{ flexGrow: 1, minWidth: 0, gap: 1.25, p: 1.25, justifyContent: 'flex-start' }}
      >
        <Tooltip title={status.label} placement="left">
          <Box
            data-testid={`client-status-${uuid}`}
            aria-label={status.label}
            sx={{
              position: 'relative',
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: alpha(color, 0.16)
            }}
          >
            <ProtocolIcon protocol={protocol} />
            <Box
              component="span"
              sx={{
                position: 'absolute',
                right: -3,
                bottom: -3,
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: STATUS_COLORS[status.tone],
                border: '2px solid #232323'
              }}
            />
          </Box>
        </Tooltip>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0, flexGrow: 1 }}>
          <Box
            component="span"
            sx={{
              fontSize: 14,
              fontWeight: 500,
              textAlign: 'left',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {name || 'Unnamed client'}
          </Box>
          <Box
            component="span"
            sx={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.05em',
              color,
              textAlign: 'left'
            }}
          >
            {PROTOCOL_LABELS[protocol].toUpperCase()}
          </Box>
          <Box
            component="span"
            sx={{
              fontSize: 11.5,
              fontFamily: 'monospace',
              color: '#9a9a9a',
              textAlign: 'left',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {address}
          </Box>
        </Box>
      </ButtonBase>
      <IconButton
        data-testid={`client-menu-${uuid}`}
        aria-label="Client menu"
        size="small"
        onClick={handleMenuOpen}
        sx={{ mr: 0.75 }}
      >
        <MoreVert />
      </IconButton>
      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={handleMenuClose}>
        <MenuItem
          data-testid={`client-delete-${uuid}`}
          disabled={!deletable}
          onClick={handleDelete}
          sx={{ color: '#f0908a' }}
        >
          Delete
        </MenuItem>
      </Menu>
    </Box>
  )
})

export default ClientCard
