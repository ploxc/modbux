import Autocomplete from '@mui/material/Autocomplete'
import InputBase from '@mui/material/InputBase'
import { useGridApiContext } from '@mui/x-data-grid'
import { GridColDef, GridRenderEditCellParams } from '@mui/x-data-grid/models'
import { meme } from '@renderer/components/shared/inputs/meme'
import {
  ENGINEERING_UNIT_OPTIONS,
  RegisterData,
  RegisterMapObject,
  scalableDataTypes
} from '@shared'
import { ReactNode, SyntheticEvent, useCallback } from 'react'

type UnitOption = (typeof ENGINEERING_UNIT_OPTIONS)[number]

const optionLabel = (option: UnitOption | string): string =>
  typeof option === 'string' ? option : option.unit
const quantityOf = (option: UnitOption): string => option.quantity

/** Any text, with the engineering units suggested by quantity while typing. */
const UnitEditCell = meme(
  ({ id, field, value }: GridRenderEditCellParams<RegisterData, string>) => {
    const apiRef = useGridApiContext()

    const handleChange = useCallback(
      (_event: SyntheticEvent, next: UnitOption | string | null) => {
        void apiRef.current.setEditCellValue({
          id,
          field,
          value: next === null ? '' : optionLabel(next)
        })
      },
      [apiRef, id, field]
    )
    const handleInputChange = useCallback(
      (_event: SyntheticEvent, next: string) => {
        void apiRef.current.setEditCellValue({ id, field, value: next })
      },
      [apiRef, id, field]
    )

    return (
      <Autocomplete<UnitOption, false, false, true>
        freeSolo
        autoHighlight={false}
        openOnFocus
        options={ENGINEERING_UNIT_OPTIONS}
        groupBy={quantityOf}
        getOptionLabel={optionLabel}
        inputValue={value ?? ''}
        onInputChange={handleInputChange}
        onChange={handleChange}
        slotProps={{ popper: { sx: { minWidth: 160 } } }}
        sx={{ width: '100%' }}
        renderInput={({ slotProps }) => (
          <InputBase
            ref={slotProps.input.ref}
            inputProps={{ ...slotProps.htmlInput, 'data-testid': `unit-input-${id}` }}
            autoFocus
            sx={{ px: 1, width: '100%', fontSize: 'inherit', fontFamily: 'inherit' }}
          />
        )}
      />
    )
  }
)

export const unitColumn = (registerMap: RegisterMapObject): GridColDef<RegisterData> => ({
  field: 'unit',
  headerName: 'Unit',
  width: 64,
  editable: true,
  // The filter offers the units this map uses, not the whole suggestion list.
  type: 'singleSelect',
  valueOptions: [
    ...new Set(Object.values(registerMap).flatMap((entry) => (entry?.unit ? [entry.unit] : [])))
  ].sort(),
  valueGetter: (_, row): string => registerMap[row.id]?.unit ?? '',
  renderCell: ({ value, row }): ReactNode | undefined => {
    const dataType = registerMap[row.id]?.dataType
    return dataType && scalableDataTypes.includes(dataType) ? value : ''
  },
  renderEditCell: (params) => <UnitEditCell {...params} />
})
