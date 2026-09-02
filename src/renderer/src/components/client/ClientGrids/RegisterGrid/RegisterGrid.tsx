import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useClientZustand } from '@renderer/context/client.zustand'
import { DateTime } from 'luxon'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useEffect, useRef } from 'react'
import useRegisterGridColumns from './columns'
import RegisterGridToolbar from './RegisterGridToolbar/RegisterGridToolbar'
import { useGridApiRef } from '@mui/x-data-grid'
import { DataGrid } from '@mui/x-data-grid/DataGrid'
import { GridFooterContainer, GridPagination } from '@mui/x-data-grid/components'
import { GridFilterModel, GridLogicOperator } from '@mui/x-data-grid/models'
import { DataType, RegisterData } from '@shared'
import { alpha } from '@mui/material/styles'
import { showMapping } from '@renderer/context/data.zustand'
import BitMapRow from './BitMapRow/BitMapRow'
//
//
//
//
// Footer
const Footer = meme(() => {
  const time = useClientZustand((z) => z.lastSuccessfulTransactionMillis)
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
const RegisterGridContent = meme((): JSX.Element => {
  const registerData = useDataZustand((z) => z.registerData)
  const registerMapping = useClientZustand((z) => z.registerMapping[z.registerConfig.type])
  const columns = useRegisterGridColumns()

  const apiRef = useGridApiRef()

  // When we read all configured registers, we hide the rows with undefined data type
  // So no empty rows are shown so all rows have a value to display.
  const readConfiguration = useClientZustand((z) => z.readConfiguration)

  // While a scan fills the grid, the rows are there to watch, not to work on:
  // a cell put into edit mode or a column menu opened over data that is still
  // arriving is a fight nobody wins. Scrolling and paging stay.
  const scanning = useClientZustand((z) => z.clientState.scanningRegisters)
  const prevReadConfigRef = useRef(readConfiguration)
  useEffect(() => {
    const filterModel: GridFilterModel = {
      items: [{ id: 1, field: 'dataType', operator: 'not', value: 'none' }],
      logicOperator: GridLogicOperator.And
    }
    if (readConfiguration) {
      showMapping()
      apiRef.current?.setFilterModel(filterModel)
    } else {
      // Only clear data when transitioning from ON to OFF, not on initial mount
      if (prevReadConfigRef.current) {
        useDataZustand.getState().setRegisterData([])
      }
      apiRef.current?.setFilterModel({ items: [] })
    }
    prevReadConfigRef.current = readConfiguration
  }, [apiRef, readConfiguration])

  return (
    <DataGrid
      apiRef={apiRef}
      rows={registerData}
      columns={columns}
      // Off under e2e only, so a spec asserts on the column it named rather
      // than on whether that column happened to be in the rendered band.
      disableVirtualization={window.api.isE2e}
      // Read configuration owns the filter model while it is on. Leaving the
      // column menus open would let a filter of the user's fight it, and the
      // data type filter below could be edited or deleted from the menu, which
      // fills the list with the empty rows it exists to hide. Only the menu
      // entries go: a model set here still filters.
      disableColumnFilter={readConfiguration}
      autoHeight={false}
      density="compact"
      rowHeight={40}
      columnHeaderHeight={48}
      hideFooterPagination
      getRowClassName={(params) => ((params.row as RegisterData).error ? 'register-error-row' : '')}
      editMode="cell"
      isCellEditable={({ colDef: { field }, row: { id } }) => {
        if (scanning) return false
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
        ...(scanning && {
          '& .MuiDataGrid-cell, & .MuiDataGrid-columnHeader': { pointerEvents: 'none' }
        }),
        // x-data-grid v8 moved the column headers inside the virtual scroller
        // for column virtualisation, so scoping monospace to the scroller now
        // catches the headers too. Target the data rows instead.
        '& .MuiDataGrid-row': {
          fontFamily: 'monospace',
          fontSize: '0.95em'
        },
        '& .MuiToolbar-root, .MuiDataGrid-footerContainer': {
          minHeight: 36,
          height: 36,
          overflow: 'hidden'
        },
        '& .register-error-row': {
          backgroundColor: alpha(theme.palette.error.main, 0.08),
          '&:hover': {
            backgroundColor: alpha(theme.palette.error.main, 0.12)
          }
        },
        '& .group-column-even, .group-column-odd': {
          textAlign: 'center',
          fontSize: '0.7rem'
        },
        '& .group-column-even': {
          backgroundColor: alpha(theme.palette.primary.main, 0.1)
        },
        '& .group-column-odd': {
          backgroundColor: alpha(theme.palette.primary.main, 0.22)
        },
        '& .MuiDataGrid-filler > div': {
          borderTop: 'none',
          borderBottom: 'none'
        }
      })}
      localeText={{
        noRowsLabel: 'Connect and read to see registers'
      }}
      // Registers are read in address order and that order carries meaning, so
      // nothing here is sortable. Set on the grid rather than per column: the
      // value columns come out of a factory that never carried the flag, so
      // eight of them were sortable by accident.
      disableColumnSorting
      // x-data-grid v8 no longer renders the toolbar slot implicitly; without
      // showToolbar the whole RegisterGridToolbar silently disappears.
      showToolbar
      slots={{ toolbar: RegisterGridToolbar, footer: Footer, row: BitMapRow }}
      getCellClassName={({ field, row }) =>
        field === 'groupIndex' && row.groupIndex !== undefined
          ? row.groupIndex % 2 === 0
            ? 'group-column-even'
            : 'group-column-odd'
          : ''
      }
      //
      //
      // Row update
      processRowUpdate={(newRow, oldRow) => {
        const z = useClientZustand.getState()

        // Update datatype
        if (newRow['dataType'] && newRow['dataType'] !== oldRow['dataType']) {
          z.setRegisterMapping(newRow.id, 'dataType', newRow['dataType'])
        }

        // Update scaling factor
        // This will ignore zero too, if you don't want to ignore zero compare with undefined
        if (newRow['scalingFactor'] && newRow['scalingFactor'] !== oldRow['scalingFactor']) {
          const z = useClientZustand.getState()
          z.setRegisterMapping(newRow.id, 'scalingFactor', newRow['scalingFactor'])
        }

        // Update comment
        if (typeof newRow['comment'] === 'string' && newRow['comment'] !== oldRow['comment']) {
          const z = useClientZustand.getState()
          z.setRegisterMapping(newRow.id, 'comment', newRow['comment'])
        }

        // Update group end
        if (typeof newRow['groupEnd'] === 'boolean' && newRow['groupEnd'] !== oldRow['groupEnd']) {
          const z = useClientZustand.getState()
          z.setRegisterMapping(newRow.id, 'groupEnd', newRow['groupEnd'])
        }

        return newRow
      }}
    />
  )
})

//
//
//
//
// DataGrid paper
const RegisterGrid = meme((): JSX.Element => {
  return (
    <Paper sx={{ flexShrink: 1, flexGrow: 1, minHeight: 0, height: '100%' }}>
      <RegisterGridContent />
    </Paper>
  )
})

export default RegisterGrid
