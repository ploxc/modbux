import { GridColDef } from '@mui/x-data-grid'
import { RegisterType, ScanUnitIdResult } from '@shared'
import { useMemo } from 'react'
import { useScanUnitIdZustand } from './_zustand'
import { Box, Chip } from '@mui/material'
import { CheckCircle, ErrorRounded } from '@mui/icons-material'

const unitIdColumn: GridColDef<ScanUnitIdResult, number, number> = {
  field: 'id',
  headerName: 'Unit ID',
  hideable: false,
  width: 60,
  disableColumnMenu: true
}

const typeColumn = (registerType: RegisterType, name: string): GridColDef<ScanUnitIdResult> => ({
  field: registerType,
  type: 'boolean',
  headerName: name,
  disableColumnMenu: false,
  width: 90,
  valueGetter: (_, row) => row.registerTypes.includes(registerType),
  renderCell: ({ value, row }) => (
    <Box sx={{ width: '100%', display: 'flex' }}>
      {value ? (
        <Chip icon={<CheckCircle />} label="OK" size="small" color="success" />
      ) : row.requestedRegisterTypes.includes(registerType) ? (
        <Chip icon={<ErrorRounded />} label="ERROR" size="small" color="error" />
      ) : null}
    </Box>
  )
})

const errorColumn: GridColDef<ScanUnitIdResult> = {
  field: 'errorMessage',
  headerName: 'Error',
  flex: 1,
  minWidth: 150,
  disableColumnMenu: true,
  renderCell: ({ value }) =>
    value === null ? null : (
      <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {Object.entries(value).map(([k, v]) => {
          return String(v).length === 0 ? null : (
            <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span>
                {k === 'coils'
                  ? 'FC1'
                  : k === 'discrete_inputs'
                    ? 'FC2'
                    : k === 'holding_registers'
                      ? 'FC3'
                      : 'FC4'}
                :
              </span>
              <span>{String(v)}</span>
            </Box>
          )
        })}
      </Box>
    )
}

const useScanUnitIdColumns = () => {
  const registerTypes = useScanUnitIdZustand((z) => z.registerTypes)

  return useMemo(() => {
    const newColumns = [unitIdColumn]

    if (registerTypes.includes('coils')) newColumns.push(typeColumn('coils', 'Coils'))
    if (registerTypes.includes('discrete_inputs'))
      newColumns.push(typeColumn('discrete_inputs', 'Inputs'))
    if (registerTypes.includes('input_registers'))
      newColumns.push(typeColumn('input_registers', 'Input Reg.'))
    if (registerTypes.includes('holding_registers'))
      newColumns.push(typeColumn('holding_registers', 'Holding'))

    newColumns.push(errorColumn)

    return newColumns
  }, [registerTypes])
}

export default useScanUnitIdColumns
