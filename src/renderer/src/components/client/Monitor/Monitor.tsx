import UnfoldLess from '@mui/icons-material/UnfoldLess'
import UnfoldMore from '@mui/icons-material/UnfoldMore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { DataGrid } from '@mui/x-data-grid/DataGrid'
import {
  GridColDef,
  GridRowClassNameParams,
  GridRowHeightParams,
  GridRowHeightReturnValue
} from '@mui/x-data-grid/models'
import { RawToggle } from '@renderer/components/client/ClientGrids/RegisterGrid/RegisterGridToolbar/RawButton'
import { ROW_HEIGHT } from '@renderer/components/client/ClientGrids/RegisterGrid/rowHeight'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useLiveZustand } from '@renderer/context/live.zustand'
import { isNumberRegister } from '@shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import LogCount from '@renderer/components/client/Logging/LogCount'
import TrendOpenButton from './Trend/TrendOpenButton'
import TrendPanel from './Trend/TrendPanel'
import { useTrendPanelZustand } from './Trend/trendPanel.zustand'
import GroupHead from './GroupHead'
import {
  AddressCell,
  CommentCell,
  DataTypeCell,
  HexCell,
  ValueCell,
  WriteCell
} from './MonitorCells'
import { useMonitorZustand } from './monitor.zustand'
import { MonitorRow, allGroupKeys, monitorRows } from './monitorRows'

/** A group's head is a little taller than the rows under it. */
const HEAD_HEIGHT = 36

const COLUMN_COUNT = 6

/**
 * The cells read the store themselves, so the columns never change. A head
 * spans every column and draws the group's head instead.
 */
const COLUMNS: GridColDef<MonitorRow>[] = [
  {
    field: 'address',
    headerName: 'Addr.',
    width: 84,
    sortable: false,
    colSpan: (_value, row) => (row.kind === 'head' ? COLUMN_COUNT : 1),
    renderCell: ({ row }) =>
      row.kind === 'head' ? <GroupHead row={row} /> : <AddressCell row={row} />
  },
  {
    field: 'dataType',
    headerName: 'Data type',
    width: 90,
    sortable: false,
    renderCell: ({ row }) => (row.kind === 'register' ? <DataTypeCell row={row} /> : null)
  },
  {
    field: 'value',
    headerName: 'Value',
    flex: 1,
    minWidth: 140,
    sortable: false,
    renderCell: ({ row }) => (row.kind === 'register' ? <ValueCell row={row} /> : null)
  },
  {
    field: 'hex',
    headerName: 'HEX',
    width: 60,
    sortable: false,
    renderCell: ({ row }) => (row.kind === 'register' ? <HexCell row={row} /> : null)
  },
  {
    field: 'comment',
    headerName: 'Comment',
    flex: 1.6,
    minWidth: 120,
    sortable: false,
    renderCell: ({ row }) => (row.kind === 'register' ? <CommentCell row={row} /> : null)
  },
  {
    field: 'write',
    headerName: '',
    width: 44,
    sortable: false,
    renderCell: ({ row }) => (row.kind === 'register' ? <WriteCell row={row} /> : null)
  }
]

const rowHeightOf = ({ model }: GridRowHeightParams): GridRowHeightReturnValue =>
  (model as MonitorRow).kind === 'head' ? HEAD_HEIGHT : null

const rowClassOf = ({ row }: GridRowClassNameParams<MonitorRow>): string =>
  row.kind === 'head' ? 'monitor-head-row' : ''

/**
 * Read configuration in one grid: every group of every unit of the client,
 * each under a head. While this is on screen a poll reads every group whose
 * Poll is on, folded or scrolled away.
 */
const Monitor = meme((): JSX.Element => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const units = useClientZustand((z) => z.clients[z.selectedUuid]?.units)
  const folded = useMonitorZustand((z) => z.folded)
  const rows = useMemo(() => (units ? monitorRows(units, folded) : []), [units, folded])
  // The grid's box, whose corner the trend opens in from the toolbar.
  const [body, setBody] = useState<HTMLDivElement | null>(null)
  // A bit has no raw value apart from the one it shows.
  const anyRegisters = rows.some((row) => isNumberRegister(row.type))

  useEffect(() => {
    useLiveZustand.getState().showMonitor(uuid)
    return (): void => useLiveZustand.getState().hideMonitor(uuid)
  }, [uuid])
  // The trend draws what Monitor's icons added, and goes with Monitor.
  useEffect(
    () => (): void => {
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.close()
    },
    []
  )

  const handleExpandAll = useCallback(() => {
    const monitorZustand = useMonitorZustand.getState()
    monitorZustand.unfoldAll()
  }, [])
  const handleCollapseAll = useCallback(() => {
    const { clients, selectedUuid } = useClientZustand.getState()
    const monitorZustand = useMonitorZustand.getState()
    monitorZustand.foldAll(allGroupKeys(clients[selectedUuid]?.units ?? []))
  }, [])

  return (
    <Box
      data-testid="monitor"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, flexShrink: 0 }}>
        <Button
          size="small"
          variant="text"
          color="inherit"
          startIcon={<UnfoldMore />}
          data-testid="monitor-expand-all-btn"
          onClick={handleExpandAll}
        >
          Expand all
        </Button>
        <Button
          size="small"
          variant="text"
          color="inherit"
          startIcon={<UnfoldLess />}
          data-testid="monitor-collapse-all-btn"
          onClick={handleCollapseAll}
        >
          Collapse all
        </Button>
        {anyRegisters && <RawToggle testId="monitor-raw-btn" />}
        <Box sx={{ flexGrow: 1 }} />
        <LogCount />
        {/* Once the grid's box is there to open the trend in. */}
        {body && <TrendOpenButton anchor={body} />}
      </Box>
      <Box ref={setBody} sx={{ flexGrow: 1, minHeight: 0 }}>
        {rows.length === 0 ? (
          <Typography
            data-testid="monitor-empty"
            variant="body2"
            sx={{ p: 2, color: 'text.secondary' }}
          >
            Nothing is configured yet. Give registers a data type, or bits a comment, in Debug.
          </Typography>
        ) : (
          <DataGrid
            className="monitor-grid"
            rows={rows}
            columns={COLUMNS}
            density="compact"
            rowHeight={ROW_HEIGHT}
            getRowHeight={rowHeightOf}
            getRowClassName={rowClassOf}
            disableColumnMenu
            disableColumnFilter
            disableRowSelectionOnClick
            hideFooter
            sx={{
              '& .MuiDataGrid-row': { fontFamily: 'monospace', fontSize: '0.95em' },
              '& .monitor-head-row': {
                bgcolor: 'background.paper',
                fontFamily: 'inherit'
              }
            }}
          />
        )}
      </Box>
      <TrendPanel />
    </Box>
  )
})

export default Monitor
