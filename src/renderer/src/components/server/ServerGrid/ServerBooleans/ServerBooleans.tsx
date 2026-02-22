import { DeleteFilled, PlusCircleOutlined } from '@ant-design/icons'
import { Box, IconButton, InputBaseComponentProps, Paper, TextField, alpha } from '@mui/material'
import { useServerZustand } from '@renderer/context/server.zustand'
import { BooleanRegisters, ServerBoolEntry } from '@shared'
import { deepEqual } from 'fast-equals'
import { ElementType, useCallback, useEffect, useRef, useState } from 'react'
import ServerPartTitle from '../ServerPartTitle/ServerPartTitle'
import { meme } from '@renderer/components/shared/inputs/meme'
import useServerGridZustand from '../serverGrid.zustand'
import ServerBit from '../shared/ServerBit'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import { maskInputProps } from '@renderer/components/shared/inputs/types'

interface ServerBooleanProps {
  name: string
  type: BooleanRegisters
}

// ─── Single bool row ──────────────────────────────────────────────────────────

interface ServerBoolRowProps {
  address: number
  type: BooleanRegisters
}

const ServerBoolRow = meme(({ address, type }: ServerBoolRowProps) => {
  const collapse = useServerGridZustand((z) => z.collapse[type])
  const entry = useServerZustand((z) => {
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)
    return z.serverRegisters[uuid]?.[unitId]?.[type]?.[address] as ServerBoolEntry | undefined
  })

  const handleToggle = useCallback(() => {
    useServerZustand
      .getState()
      .setBool({ registerType: type, address, boolState: !(entry?.value ?? false) })
  }, [type, address, entry?.value])

  const handleCommentChange = useCallback(
    (comment: string | undefined) => {
      useServerZustand.getState().setBoolComment(type, address, comment)
    },
    [type, address]
  )

  const handleRemove = useCallback(() => {
    useServerZustand.getState().removeBool(type, address)
  }, [type, address])

  if (!entry) return null

  return (
    <Box
      data-testid={`server-bool-row-${type}-${address}`}
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        borderRadius: 1,
        transition: 'background-color 0.15s',
        ...(!collapse && {
          '&:hover .remove-btn': { opacity: 1 },
          '&:hover': { backgroundColor: alpha(theme.palette.primary.dark, 0.1) },
          '&:has(.remove-btn:hover)': { backgroundColor: alpha(theme.palette.error.main, 0.1) }
        })
      })}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <ServerBit
          bitIndex={address}
          active={entry.value}
          comment={entry.comment}
          onToggle={handleToggle}
          onCommentChange={handleCommentChange}
          testIdPrefix={`server-bool-${type}`}
          padDigits={5}
          dimUnmapped={false}
          hoverHighlight={false}
          readOnly={collapse}
        />
      </Box>
      {!collapse && (
        <IconButton
          className="remove-btn"
          data-testid={`remove-bool-${type}-${address}`}
          size="small"
          onClick={handleRemove}
          sx={(theme) => ({
            opacity: 0,
            transition: 'opacity 0.15s',
            p: 0.25,
            color: theme.palette.text.secondary,
            '&:hover': { color: theme.palette.error.main }
          })}
        >
          <DeleteFilled style={{ fontSize: 12 }} />
        </IconButton>
      )}
    </Box>
  )
})

// ─── Bool list ────────────────────────────────────────────────────────────────

const ServerBoolList = meme(({ type }: Omit<ServerBooleanProps, 'name'>) => {
  const addressesRef = useRef<number[]>([])
  const addresses = useServerZustand((z) => {
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)
    const keys = Object.keys(z.serverRegisters[uuid]?.[unitId]?.[type] ?? {}).map(Number)
    keys.sort((a, b) => a - b)
    if (deepEqual(addressesRef.current, keys)) return addressesRef.current
    addressesRef.current = keys
    return keys
  })

  return addresses.map((address) => (
    <ServerBoolRow key={`${type}_${address}`} address={address} type={type} />
  ))
})

// ─── Inline Add bar ──────────────────────────────────────────────────────────

const getRegs = (type: BooleanRegisters): Record<string, unknown> => {
  const z = useServerZustand.getState()
  return z.serverRegisters[z.selectedUuid]?.[z.getUnitId(z.selectedUuid)]?.[type] ?? {}
}

const nextFree = (from: number, regs: Record<string, unknown>): number => {
  let a = from
  while (a <= 65535 && a in regs) a++
  return a
}

const AddBoolInline = meme(({ type }: Omit<ServerBooleanProps, 'name'>) => {
  const [address, setAddress] = useState(() => String(nextFree(0, getRegs(type))))

  // Reset to 0 when all bools are cleared
  const empty = useServerZustand((z) => {
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)
    return Object.keys(z.serverRegisters[uuid]?.[unitId]?.[type] ?? {}).length === 0
  })
  useEffect(() => {
    if (empty) setAddress('0')
  }, [empty])

  const handleAdd = useCallback(() => {
    let addr = Number(address)
    if (isNaN(addr) || addr < 0 || addr > 65535) return
    // If typed address is already taken, snap to next free
    const regs = getRegs(type)
    if (addr in regs) addr = nextFree(addr, regs)
    if (addr > 65535) return
    useServerZustand.getState().addBool(type, addr)
    // Auto-increment to next free address
    const next = nextFree(addr + 1, getRegs(type))
    if (next <= 65535) setAddress(String(next))
  }, [type, address])

  return (
    <Box
      data-testid={`add-bool-inline-${type}`}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 0.75, py: 0.25 }}
    >
      <IconButton
        data-testid={`add-bool-btn-${type}`}
        size="small"
        onClick={handleAdd}
        sx={{ p: 0 }}
      >
        <PlusCircleOutlined style={{ fontSize: 12, opacity: 0.5 }} />
      </IconButton>
      <TextField
        data-testid={`add-bool-address-input-${type}`}
        variant="standard"
        size="small"
        placeholder="addr"
        value={address}
        slotProps={{
          input: {
            inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
            inputProps: maskInputProps({
              set: (v) => setAddress(String(v))
            })
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleAdd()
        }}
        sx={{
          width: 34,
          '& input': { fontSize: '0.75rem', fontFamily: 'monospace', py: 0 },
          '& .MuiInput-root::before': { borderBottom: 'none' }
        }}
      />
    </Box>
  )
})

// ─── Main component ──────────────────────────────────────────────────────────

const ServerBooleans = meme(({ name, type }: ServerBooleanProps) => {
  const collapse = useServerGridZustand((z) => z.collapse[type])
  const allOtherCollapsed = useServerGridZustand((z) => {
    const entries = Object.entries(z.collapse)
    const filtered = entries.filter(([k]) => k !== type)
    return filtered.every((entry) => entry[1])
  })

  return (
    <Box
      sx={{
        flex: 0,
        minWidth: collapse ? 160 : 280,
        minHeight: collapse ? undefined : allOtherCollapsed ? '80%' : { xs: '30%', md: '48%' }
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          width: '100%',
          height: '100%',
          backgroundColor: '#2A2A2A',
          fontSize: '0.95em',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <ServerPartTitle name={name} registerType={type} />
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            gap: 0,
            flexDirection: 'column',
            p: 0.5
          }}
        >
          <ServerBoolList type={type} />
          {!collapse && <AddBoolInline type={type} />}
        </Box>
      </Paper>
    </Box>
  )
})

export default ServerBooleans
