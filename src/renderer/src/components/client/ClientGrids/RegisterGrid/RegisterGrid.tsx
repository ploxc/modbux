import {
  SectionTypeContext,
  useSectionType
} from '@renderer/components/client/ClientGrids/sectionType'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {
  readsConfiguration,
  selectedUnit,
  useClientZustand
} from '@renderer/context/client.zustand'
import { DateTime } from 'luxon'
import { meme } from '@renderer/components/shared/inputs/meme'
import {
  useLiveZustand,
  dataOf,
  sectionOf,
  showMapping,
  skeletonOf
} from '@renderer/context/live.zustand'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useRegisterGridColumns from './columns'
import RegisterGridToolbar from './RegisterGridToolbar/RegisterGridToolbar'
import { atOrBelow, BREAKPOINTS } from '../breakpoints'
import { useGridApiRef } from '@mui/x-data-grid'
import { DataGrid } from '@mui/x-data-grid/DataGrid'
import { GridFooterContainer, GridPagination } from '@mui/x-data-grid/components'
import {
  GridFilterModel,
  GridLogicOperator,
  GridRowHeightParams,
  GridRowHeightReturnValue
} from '@mui/x-data-grid/models'
import {
  BITMAP_DATATYPE,
  DataTypeSchema,
  RegisterData,
  RegisterType,
  RegisterTypeSchema,
  scalableDataTypes
} from '@shared'
import z from 'zod'
import { alpha } from '@mui/material/styles'
import BitMapRow from './BitMapRow'
import { useBitMapZustand } from '@renderer/context/bitmap.zustand'
import { COMPACT_ROW_HEIGHT, ROW_HEIGHT } from './rowHeight'
import { filtersValues, skeletonRows } from './skeletonRows'

/** What the read rows answer while no value filter asks for them. */
const NO_ROWS: RegisterData[] = []
//
//
//
//
// Footer
/**
 * When the last read answered, and how long it took. A poll changes both, so
 * they render on their own rather than taking the pages beside them along.
 */
const FooterTime = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const time = useLiveZustand((z) => dataOf(z, selectedUuid).lastSuccessfulTransactionMillis)
  // The newest transaction that answered; the log keeps the newest first.
  const roundTrip = useLiveZustand(
    (z) =>
      dataOf(z, selectedUuid).transactions.find(({ errorMessage }) => errorMessage === undefined)
        ?.roundTripMillis
  )
  return (
    <Typography variant="caption" sx={{ opacity: 0.5, whiteSpace: 'nowrap' }}>
      <strong>
        {time ? (
          <>
            <span className="footer-date">{DateTime.fromMillis(time).toFormat('yyyy-MM-dd')} </span>
            {DateTime.fromMillis(time).toFormat('HH:mm:ss')}
          </>
        ) : (
          'n/a'
        )}
        {roundTrip !== undefined && <span className="footer-round-trip"> · {roundTrip} ms</span>}
      </strong>
    </Typography>
  )
})

const Footer = meme(() => (
  <GridFooterContainer
    sx={{
      px: 1.5,
      justifyContent: 'space-between',
      // The date goes where the head folds the read window under Read; the
      // pages go with the Poll label, and the time always stays.
      containerType: 'inline-size',
      [atOrBelow(BREAKPOINTS.readWindow)]: {
        '& .footer-date': { display: 'none' }
      },
      [atOrBelow(BREAKPOINTS.pages)]: {
        '& .MuiTablePagination-root': { display: 'none' }
      }
    }}
  >
    <FooterTime />
    <GridPagination />
  </GridFooterContainer>
))

//
//
//
//
// DataGrid
/**
 * The mapping fields an edited grid row carries, which the grid writes onto the
 * row beside its `RegisterData`. Each reads as nothing when it is not one, so
 * one bad field does not cost the others.
 */
const EditedRowSchema = z.object({
  dataType: DataTypeSchema.optional().catch(undefined),
  scalingFactor: z.number().optional().catch(undefined),
  comment: z.string().optional().catch(undefined),
  groupEnd: z.boolean().optional().catch(undefined)
})

const RegisterGridContent = meme((): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const unit = useClientZustand((z) => selectedUnit(z).uuid)
  const type = useSectionType()
  // The rows the grid is handed carry no values, so a poll that changes one
  // value renders the cells showing it and not every row on screen. A filter on
  // a value needs the values in the rows, and gets the rows as read.
  const [valueFiltered, setValueFiltered] = useState(false)
  const skeleton = useLiveZustand((z) =>
    skeletonOf(sectionOf(z, selectedUuid, unit, type).registerData)
  )
  const skeletonRowList = useMemo(() => skeletonRows(skeleton), [skeleton])
  const readRows = useLiveZustand((z) =>
    valueFiltered ? sectionOf(z, selectedUuid, unit, type).registerData : NO_ROWS
  )
  const rows = valueFiltered ? readRows : skeletonRowList
  const handleFilterModelChange = useCallback((model: GridFilterModel) => {
    setValueFiltered(filtersValues(model))
  }, [])
  const registerMapping = useClientZustand((z) => selectedUnit(z).registerMapping[type])
  const columns = useRegisterGridColumns()

  const apiRef = useGridApiRef()

  // When we read all configured registers, we hide the rows with undefined data type
  // So no empty rows are shown so all rows have a value to display.
  const readConfiguration = useClientZustand((z) => readsConfiguration(z))

  // While a scan fills the grid, the rows are there to watch, not to work on:
  // a cell put into edit mode or a column menu opened over data that is still
  // arriving is a fight nobody wins. Scrolling and paging stay.
  const scanning = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)

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

  // The unit the switch was last seen on, so turning it off clears the unit it
  // was on, and moving to another unit clears nothing.
  const previous = useRef({ readConfiguration, unit })
  useEffect(() => {
    const filterModel: GridFilterModel = {
      items: [{ id: 1, field: 'dataType', operator: 'not', value: 'none' }],
      logicOperator: GridLogicOperator.And
    }
    if (readConfiguration) {
      // Each type keeps its rows, so a type a poll already filled keeps them.
      const { registerData } = sectionOf(useLiveZustand.getState(), selectedUuid, unit, type)
      if (registerData.length === 0) showMapping(selectedUuid, unit, type)
      apiRef.current?.setFilterModel(filterModel)
    } else {
      // Only clear data when transitioning from ON to OFF, not on initial mount
      if (previous.current.readConfiguration && previous.current.unit === unit) {
        for (const each of RegisterTypeSchema.options) {
          useLiveZustand.getState().setRegisterData(selectedUuid, unit, each, [])
        }
      }
      apiRef.current?.setFilterModel({ items: [] })
    }
    previous.current = { readConfiguration, unit }
  }, [apiRef, readConfiguration, selectedUuid, unit, type])

  const handleRowUpdate = useCallback(
    (newRow: RegisterData, oldRow: RegisterData): RegisterData => {
      const clientZustand = useClientZustand.getState()
      const edited = EditedRowSchema.parse(newRow)
      const before = EditedRowSchema.parse(oldRow)

      // Update datatype
      if (edited.dataType && edited.dataType !== before.dataType) {
        clientZustand.setRegisterMapping(newRow.id, 'dataType', edited.dataType)
      }

      // Update scaling factor
      // This will ignore zero too, if you don't want to ignore zero compare with undefined
      if (edited.scalingFactor && edited.scalingFactor !== before.scalingFactor) {
        clientZustand.setRegisterMapping(newRow.id, 'scalingFactor', edited.scalingFactor)
      }

      // Update comment
      if (typeof edited.comment === 'string' && edited.comment !== before.comment) {
        clientZustand.setRegisterMapping(newRow.id, 'comment', edited.comment)
      }

      // Update group end
      if (typeof edited.groupEnd === 'boolean' && edited.groupEnd !== before.groupEnd) {
        clientZustand.setRegisterMapping(newRow.id, 'groupEnd', edited.groupEnd)
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
      rows={rows}
      onFilterModelChange={handleFilterModelChange}
      columns={columns}
      // Read configuration owns the filter model while it is on. Leaving the
      // column menus open would let a filter of the user's fight it, and the
      // data type filter below could be edited or deleted from the menu, which
      // fills the list with the empty rows it exists to hide. Only the menu
      // entries go: a model set here still filters.
      disableColumnFilter={readConfiguration}
      autoHeight={false}
      density="compact"
      columnHeaderHeight={48}
      rowHeight={ROW_HEIGHT}
      getRowHeight={getRowHeight}
      hideFooterPagination
      getRowClassName={(params) => (params.id === expandedBitmap ? 'bitmap-expanded-row' : '')}
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
// One section: a register type of the unit on screen
interface RegisterGridProps {
  type: RegisterType
}

/**
 * The grid of one register type. Everything drawn inside reads its type from
 * the section, and a press or a focus inside makes it the type the view acts
 * on, so Read, a write and the fields of this section reach this type with two
 * on screen.
 */
const RegisterGrid = meme(({ type }: RegisterGridProps): JSX.Element => {
  const handleUse = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    clientZustand.focusType(type)
  }, [type])

  return (
    <SectionTypeContext.Provider value={type}>
      <Box
        data-testid={`section-grid-${type}`}
        onPointerDownCapture={handleUse}
        onFocusCapture={handleUse}
        sx={{ height: '100%', minHeight: 0 }}
      >
        <RegisterGridContent />
      </Box>
    </SectionTypeContext.Provider>
  )
})

export default RegisterGrid
