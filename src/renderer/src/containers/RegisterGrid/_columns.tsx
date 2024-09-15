import { Box } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import { RegisterData, RegisterDataEndian } from '@shared'
import { useMemo } from 'react'

const registerValueToString = (
  value: number | bigint
): { numberString: string; irrelevant: boolean } => {
  let numberString: string = '0'
  numberString = value.toString(10)

  const irrelevant = numberString === '0'

  return { numberString, irrelevant }
}

const addressColumn: GridColDef<RegisterData, number> = {
  field: 'id',
  headerName: 'Address',
  width: 70,
  renderCell: ({ value }) => <Box sx={{ fontWeight: 'bold' }}>{value}</Box>
}

const hexColumn: GridColDef<RegisterData, string> = {
  field: 'hex',
  headerName: 'HEX',
  width: 50,
  renderCell: ({ value }) => (
    <Box
      sx={(theme) => ({
        fontFamily: 'monospace',
        opacity: 0.75,
        color: theme.palette.primary.light
      })}
    >
      {value?.toUpperCase()}
    </Box>
  )
}

const valueColumn = (
  field: 'bigEndian' | 'littleEndian',
  key: keyof RegisterDataEndian,
  width: number
): GridColDef<RegisterData, RegisterDataEndian, RegisterDataEndian> => ({
  type: 'number',
  field: `${field}_${key}`,
  headerName: key.toUpperCase(),
  width,
  renderCell: ({ row }): JSX.Element => {
    const value = row[field][key]
    const { numberString, irrelevant } = registerValueToString(value)

    return <Box sx={{ opacity: irrelevant ? 0.25 : undefined }}>{numberString}</Box>
  }
})

const useRegisterGridColumns = () => {
  return useMemo(() => {
    return [
      addressColumn,
      hexColumn,
      valueColumn('bigEndian', 'int16', 70),
      valueColumn('bigEndian', 'uint16', 70),
      valueColumn('bigEndian', 'int32', 100),
      valueColumn('bigEndian', 'uint32', 100),
      valueColumn('bigEndian', 'int64', 160),
      valueColumn('bigEndian', 'uint64', 160),
      valueColumn('bigEndian', 'float', 200),
      valueColumn('bigEndian', 'double', 200)
    ]
  }, [])
}

export default useRegisterGridColumns
