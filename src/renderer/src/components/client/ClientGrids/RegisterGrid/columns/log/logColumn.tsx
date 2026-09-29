import ShowChart from '@mui/icons-material/ShowChart'
import ButtonBase from '@mui/material/ButtonBase'
import { GridColDef } from '@mui/x-data-grid/models'
import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
import { meme } from '@renderer/components/shared/inputs/meme'
import { selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import { isLoggable, RegisterData } from '@shared'
import { MouseEvent, useCallback, useState } from 'react'
import LogPopover from './LogPopover'

/**
 * Whether a register logs, at a glance: the icon lit in the success colour
 * when it does, and as faint as the Conv. column's when it does not. The
 * setting itself is in the popover a click opens. A register that cannot log
 * shows nothing.
 */
const LogCell = meme(({ address }: { address: number }) => {
  const type = useSectionType()
  const loggable = useClientZustand((z) =>
    isLoggable(type, selectedUnit(z).registerMapping[type][address])
  )
  const logged = useClientZustand(
    (z) => selectedUnit(z).registerMapping[type][address]?.log !== undefined
  )
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    setAnchor(event.currentTarget)
  }, [])
  const handleClose = useCallback(() => setAnchor(null), [])

  if (!loggable) return null
  return (
    <>
      <ButtonBase
        data-testid={`log-cell-${address}`}
        aria-label={logged ? 'Logs' : 'Log'}
        aria-pressed={logged}
        onClick={handleOpen}
        sx={{ width: '100%', height: '100%', justifyContent: 'flex-start' }}
      >
        <ShowChart
          fontSize="small"
          sx={logged ? { color: 'success.main' } : { color: 'text.primary', opacity: 0.2 }}
        />
      </ButtonBase>
      {/* Mounted only while open: the cell is drawn once per visible row. */}
      {anchor && <LogPopover address={address} anchor={anchor} onClose={handleClose} />}
    </>
  )
})

export const logColumn: GridColDef<RegisterData> = {
  field: 'log',
  headerName: 'Log',
  width: 44,
  sortable: false,
  filterable: false,
  renderCell: ({ row }) => (row.isScanned ? null : <LogCell address={row.id} />)
}
