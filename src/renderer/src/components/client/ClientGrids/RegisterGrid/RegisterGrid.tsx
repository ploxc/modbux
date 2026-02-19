import { Paper, Typography } from '@mui/material'
import { useRootZustand } from '@renderer/context/root.zustand'
import { DateTime } from 'luxon'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useEffect } from 'react'
import useRegisterGridColumns from './columns'
import RegisterGridToolbar from './RegisterGridToolbar/RegisterGridToolbar'
import { GridFooterContainer } from '@mui/x-data-grid/components/containers/GridFooterContainer'
import { GridPagination } from '@mui/x-data-grid/components/GridPagination'
import { useGridApiRef } from '@mui/x-data-grid/hooks/utils/useGridApiRef'
import { GridFilterModel } from '@mui/x-data-grid/models/gridFilterModel'
import { GridLogicOperator } from '@mui/x-data-grid/models/gridFilterItem'
import { DataGrid } from '@mui/x-data-grid/DataGrid/DataGrid'
import { DataType } from '@shared'
import BitMapRow from './BitMapRow/BitMapRow'
//
//
//
//
// Footer
const Footer = meme(() => {
  const time = useRootZustand((z) => z.lastSuccessfulTransactionMillis)
  return (
    <GridFooterContainer sx={{ px: 1.5, justifyContent: 'space-between' }}>
      <Typography variant="caption" sx={{ opacity: 0.5 }}>
        Last transaction time:{' '}
        <strong>
          {time ? `${DateTime.fromMillis(time).toFormat('yyyy-MM-dd HH:mm:ss')}` : 'n/a'}
        </strong>
      </Typography>
      <GridPagination />
    </GridFooterContainer>
  )
})

//
//
//
//
// DataGrid
const RegisterGridContent = (): JSX.Element => {
  const registerData = useDataZustand((z) => z.registerData)
  const registerMapping = useRootZustand((z) => z.registerMapping[z.registerConfig.type])
  const columns = useRegisterGridColumns()

  const apiRef = useGridApiRef()

  // When we read all configured registers, we hide the rows with undefined data type
  // So no empty rows are shown so all rows have a value to display.
  const readConfiguration = useRootZustand((z) => z.registerConfig.readConfiguration)
  useEffect(() => {
    const filterModel: GridFilterModel = {
      items: [{ id: 1, field: 'dataType', operator: 'not', value: 'none' }],
      logicOperator: GridLogicOperator.And
    }
    if (readConfiguration) apiRef.current.setFilterModel(filterModel)
    else apiRef.current.setFilterModel({ items: [] })
  }, [apiRef, readConfiguration])

  return (
    <DataGrid
      apiRef={apiRef}
      rows={registerData}
      columns={columns}
      autoHeight={false}
      density="compact"
      rowHeight={40}
      columnHeaderHeight={48}
      hideFooterPagination
      editMode="cell"
      isCellEditable={({ colDef: { field }, row: { id } }) => {
        if (field === 'comment') return true
        const scalingEnabledDataTypes: DataType[] = [
          'double',
          'float',
          'int16',
          'int32',
          'int64',
          'uint16',
          'uint32',
          'uint64'
        ]
        const dataType = registerMapping[id]?.dataType ?? 'none'

        if (field === 'scalingFactor' && !scalingEnabledDataTypes.includes(dataType)) {
          return false
        }

        return dataType !== 'none' || field === 'dataType'
      }}
      sx={(theme) => ({
        '& .MuiDataGrid-virtualScrollerContent': {
          fontFamily: 'monospace',
          fontSize: '0.95em'
        },
        '& .MuiToolbar-root, .MuiDataGrid-footerContainer': {
          minHeight: 36,
          height: 36,
          overflow: 'hidden'
        },
        '& .MuiDataGrid-toolbarContainer': {
          background: theme.palette.background.default
        },
        '& .MuiDataGrid-filler > div': {
          borderTop: 'none',
          borderBottom: 'none'
        }
      })}
      localeText={{
        noRowsLabel: 'Connect and read to see registers'
      }}
      slots={{ toolbar: RegisterGridToolbar, footer: Footer, row: BitMapRow }}
      //
      //
      // Row update
      processRowUpdate={(newRow, oldRow) => {
        const z = useRootZustand.getState()

        // Update datatype
        if (newRow['dataType'] && newRow['dataType'] !== oldRow['dataType']) {
          z.setRegisterMapping(newRow.id, 'dataType', newRow['dataType'])
        }

        // Update scaling factor
        // This will ignore zero too, if you don't want to ignore zero compare with undefined
        if (newRow['scalingFactor'] && newRow['scalingFactor'] !== oldRow['scalingFactor']) {
          const z = useRootZustand.getState()
          z.setRegisterMapping(newRow.id, 'scalingFactor', newRow['scalingFactor'])
        }

        // Update comment
        if (typeof newRow['comment'] === 'string' && newRow['comment'] !== oldRow['comment']) {
          const z = useRootZustand.getState()
          z.setRegisterMapping(newRow.id, 'comment', newRow['comment'])
        }

        // Update group end
        if (typeof newRow['groupEnd'] === 'boolean' && newRow['groupEnd'] !== oldRow['groupEnd']) {
          const z = useRootZustand.getState()
          z.setRegisterMapping(newRow.id, 'groupEnd', newRow['groupEnd'])
        }

        return newRow
      }}
    />
  )
}

//
//
//
//
// DataGrid paper
const RegisterGrid = (): JSX.Element => {
  return (
    <Paper sx={{ flexShrink: 1, flexGrow: 1, minHeight: 0, height: '100%' }}>
      <RegisterGridContent />
    </Paper>
  )
}

export default RegisterGrid
