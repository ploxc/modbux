import { DeleteFilled, PlusCircleOutlined } from '@ant-design/icons'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import TextField from '@mui/material/TextField'
import { alpha } from '@mui/material/styles'
import { useServerZustand } from '@renderer/context/server.zustand'
import { BooleanRegisters, ServerBoolEntry } from '@shared'
import { ElementType, useCallback, useEffect, useMemo, useState } from 'react'
import ServerPanel from './ServerPanel'
import { meme } from '@renderer/components/shared/inputs/meme'
import ServerBit from './shared/ServerBit'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import { useSnackbar } from 'notistack'

interface ServerBooleanProps {
  name: string
  type: BooleanRegisters
}

// ─── Single bool row ──────────────────────────────────────────────────────────

interface ServerBoolRowProps {
  address: number
  type: BooleanRegisters
}

/**
 * One coil or discrete input, with its comment and its remove button.
 *
 * It read `collapse` and passed it on as `readOnly`, and `ServerBooleans`
 * renders this list only under `{!collapse && ...}`. Both read the same store
 * and React renders the parent first, so no committed render carried
 * `readOnly: true`, and the hover styles and the remove button were guarded on
 * the same unreachable half. Two tests in `ServerBit.test.tsx` asserted
 * behaviour nothing in the app reached.
 */
const ServerBoolRow = meme(({ address, type }: ServerBoolRowProps) => {
  const entry = useServerZustand((z) => {
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)
    return z.serverRegisters[uuid]?.[unitId]?.[type]?.[address] as ServerBoolEntry | undefined
  })

  // `ServerBit` hands back the index it was given, and the index this row gives
  // it is the coil's address.
  const handleToggle = useCallback(
    (bitAddress: number) => {
      useServerZustand
        .getState()
        .setBool({ registerType: type, address: bitAddress, boolState: !(entry?.value ?? false) })
    },
    [type, entry?.value]
  )

  const handleCommentChange = useCallback(
    (bitAddress: number, comment: string | undefined) => {
      useServerZustand.getState().setBoolComment(type, bitAddress, comment)
    },
    [type]
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
        '&:hover .remove-btn': { opacity: 1 },
        '&:hover': { backgroundColor: alpha(theme.palette.primary.dark, 0.1) },
        '&:has(.remove-btn:hover)': { backgroundColor: alpha(theme.palette.error.main, 0.1) }
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
        />
      </Box>
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
    </Box>
  )
})

// ─── Bool list ────────────────────────────────────────────────────────────────

const ServerBoolList = meme(({ type }: Omit<ServerBooleanProps, 'name'>) => {
  // Zustand runs a selector on every store change to compare, not only during
  // render, so the ref this used to cache the sorted keys in was written
  // outside React's render phase. `ServerRegisterRows` next door selects the
  // map and derives from it in a `useMemo`, which runs when React says so.
  // Mutative gives the map a new identity on every value written into it, so
  // this list re-renders per toggle where the ref stopped that. The register
  // list already pays that against generators writing on an interval, and each
  // row is `meme`'d on props that do not move.
  const boolMap = useServerZustand((z) => {
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)
    return z.serverRegisters[uuid]?.[unitId]?.[type]
  })
  const addresses = useMemo(
    () =>
      Object.keys(boolMap ?? {})
        .map(Number)
        .sort((a, b) => a - b),
    [boolMap]
  )

  return addresses.map((address) => (
    <ServerBoolRow key={`${type}_${address}`} address={address} type={type} />
  ))
})

// ─── Inline Add bar ──────────────────────────────────────────────────────────

const getBoolMap = (type: BooleanRegisters): Record<string, unknown> => {
  const serverZustand = useServerZustand.getState()
  return (
    serverZustand.serverRegisters[serverZustand.selectedUuid]?.[
      serverZustand.getUnitId(serverZustand.selectedUuid)
    ]?.[type] ?? {}
  )
}

const nextFree = (from: number, boolMap: Record<string, unknown>): number => {
  let address = from
  while (address <= 65535 && address in boolMap) address++
  return address
}

const AddBoolInline = meme(({ type }: Omit<ServerBooleanProps, 'name'>) => {
  const [address, setAddress] = useState(() => String(nextFree(0, getBoolMap(type))))
  const { enqueueSnackbar } = useSnackbar()

  // Reset to 0 when all bools are cleared
  const empty = useServerZustand((z) => {
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)
    return Object.keys(z.serverRegisters[uuid]?.[unitId]?.[type] ?? {}).length === 0
  })
  useEffect(() => {
    if (empty) setAddress('0')
  }, [empty])

  // The field is seeded from what one unit holds, and the reset above was the
  // only write that read the store again, so switching to a unit holding fewer
  // addresses left the field on the one the last unit ended at. A server is the
  // other half of which map that is, and two servers can be on the same unit
  // id, so both are in the list.
  const uuid = useServerZustand((z) => z.selectedUuid)
  const unitId = useServerZustand((z) => z.getUnitId(z.selectedUuid))
  useEffect(() => {
    setAddress(String(nextFree(0, getBoolMap(type))))
  }, [type, uuid, unitId])

  const handleAdd = useCallback(() => {
    let nextAddress = Number(address)
    if (isNaN(nextAddress) || nextAddress < 0 || nextAddress > 65535) return
    // If typed address is already taken, snap to next free
    const boolMap = getBoolMap(type)
    const typedAddress = nextAddress
    if (nextAddress in boolMap) nextAddress = nextFree(nextAddress, boolMap)
    if (nextAddress > 65535) {
      enqueueSnackbar({
        message: `Every address from ${typedAddress} up is taken`,
        variant: 'error'
      })
      return
    }
    useServerZustand.getState().addBool(type, nextAddress)
    // Auto-increment to next free address
    const next = nextFree(nextAddress + 1, getBoolMap(type))
    if (next <= 65535) setAddress(String(next))
  }, [type, address, enqueueSnackbar])

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
              set: (value) => setAddress(String(value))
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
  return (
    <ServerPanel
      name={name}
      type={type}
      openFlex={0}
      openMinWidth={280}
      contentSx={{ gap: 0, p: 0.5 }}
    >
      <ServerBoolList type={type} />
      <AddBoolInline type={type} />
    </ServerPanel>
  )
})

export default ServerBooleans
