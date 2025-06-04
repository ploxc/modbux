import { Box } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import { Transaction } from '@shared'
import { DateTime } from 'luxon'
import { useMemo } from 'react'

const typestampColumn: GridColDef<Transaction, number, string> = {
  field: 'timestamp',
  headerName: 'Timestamp',
  hideable: false,
  width: 190,
  sortable: true,
  disableColumnMenu: true,
  valueFormatter: (v: number) => DateTime.fromMillis(v).toFormat('yyyy-MM-dd HH:mm:ss.SSS')
}

const unitIdColumn: GridColDef<Transaction, number> = {
  field: 'unitId',
  headerName: 'ID',
  sortable: false,
  disableColumnMenu: true,
  minWidth: 35,
  maxWidth: 35
}

const addressColumn: GridColDef<Transaction, number> = {
  field: 'address',
  headerName: 'Addr',
  sortable: false,
  disableColumnMenu: true,
  minWidth: 60,
  maxWidth: 60
}

// const lengthColumn: GridColDef<Transaction, number> = {
//   field: 'responseLength',
//   headerName: 'Length',
//   sortable: false,
//   disableColumnMenu: true,
//   minWidth: 60,
//   maxWidth: 60
// }

const functionColumn: GridColDef<Transaction, number> = {
  field: 'code',
  headerName: 'Fn',
  sortable: false,
  disableColumnMenu: true,
  minWidth: 35,
  maxWidth: 35
}

const requestColumn: GridColDef<Transaction, string, string> = {
  field: 'request',
  headerName: 'Request',
  width: 200,
  sortable: false,
  disableColumnMenu: true,
  renderCell: ({ value }) => <Box sx={{ fontFamily: 'monospace' }}>{value}</Box>
}

const responseColumn: GridColDef<Transaction, string[], string[]> = {
  field: 'responses',
  flex: 3,
  minWidth: 260,
  sortable: false,
  disableColumnMenu: true,
  renderCell: ({ value, row }) => {
    return (
      // Responses can hold multiple responses, we display them in a formatted way
      // Adding the response number to the response value
      <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
        {(value as string[]).map((v, i) => (
          <Box
            key={`response_${row.id}_${i}`}
            sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}
          >
            <span>{i + 1}:</span>
            <span>{v}</span>
          </Box>
        ))}
      </Box>
    )
  }
}

const errorMessageColumn: GridColDef<Transaction, string> = {
  field: 'errorMessage',
  headerName: 'Error',
  flex: 2,
  minWidth: 120,
  sortable: false,
  disableColumnMenu: true,
  valueFormatter: (v) => v ?? '-'
}

const useTransactionGridColumns = (): GridColDef<Transaction>[] => {
  return useMemo(() => {
    return [
      typestampColumn,
      unitIdColumn,
      addressColumn,
      // lengthColumn,
      functionColumn,
      requestColumn,
      responseColumn,
      errorMessageColumn
    ]
  }, [])
}

export default useTransactionGridColumns
