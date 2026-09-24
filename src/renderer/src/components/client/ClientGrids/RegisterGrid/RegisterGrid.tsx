import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useClientZustand, selectedClient, selectedSession } from '@renderer/context/client.zustand'
import { DateTime } from 'luxon'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useCallback, useEffect, useRef } from 'react'
import useRegisterGridColumns from './columns'
import RegisterGridToolbar from './RegisterGridToolbar/RegisterGridToolbar'
import { useGridApiRef } from '@mui/x-data-grid'
import { DataGrid } from '@mui/x-data-grid/DataGrid'
import { GridFooterContainer, GridPagination } from '@mui/x-data-grid/components'
import {
  GridFilterModel,
  GridLogicOperator,
  GridRowHeightParams,
  GridRowHeightReturnValue
} from '@mui/x-data-grid/models'
import { BITMAP_DATATYPE, RegisterData, scalableDataTypes } from '@shared'
import { alpha } from '@mui/material/styles'
import { showMapping } from '@renderer/context/data.zustand'
import BitMapRow from './BitMapRow'
import { useBitMapZustand } from '@renderer/context/bitmap.zustand'
import { COMPACT_ROW_HEIGHT, ROW_HEIGHT } from './rowHeight'
//
//
//
//
// Footer
const Footer = meme(() => {
  const time = useDataZustand((z) => z.lastSuccessfulTransactionMillis)
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
  const registerMapping = useClientZustand(
    (z) => selectedClient(z).registerMapping[selectedClient(z).registerConfig.type]
  )
  const columns = useRegisterGridColumns()

  const apiRef = useGridApiRef()

  // When we read all configured registers, we hide the rows with undefined data type
  // So no empty rows are shown so all rows have a value to display.
  const readConfiguration = useClientZustand((z) => selectedSession(z).readConfiguration)

  // While a scan fills the grid, the rows are there to watch, not to work on:
  // a cell put into edit mode or a column menu opened over data that is still
  // arriving is a fight nobody wins. Scrolling and paging stay.
  const scanning = useDataZustand((z) => z.clientState.scanningRegisters)

  // An expanded bitmap row is taller by whatever its detail panel measures, and
  // the grid places every row below it from this answer.
  //
  // An address stops being a bitmap while its panel is open: the type cell is
  // editable, the register type switches, a config loads over it. `BitMapRow`
  // takes its fast path then and draws no panel, so the height has to go with
  // it or an empty gap is left where no control remains to close it.
  const expandedAddress = useBitMapZustand((z) => z.expandedAddress)
  const detailHeight = useBitMapZustand((z) => z.detailHeight)
  const expandedBitmap =
    expandedAddress !== null && registerMapping[expandedAddress]?.dataType === BITMAP_DATATYPE
      ? expandedAddress
      : null

  // `null` is the grid's own word for "use rowHeight".
  const getRowHeight = useCallback(
    ({ id, densityFactor }: GridRowHeightParams): GridRowHeightReturnValue =>
      id === expandedBitmap ? ROW_HEIGHT * densityFactor + detailHeight : null,
    [expandedBitmap, detailHeight]
  )

  // The grid caches what `getRowHeight` answered, and a new function alone does
  // not tell it to ask again.
  useEffect(() => {
    apiRef.current?.resetRowHeights()
  }, [apiRef, expandedBitmap, detailHeight])

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

  const handleRowUpdate = useCallback(
    (newRow: RegisterData, oldRow: RegisterData): RegisterData => {
      const clientZustand = useClientZustand.getState()

      // Update datatype
      if (newRow['dataType'] && newRow['dataType'] !== oldRow['dataType']) {
        clientZustand.setRegisterMapping(newRow.id, 'dataType', newRow['dataType'])
      }

      // Update scaling factor
      // This will ignore zero too, if you don't want to ignore zero compare with undefined
      if (newRow['scalingFactor'] && newRow['scalingFactor'] !== oldRow['scalingFactor']) {
        clientZustand.setRegisterMapping(newRow.id, 'scalingFactor', newRow['scalingFactor'])
      }

      // Update comment
      if (typeof newRow['comment'] === 'string' && newRow['comment'] !== oldRow['comment']) {
        clientZustand.setRegisterMapping(newRow.id, 'comment', newRow['comment'])
      }

      // Update group end
      if (typeof newRow['groupEnd'] === 'boolean' && newRow['groupEnd'] !== oldRow['groupEnd']) {
        clientZustand.setRegisterMapping(newRow.id, 'groupEnd', newRow['groupEnd'])
      }

      return newRow
    },
    []
  )

  return (
    <DataGrid
      // A class rather than a testid: the DataGrid root does not forward one.
      // The transaction log is a second grid, so a spec reaching for the
      // register grid's scroller needs to say which.
      className="register-grid"
      apiRef={apiRef}
      rows={registerData}
      columns={columns}
      // Read configuration owns the filter model while it is on. Leaving the
      // column menus open would let a filter of the user's fight it, and the
      // data type filter below could be edited or deleted from the menu, which
      // fills the list with the empty rows it exists to hide. Only the menu
      // entries go: a model set here still filters.
      disableColumnFilter={readConfiguration}
      autoHeight={false}
      density="compact"
      rowHeight={ROW_HEIGHT}
      getRowHeight={getRowHeight}
      columnHeaderHeight={48}
      hideFooterPagination
      getRowClassName={(params) =>
        [
          (params.row as RegisterData).error ? 'register-error-row' : '',
          params.id === expandedBitmap ? 'bitmap-expanded-row' : ''
        ]
          .filter(Boolean)
          .join(' ')
      }
      editMode="cell"
      isCellEditable={({ colDef: { field }, row: { id } }) => {
        if (scanning) return false
        if (field === 'comment') return true
        const dataType = registerMapping[id]?.dataType ?? 'none'

        if (field === 'scalingFactor' && !scalableDataTypes.includes(dataType)) {
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
        // `getRowHeight` answers for the row and its panel together, and MUI
        // writes that height onto the row element itself, over anything passed
        // in its style. The panel is a sibling of the row inside the slot, so
        // without this it is counted twice and the slot comes out that much
        // too tall.
        '& .bitmap-expanded-row': {
          minHeight: `${COMPACT_ROW_HEIGHT}px !important`,
          maxHeight: `${COMPACT_ROW_HEIGHT}px !important`,
          '--height': `${COMPACT_ROW_HEIGHT}px !important`
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
      processRowUpdate={handleRowUpdate}
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
