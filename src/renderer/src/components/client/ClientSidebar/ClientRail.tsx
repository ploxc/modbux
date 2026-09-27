import Add from '@mui/icons-material/Add'
import KeyboardDoubleArrowLeft from '@mui/icons-material/KeyboardDoubleArrowLeft'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { alpha } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { useCallback, useMemo } from 'react'
import { PROTOCOL_COLORS, clientStatus } from './clientStatus'
import StatusDot from './StatusDot'
import { addClient } from './ClientSidebar'
import ProtocolIcon from './ProtocolIcon'

const RailClient = meme(({ uuid }: { uuid: string }): JSX.Element | null => {
  const selected = useClientZustand((z) => z.selectedUuid === uuid)
  const name = useClientZustand((z) => z.clients[uuid]?.name)
  const protocol = useClientZustand((z) => z.clients[uuid]?.connectionConfig.protocol)
  const connectState = useLiveZustand((z) => dataOf(z, uuid).clientState.connectState)
  const polling = useLiveZustand((z) => dataOf(z, uuid).clientState.polling)
  const pollIdle = useLiveZustand((z) => dataOf(z, uuid).clientState.pollIdle)
  const offline = useLiveZustand((z) => dataOf(z, uuid).clientState.offlineUnits.length > 0)

  const handleSelect = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setSelectedUuid(uuid)
  }, [uuid])

  if (protocol === undefined) return null
  const status = clientStatus({ connectState, polling, pollIdle, offline })

  return (
    <Tooltip title={`${name || 'Unnamed client'} · ${status.label}`} placement="left">
      <ButtonBase
        data-testid={`client-rail-${uuid}`}
        aria-label={name || 'Unnamed client'}
        aria-pressed={selected}
        onClick={handleSelect}
        sx={{
          position: 'relative',
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: 2,
          border: '1px solid',
          borderColor: selected ? 'primary.main' : 'transparent',
          background: alpha(PROTOCOL_COLORS[protocol], 0.16)
        }}
      >
        <ProtocolIcon protocol={protocol} />
        <StatusDot tone={status.tone} polling={status.polling} hollow={status.hollow} offset={3} />
      </ButtonBase>
    </Tooltip>
  )
})

/** The sidebar folded to a column of badges, one per client. */
const ClientRail = meme(({ onExpand }: { onExpand: () => void }): JSX.Element => {
  const uuidKey = useClientZustand((z) => Object.keys(z.clients).join(' '))
  const uuids = useMemo(() => uuidKey.split(' '), [uuidKey])
  const handleAdd = useCallback(addClient, [])

  return (
    <Box
      component="aside"
      data-testid="client-rail"
      sx={{
        height: '100%',
        boxSizing: 'border-box',
        // Inside the scroller rather than around it: a scroller clips at its
        // padding's edge, and the status dot sits past its badge's corner.
        p: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1.25,
        overflowY: 'auto'
      }}
    >
      <IconButton
        data-testid="client-rail-expand-btn"
        aria-label="Show sidebar"
        title="Show sidebar"
        size="large"
        onClick={onExpand}
      >
        <KeyboardDoubleArrowLeft />
      </IconButton>
      <Box sx={{ width: 24, height: '1px', background: '#333333', flexShrink: 0 }} />
      {uuids.map((uuid) => (
        <RailClient key={uuid} uuid={uuid} />
      ))}
      <Box sx={{ flexGrow: 1 }} />
      <IconButton
        data-testid="client-rail-add-btn"
        aria-label="New client"
        title="New client"
        size="large"
        onClick={handleAdd}
        sx={{ border: '1px dashed', borderColor: 'divider' }}
      >
        <Add />
      </IconButton>
    </Box>
  )
})

export default ClientRail
