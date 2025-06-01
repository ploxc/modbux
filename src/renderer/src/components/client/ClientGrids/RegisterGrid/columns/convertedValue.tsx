import { GridColDef } from '@mui/x-data-grid/models'
import { useDataZustand } from '@renderer/context/data.zustand'
import { RegisterData, RegisterMapObject } from '@shared'
import { round } from 'lodash'

export const convertedValueColumn = (registerMap: RegisterMapObject): GridColDef<RegisterData> => ({
  field: 'value',
  sortable: false,
  hideable: false,
  type: 'string',
  headerName: 'Value',
  width: 150,
  valueGetter: (_, row) => {
    const address = row.id

    // Get the defined datatype from the register map
    const dataType = registerMap[address]?.dataType

    // Get the value for the register datatype, they are all there, the defined datatype
    // extracts that value and shows it in the value column
    const value = dataType && dataType !== 'none' ? String(row.words?.[dataType]) : undefined
    if (!value) return undefined

    // For strings we must calculate the length until the next defined datatype
    let count = 1
    if (dataType === 'utf8') {
      const groups = useDataZustand.getState().addressGroups

      // Find the current group that contains the address
      const currentGroup = groups.find(([addr, len]) => address >= addr && address < addr + len)
      if (!currentGroup) return undefined

      const startAddress = currentGroup[0]
      const length = currentGroup[1]

      let register = registerMap[address + count]

      // Continue until we find the next register with a defined datatype
      // Or stop when we reach the end of the group
      while (
        address <= startAddress + length &&
        (!register || register.dataType === 'none' || !register.dataType)
      ) {
        count++
        register = registerMap[address + count]
      }

      // Slice the string to the right length and return it
      // In the backend the string is converted from the whole buffer so
      // we can use a variable length by doing this logic
      const startIndex = address - startAddress
      return value.slice(startIndex * 2, (startIndex + count) * 2)
    }

    // Return a string when it's a string :D
    if (dataType === 'datetime' || dataType === 'unix') return value

    // Get the scaling factor from the register map
    // And the decimal places for rounding the scaled value because js can add some unwanted
    // decimal places by deviding by the scaling factor
    const scalingFactor = registerMap[address]?.scalingFactor ?? 1
    const decimalPlaces = String(scalingFactor).split('.')[1]?.length ?? 0

    // When we have a floating point number, we add the decimal places of it
    // to the decimal places of the scaling factor, else we would round the float completely
    const float = dataType === 'float' || dataType === 'double'
    const decimalPlacesFloat = float ? (value.split('.')[1]?.length ?? 0) : 0

    // Round the scaled value to the given decimal places
    const isNotANumberValue = isNaN(Number(value))
    if (isNotANumberValue) return undefined

    return round(Number(value) * scalingFactor, decimalPlaces + decimalPlacesFloat)
  },
  valueFormatter: (v) => (v !== undefined ? v : '')
})
