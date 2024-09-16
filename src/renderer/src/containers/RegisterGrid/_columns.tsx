import { Box } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import { useRootZustand } from '@renderer/context/root.zustand'
import { getConventionalAddress, RegisterData, RegisterDataWords, RegisterType } from '@shared'
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
  hideable: false,
  headerName: 'Addr.',
  width: 60,
  renderCell: ({ value }) => <Box sx={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{value}</Box>
}

const conventionalAddresColumn = (
  type: RegisterType,
  addressBase: string
): GridColDef<RegisterData, number> => ({
  field: 'conventionalAddress',
  headerName: 'Conv.',
  width: 60,
  renderCell: ({ row }) => {
    const value = getConventionalAddress(type, String(row.id), addressBase)
    return (
      <Box
        sx={(theme) => ({
          fontFamily: 'monospace',
          color: theme.palette.primary.light
        })}
      >
        {value}
      </Box>
    )
  }
})

const hexColumn: GridColDef<RegisterData, string> = {
  field: 'hex',
  hideable: false,
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
  key: keyof RegisterDataWords,
  width: number
): GridColDef<RegisterData, RegisterDataWords, RegisterDataWords> => ({
  type: 'number',
  field: `word_${key}`,
  headerName: key.toUpperCase(),
  width,
  renderCell: ({ row }): JSX.Element | null => {
    const value = row.words?.[key]
    if (value === undefined) return null

    const { numberString, irrelevant } = registerValueToString(value)
    return <Box sx={{ opacity: irrelevant ? 0.25 : undefined }}>{numberString}</Box>
  }
})

const useRegisterGridColumns = () => {
  const type = useRootZustand((z) => z.registerConfig.type)
  const addressBase = useRootZustand((z) => z.addressBase)

  return useMemo(() => {
    return [
      addressColumn,
      conventionalAddresColumn(type, addressBase),
      hexColumn,
      valueColumn('int16', 70),
      valueColumn('uint16', 70),
      valueColumn('int32', 100),
      valueColumn('uint32', 100),
      valueColumn('int64', 160),
      valueColumn('uint64', 160),
      valueColumn('float', 200),
      valueColumn('double', 200)
    ]
  }, [type, addressBase])
}

export default useRegisterGridColumns
