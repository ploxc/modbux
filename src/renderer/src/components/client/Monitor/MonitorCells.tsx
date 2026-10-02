import Edit from '@mui/icons-material/Edit'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { getConvertedValue } from '@renderer/components/client/ClientGrids/RegisterGrid/columns/convertedValue'
import WriteModal from '@renderer/components/client/ClientGrids/RegisterGrid/columns/WriteModal/WriteModal'
import {
  WriteTarget,
  WriteTargetContext
} from '@renderer/components/client/ClientGrids/RegisterGrid/columns/WriteModal/writeTarget'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, rowAt, sectionOf, useLiveZustand } from '@renderer/context/live.zustand'
import { useScriptEngineZustand } from '@renderer/conversion/scriptEngine.zustand'
import { ClientUnit, isLogged, isNumberRegister } from '@shared'
import { ReactNode, useCallback, useMemo, useRef, useState } from 'react'
import { MonitorRegisterRow } from './monitorRows'
import { textMuted } from '@renderer/theme'
import TrendButton from './Trend/TrendButton'

type ClientUnits = Pick<ReturnType<typeof useClientZustand.getState>, 'clients'>

/** The unit under `unit` of the client under `uuid`, as the store holds it. */
export const unitIn = (state: ClientUnits, uuid: string, unit: string): ClientUnit | undefined =>
  state.clients[uuid]?.units.find(({ uuid }) => uuid === unit)

/** The address as the unit's address base writes it. */
export const AddressCell = meme(({ row }: { row: MonitorRegisterRow }): JSX.Element => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const addressBase = useClientZustand((z) => unitIn(z, uuid, row.unit)?.addressBase ?? '0')
  const unitId = useClientZustand((z) => unitIn(z, uuid, row.unit)?.unitId)
  const logged = useClientZustand((z) =>
    isLogged(row.type, unitIn(z, uuid, row.unit)?.registerMapping[row.type][row.address])
  )
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      {logged ? (
        <TrendButton row={row} testId={`monitor-trend-${unitId}-${row.type}-${row.address}`} />
      ) : (
        <Box component="span" sx={{ width: 20, flexShrink: 0 }} />
      )}
      <Box component="span" sx={{ fontWeight: 'bold', fontFamily: 'monospace' }}>
        {row.address + Number(addressBase)}
      </Box>
    </Box>
  )
})

export const DataTypeCell = meme(({ row }: { row: MonitorRegisterRow }): JSX.Element => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const dataType = useClientZustand(
    (z) => unitIn(z, uuid, row.unit)?.registerMapping[row.type][row.address]?.dataType
  )
  return <>{isNumberRegister(row.type) ? dataType?.toUpperCase() : 'BIT'}</>
})

/**
 * The value Monitor read, converted as Debug converts it, with the error of a
 * group that failed and 0 or 1 for a bit. `raw` draws the Raw column's cell,
 * the register before its conversion, which a bit and an error leave empty.
 */
export const ValueCell = meme(
  ({ row, raw = false }: { row: MonitorRegisterRow; raw?: boolean }): ReactNode => {
    const uuid = useClientZustand((z) => z.selectedUuid)
    const read = useLiveZustand((z) => rowAt(z, uuid, row.unit, row.type, row.address, true))
    const registerMap = useClientZustand(
      (z) => unitIn(z, uuid, row.unit)?.registerMapping[row.type]
    )
    const addressGroups = useLiveZustand(
      (z) => sectionOf(z, uuid, row.unit, row.type, true).addressGroups
    )
    // A script's value waits for the engine, and draws again once it is there.
    useScriptEngineZustand((z) => z.ready)

    if (read?.error) {
      if (raw) return null
      return (
        <span style={{ color: 'var(--mui-palette-error-main)' }} title={read.error}>
          {read.error}
        </span>
      )
    }
    if (read === undefined || registerMap === undefined) return null
    if (!isNumberRegister(row.type)) return raw ? null : read.bit ? '1' : '0'
    // A string's other registers, which the same read wrote with this one.
    const hexAt = (at: number): string | undefined =>
      rowAt(useLiveZustand.getState(), uuid, row.unit, row.type, at, true)?.hex
    const value = getConvertedValue(read, registerMap, raw, addressGroups, hexAt) ?? ''
    const engineeringUnit = registerMap[row.address]?.unit
    if (raw)
      return (
        <Box component="span" sx={{ color: textMuted }}>
          {value}
        </Box>
      )
    if (typeof value !== 'number' || !engineeringUnit) return value
    return (
      <>
        {value}
        <span style={{ opacity: 0.5 }}> {engineeringUnit}</span>
      </>
    )
  }
)

export const HexCell = meme(({ row }: { row: MonitorRegisterRow }): JSX.Element | null => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const hex = useLiveZustand((z) => rowAt(z, uuid, row.unit, row.type, row.address, true)?.hex)
  if (!isNumberRegister(row.type)) return null
  return (
    <Box sx={(theme) => ({ fontFamily: 'monospace', color: theme.palette.primary.light })}>
      {hex?.toUpperCase()}
    </Box>
  )
})

export const CommentCell = meme(({ row }: { row: MonitorRegisterRow }): JSX.Element => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const comment = useClientZustand(
    (z) => unitIn(z, uuid, row.unit)?.registerMapping[row.type][row.address]?.comment
  )
  return (
    <Box
      component="span"
      sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
    >
      {comment}
    </Box>
  )
})

/**
 * The write dialog Debug opens, pointed at this row's unit and type, with its
 * group as the range the coil picker offers. Disabled while polling, as in
 * Debug, because main refuses a write during a poll.
 */
export const WriteCell = meme(({ row }: { row: MonitorRegisterRow }): JSX.Element | null => {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const uuid = useClientZustand((z) => z.selectedUuid)
  const unitId = useClientZustand((z) => unitIn(z, uuid, row.unit)?.unitId)
  const disabled = useLiveZustand(
    (z) =>
      dataOf(z, uuid).clientState.polling ||
      dataOf(z, uuid).clientState.connectState !== 'connected'
  )
  const target = useMemo<WriteTarget>(
    () => ({ uuid, unit: row.unit, type: row.type, window: row.group, monitor: true }),
    [uuid, row.unit, row.type, row.group]
  )

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])

  if (row.type !== 'coils' && row.type !== 'holding_registers') return null

  return (
    <WriteTargetContext.Provider value={target}>
      <IconButton
        ref={buttonRef}
        size="small"
        color="primary"
        disabled={disabled}
        title={row.type === 'coils' ? 'Write Coil' : 'Write Register'}
        aria-label={row.type === 'coils' ? 'Write Coil' : 'Write Register'}
        data-testid={`monitor-write-${unitId}-${row.type}-${row.address}`}
        onClick={handleOpen}
      >
        <Edit fontSize="small" />
      </IconButton>
      {open && (
        <WriteModal
          open={open}
          onClose={handleClose}
          address={row.address}
          actionCellRef={buttonRef}
          type={row.type}
        />
      )}
    </WriteTargetContext.Provider>
  )
})
