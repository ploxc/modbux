import { GridColDef } from '@mui/x-data-grid'
import { RegisterType, ScanUnitIDResult } from '@shared'
import { useMemo } from 'react'
import { useScanUnitIdZustand } from './_zustand'
import { Box, Chip } from '@mui/material'
import { CheckCircle, ErrorRounded } from '@mui/icons-material'

const unitIdColumn: GridColDef<ScanUnitIDResult, number> = {
  field: 'unitID',
  headerName: 'Unit ID',
  hideable: false,
  width: 60,
  disableColumnMenu: true
}

const typeColumn = (registerType: RegisterType, name: string): GridColDef<ScanUnitIDResult> => ({
  field: registerType,
  headerName: name,
  disableColumnMenu: true,
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

const errorColumn: GridColDef<ScanUnitIDResult> = {
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
                {k === RegisterType.Coils
                  ? 'FC1'
                  : k === RegisterType.DiscreteInputs
                    ? 'FC2'
                    : k === RegisterType.HoldingRegisters
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

    if (registerTypes.includes(RegisterType.Coils))
      newColumns.push(typeColumn(RegisterType.Coils, 'Coils'))
    if (registerTypes.includes(RegisterType.DiscreteInputs))
      newColumns.push(typeColumn(RegisterType.DiscreteInputs, 'Inputs'))
    if (registerTypes.includes(RegisterType.InputRegisters))
      newColumns.push(typeColumn(RegisterType.InputRegisters, 'Input Reg.'))
    if (registerTypes.includes(RegisterType.HoldingRegisters))
      newColumns.push(typeColumn(RegisterType.HoldingRegisters, 'Holding'))

    newColumns.push(errorColumn)

    return newColumns
  }, [registerTypes])
}

export default useScanUnitIdColumns
