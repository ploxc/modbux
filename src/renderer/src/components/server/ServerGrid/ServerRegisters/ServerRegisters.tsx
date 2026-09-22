import Edit from '@mui/icons-material/Edit'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { alpha } from '@mui/material/styles'
import {
  formatUnixSeconds,
  NumberRegisters,
  parseIEC870DateTimeValue,
  toExact64Bits,
  ServerRegister
} from '@shared'
import { useServerZustand } from '@renderer/context/server.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useMemo, useState } from 'react'
import { useAddRegisterZustand } from './AddRegister/addRegister.zustand'
import ServerPanel from '../ServerPanel'
import ServerBitMapDetail from './ServerBitMapDetail/ServerBitMapDetail'

interface RowProps {
  register: ServerRegister[number]
}

const RowEdit = meme(({ register }: RowProps) => {
  const handleClick = useCallback(() => {
    const addRegisterZustand = useAddRegisterZustand.getState()
    addRegisterZustand.setEditRegister(register)
  }, [register])

  return (
    <IconButton
      data-testid={`server-edit-reg-${register.params.registerType}-${register.params.address}`}
      aria-label={`Edit register ${register.params.address}`}
      title={`Edit register ${register.params.address}`}
      onClick={handleClick}
      size="small"
    >
      <Edit color="primary" fontSize="small" />
    </IconButton>
  )
})

const getDisplayValue = (register: ServerRegister[number]): string | number => {
  const { dataType } = register.params
  if (dataType === 'utf8') return register.params.stringValue ?? ''
  // A `unix` register is a uint32, so its composite is a number. The three
  // types that hold a string are read through `toExact64Bits`.
  if (dataType === 'unix') return formatUnixSeconds(Number(register.value))
  // The shared decoder answers '' for a register no date can be read out of,
  // which is what a register the server has not written yet holds.
  if (dataType === 'datetime') {
    const packed = toExact64Bits(register.value)
    return (packed !== undefined && parseIEC870DateTimeValue(packed)) || '—'
  }
  return register.value
}

// The value was held in state behind a 10 ms timer. `ServerDelayedSetter`
// already batches every register write on a 50 ms timer, so the second delay
// debounced nothing, and `register` is a fresh object per write, which re-ran
// the effect on its own whatever else was in the list.
const ServerRegisterValue = meme(({ register }: RowProps): JSX.Element => {
  const displayValue = getDisplayValue(register)

  return (
    <Box
      data-testid={`server-reg-value-${register.params.registerType}-${register.params.address}`}
      sx={{ pr: 2 }}
    >
      {displayValue}
    </Box>
  )
})

const ServerRegisterRow = meme(({ register }: RowProps) => {
  const isBitmap = register.params.dataType === 'bitmap'
  const [expanded, setExpanded] = useState(false)

  return (
    <Box>
      <Box
        sx={(theme) => ({
          width: '100%',
          height: 28,
          borderBottom: expanded ? 'none' : '1px solid rgba(255, 255, 255, 0.12)',
          pl: 1,

          display: 'flex',
          alignItems: 'center',
          gap: 1,

          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.dark, 0.2)
          }
        })}
      >
        <Box sx={(theme) => ({ width: 38, color: theme.palette.primary.main })}>
          {register.params.address}
        </Box>
        <Box sx={{ width: 60, opacity: 0.5, flexShrink: 0 }}>
          {register.params.dataType.replace(/_/, ' ').toUpperCase()}
        </Box>
        {isBitmap && (
          <IconButton
            data-testid={`server-bitmap-expand-${register.params.address}`}
            size="small"
            onClick={() => setExpanded((prev) => !prev)}
            sx={{ p: 0 }}
          >
            {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </IconButton>
        )}
        <ServerRegisterValue register={register} />
        <Box
          sx={{
            flex: 1,
            textAlign: 'right',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
          title={register.params.comment}
        >
          {register.params.comment}
        </Box>
        <RowEdit register={register} />
      </Box>
      {isBitmap && expanded && (
        <Box sx={{ borderBottom: '1px solid rgba(255, 255, 255, 0.12)' }}>
          <ServerBitMapDetail register={register} />
        </Box>
      )}
    </Box>
  )
})

const ServerRegisterRows = meme(({ type }: { type: NumberRegisters }) => {
  const registerMap = useServerZustand((z) => {
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)
    return z.servers[uuid]?.registers[unitId]?.[type]
  })
  // Sorted by the address the row draws, the way `ServerBoolList` sorts its
  // keys, and keyed by the map key rather than that address. `Object.entries`
  // is ascending only over integer-index keys, and `RegisterAddressKeySchema`
  // accepts '007', which is not one and which names the same address as '7'.
  const registers = useMemo(
    () =>
      Object.entries(registerMap ?? {}).sort(([, a], [, b]) => a.params.address - b.params.address),
    [registerMap]
  )

  return registers.map(([address, register]) => (
    <ServerRegisterRow key={`server_register_${type}_${address}`} register={register} />
  ))
})

interface ServerRegistersProps {
  name: string
  type: NumberRegisters
}

const ServerRegisters = meme(({ name, type }: ServerRegistersProps) => {
  return (
    <ServerPanel
      name={name}
      type={type}
      openFlex={1}
      openMinWidth={560}
      contentSx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.9em' }}
    >
      <ServerRegisterRows type={type} />
    </ServerPanel>
  )
})

export default ServerRegisters
