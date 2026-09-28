import Functions from '@mui/icons-material/Functions'
import ButtonBase from '@mui/material/ButtonBase'
import { GridColDef } from '@mui/x-data-grid/models'
import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
import { meme } from '@renderer/components/shared/inputs/meme'
import { selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import { RegisterData, scalableDataTypes } from '@shared'
import { MouseEvent, useCallback, useState } from 'react'
import ConversionDialog from './ConversionDialog'

/**
 * A register's conversion at a glance: a scale shows its factor, an
 * interpolation or a script the function icon, none nothing. A click opens
 * the dialog, on the numeric data types a conversion applies to.
 */
const ConversionCell = meme(({ address }: { address: number }) => {
  const type = useSectionType()
  const dataType = useClientZustand((z) => selectedUnit(z).registerMapping[type][address]?.dataType)
  const conversion = useClientZustand(
    (z) => selectedUnit(z).registerMapping[type][address]?.conversion
  )
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    setAnchor(event.currentTarget)
  }, [])
  const handleClose = useCallback(() => setAnchor(null), [])

  if (!dataType || !scalableDataTypes.includes(dataType)) return null
  return (
    <>
      <ButtonBase
        data-testid={`conversion-cell-${address}`}
        aria-label="Conversion"
        onClick={handleOpen}
        sx={{
          width: '100%',
          height: '100%',
          justifyContent: 'flex-start',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          color: conversion ? 'text.primary' : 'text.disabled'
        }}
      >
        {conversion?.kind === 'scale' && conversion.factor}
        {(conversion?.kind === 'lerp' || conversion?.kind === 'script') && (
          <Functions fontSize="small" sx={{ color: 'primary.light' }} />
        )}
      </ButtonBase>
      {/* Mounted only while open: the cell is drawn once per visible row. */}
      {anchor && <ConversionDialog address={address} anchor={anchor} onClose={handleClose} />}
    </>
  )
})

export const conversionColumn: GridColDef<RegisterData> = {
  field: 'conversion',
  headerName: 'Conversion',
  width: 88,
  sortable: false,
  filterable: false,
  renderCell: ({ row }) => (row.isScanned ? null : <ConversionCell address={row.id} />)
}
