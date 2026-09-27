import { GridColDef } from '@mui/x-data-grid/models'
import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
import { meme } from '@renderer/components/shared/inputs/meme'
import { selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { sectionOf, useLiveZustand } from '@renderer/context/live.zustand'
import {
  AddressGroup,
  BITMAP_DATATYPE,
  DataType,
  RegisterData,
  RegisterLinearInterpolation,
  RegisterMapObject,
  wordOf
} from '@shared'
import { round } from 'lodash'
import { ReactNode } from 'react'
import { useRowAt } from '../useRowAt'
import { ExpandCell } from './ExpandCell'

// Linear interpolation function
const linearInterpolate = (x: number, { x1, x2, y1, y2 }: RegisterLinearInterpolation): number => {
  const nx1 = Number(x1)
  const nx2 = Number(x2)
  const ny1 = Number(y1)
  const ny2 = Number(y2)

  // Avoid division by zero; return y1 if x1 === x2
  if (nx2 === nx1) {
    return ny1
  }

  // Compute interpolation factor t = (x – x1) / (x2 – x1)
  const t = (x - nx1) / (nx2 - nx1)

  // Return interpolated value y = y1 + t * (y2 - y1)
  return ny1 + t * (ny2 - ny1)
}

/**
 * What a value cell shows, error included, read from the store rather than from
 * the grid's row, which carries no values while no value filter is set.
 * `bitmapValueColumn` renders the same cell, and `bitmap` makes a bitmap row's
 * cell its expand toggle, unless that row failed to read.
 */
export const ConvertedValueCell = meme(
  ({ address, bitmap = false }: { address: number; bitmap?: boolean }): ReactNode => {
    const type = useSectionType()
    const row = useRowAt(address)
    const registerMap = useClientZustand((z) => selectedUnit(z).registerMapping[type])
    const showRaw = useLayoutZustand((z) => z.showClientRawValues)
    const selectedUuid = useClientZustand((z) => z.selectedUuid)
    const unit = useClientZustand((z) => selectedUnit(z).uuid)
    const addressGroups = useLiveZustand(
      (z) => sectionOf(z, selectedUuid, unit, type).addressGroups
    )

    if (row?.error) {
      return (
        <span style={{ color: 'var(--mui-palette-error-main)' }} title={row.error}>
          {row.error}
        </span>
      )
    }
    if (bitmap && registerMap[address]?.dataType === BITMAP_DATATYPE) {
      return <ExpandCell address={address} />
    }
    if (row === undefined) return null
    return getConvertedValue(row, registerMap, showRaw, addressGroups) ?? ''
  }
)

export const convertedValueColumn = (
  registerMap: RegisterMapObject,
  showRaw: boolean,
  addressGroups: AddressGroup[]
): GridColDef<RegisterData> => ({
  field: 'value',
  hideable: false,
  type: 'string',
  headerName: 'Value',
  width: 160,
  renderCell: ({ row }) => <ConvertedValueCell address={row.id} />,
  valueGetter: (_, row): number | string | undefined =>
    getConvertedValue(row, registerMap, showRaw, addressGroups),
  valueFormatter: (v) => (v !== undefined ? v : '')
})

/**
 * The value a cell reads, scaled and interpolated. `bitmapValueColumn` hands
 * every row that is not a bitmap back to this, and it takes the map, the raw
 * flag and the groups the rows were read in rather than reaching into the
 * column it builds on. The groups cut a UTF-8 string, and each section has
 * its own.
 */
export const getConvertedValue = (
  row: RegisterData,
  registerMap: RegisterMapObject,
  showRaw: boolean,
  addressGroups: AddressGroup[]
): number | string | undefined => {
  if (row.error) return undefined
  const address = row.id

  // Get the defined datatype from the register map
  const dataType = registerMap[address]?.dataType

  // Get the value for the register datatype, they are all there, the defined datatype
  // extracts that value and shows it in the value column.
  //
  // The word is read before it is stringified, because `String(undefined)` is
  // the word "undefined", which is truthy, so a row carrying no words drew that
  // in the cell. `convertBitData` writes such a row for every coil and discrete
  // input, and those rows outlive a switch of the register type while a read
  // loop owns the grid. A UTF-8 register drew the same word cut to the group it
  // sits in, which is `"undefine"` over four registers.
  const word = wordOf(row.words, dataType)
  if (word === undefined || word === '') return undefined
  const value = String(word)

  // For strings we must calculate the length until the next defined datatype
  let count = 1
  if (dataType === 'utf8') {
    // Find the current group that contains the address
    const currentGroup = addressGroups.find(
      ([groupAddress, length]) => address >= groupAddress && address < groupAddress + length
    )
    if (!currentGroup) return undefined

    const startAddress = currentGroup[0]
    const length = currentGroup[1]

    let register = registerMap[address + count]

    // Continue until we find the next register with a defined datatype, or
    // until the end of the group. The group is [startAddress, + length), the
    // same half-open range the `find` above reads it as, and `<=` took two
    // characters out of whatever was read after it.
    while (
      address + count < startAddress + length &&
      (!register || register.dataType === 'none' || !register.dataType)
    ) {
      count++
      register = registerMap[address + count]
    }

    // Slice the string to the right length
    // The utf8 value starts from the current register's offset,
    // so we slice from 0 (each register = 2 characters for ASCII)
    return value.slice(0, count * 2)
  }

  // Return a string when it's a string :D
  if (dataType === 'datetime' || dataType === 'unix') return value

  const isNotANumberValue = isNaN(Number(value))
  if (isNotANumberValue) return undefined

  if (showRaw) return Number(value)

  const { scaledValue, precision } = convert(value, dataType, registerMap, address)
  return round(scaledValue, precision)
}

type ConvertFn = (
  value: string,
  dataType: DataType | undefined,
  registerMap: RegisterMapObject,
  address: number
) => {
  scaledValue: number
  precision: number
}

const convert: ConvertFn = (value, dataType, registerMap, address) => {
  // Get the scaling factor from the register map
  // And the decimal places for rounding the scaled value because js can add some unwanted
  // decimal places by deviding by the scaling factor
  const scalingFactor = registerMap[address]?.scalingFactor ?? 1
  const decimalPlaces = String(scalingFactor).split('.')[1]?.length ?? 0

  // When we have a floating point number, we add the decimal places of it
  // to the decimal places of the scaling factor, else we would round the float completely
  const float = dataType === 'float' || dataType === 'double'
  const decimalPlacesFloat = float ? (value.split('.')[1]?.length ?? 0) : 0

  // Scale
  let scaledValue = Number(value) * scalingFactor

  // Interpolate
  const interpolate = registerMap[address]?.interpolate
  if (interpolate) scaledValue = linearInterpolate(scaledValue, interpolate)

  return { scaledValue, precision: decimalPlaces + decimalPlacesFloat }
}
