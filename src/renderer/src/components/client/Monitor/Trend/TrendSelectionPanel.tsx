import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { formatDuration } from '@renderer/components/client/Logging/format'
import { meme } from '@renderer/components/shared/inputs/meme'
import { textMuted } from '@renderer/theme'
import { useCallback } from 'react'
import { figure, selectionLabel } from './trendData'
import { DrawnEntry, TrendStretch, useTrendPanelZustand } from './trendPanel.zustand'
import { laneStats, lineStats } from './trendStats'
import { useSelectionSamples } from './useSelectionSamples'

/** A register as the statistics name it, and how its samples are read. */
export interface SelectionRegister {
  key: string
  /** The row's test id: `trend-selection-row-<type>-<address>`. */
  testId: string
  label: string
  color: string
  unit: string
  hidden: boolean
  /** A line's raw value converted as the grid converts it; none for a bit or a bitmap. */
  convert: ((raw: number) => number | undefined) | undefined
}

interface TrendSelectionPanelProps {
  uuid: string
  entries: DrawnEntry[]
  /** The registers of `entries`, in their order. */
  registers: SelectionRegister[]
  selection: TrendStretch
  runEnds: number[]
  /** Zoom to range asks for the selected stretch. */
  onZoom: (from: number, to: number) => void
}

const COLUMNS = ['Avg', 'Min', 'Max', 'Median', 'Last', 'Δ', 'n'] as const

/** The cells of a line's row between its name and its n, which a lane's one cell spans. */
const LINE_FIELDS = ['avg', 'min', 'max', 'median', 'last', 'delta'] as const

const CELL_SX = { px: 0.5, py: 0.375, textAlign: 'right', fontWeight: 400 } as const

/** A change with its sign, as Δ writes it. */
const signed = (value: number): string => `${value > 0 ? '+' : ''}${figure(value)}`

/** A lane's numbers as its one cell writes them. */
const laneText = (share: number, switches: number, last: boolean): string =>
  `on ${Math.round(share * 100)} % of the stretch · switched ${switches} ${switches === 1 ? 'time' : 'times'} · last ${last ? 'on' : 'off'}`

/**
 * The stretch dragged across the plots, how long it is, and what each
 * register did in it, read from the log itself: a line's mean, lowest,
 * highest, median, last value, change and sample count, and the share of the
 * stretch a bit or a bitmap was on, how often it switched and its last state.
 * Zoom to range zooms to the stretch, and Clear lets it go.
 */
const TrendSelectionPanel = meme(
  ({
    uuid,
    entries,
    registers,
    selection,
    runEnds,
    onZoom
  }: TrendSelectionPanelProps): JSX.Element => {
    const samples = useSelectionSamples(uuid, entries, selection)
    const handleZoom = useCallback(() => onZoom(selection.from, selection.to), [selection, onZoom])
    const handleClear = useCallback(() => {
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.setSelection(undefined)
    }, [])

    return (
      <Box
        data-testid="trend-selection"
        sx={{
          flexShrink: 0,
          mx: 1.75,
          pt: 1,
          borderTop: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            component="span"
            data-testid="trend-selection-stretch"
            sx={{ fontFamily: 'monospace', fontSize: 12 }}
          >
            {selectionLabel(selection.from, selection.to)}
          </Box>
          <Box component="span" sx={{ fontSize: 12, color: textMuted }}>
            {formatDuration(selection.to - selection.from)}
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            data-testid="trend-selection-zoom-btn"
            onClick={handleZoom}
            sx={{ textTransform: 'none', fontSize: 12, py: 0.125 }}
          >
            Zoom to range
          </Button>
          <Button
            size="small"
            color="inherit"
            data-testid="trend-selection-clear-btn"
            onClick={handleClear}
            sx={{ textTransform: 'none', fontSize: 12, py: 0.125, color: 'text.secondary' }}
          >
            Clear
          </Button>
        </Box>
        <Box component="table" sx={{ borderCollapse: 'collapse', fontSize: 11.5, width: '100%' }}>
          <thead>
            <Box component="tr" sx={{ color: textMuted }}>
              <Box component="th" sx={[CELL_SX, { textAlign: 'left' }]}>
                Register
              </Box>
              {COLUMNS.map((column) => (
                <Box component="th" key={column} sx={CELL_SX}>
                  {column}
                </Box>
              ))}
            </Box>
          </thead>
          <Box component="tbody" sx={{ fontFamily: 'monospace' }}>
            {registers.map((register) => {
              const points = samples?.[register.key] ?? []
              const { convert } = register
              // A failed read, or a value its conversion gives no number for, counts in nothing.
              const line =
                convert === undefined
                  ? undefined
                  : lineStats(
                      points.flatMap(({ time, value, error }) => {
                        const converted = error === undefined ? convert(value) : undefined
                        return converted === undefined ? [] : [{ time, value: converted }]
                      })
                    )
              // A bitmap's word is on while it is not 0, as its lane is lit.
              const lane =
                convert === undefined
                  ? laneStats(points, runEnds, (value) => value !== 0, selection.from, selection.to)
                  : undefined
              const cells: { field: string; text: string }[] =
                line === undefined
                  ? LINE_FIELDS.map((field) => ({ field, text: '–' }))
                  : [
                      {
                        field: 'avg',
                        text:
                          register.unit === ''
                            ? figure(line.avg)
                            : `${figure(line.avg)} ${register.unit}`
                      },
                      { field: 'min', text: figure(line.min) },
                      { field: 'max', text: figure(line.max) },
                      { field: 'median', text: figure(line.median) },
                      { field: 'last', text: figure(line.last) },
                      { field: 'delta', text: signed(line.delta) }
                    ]
              return (
                <Box
                  component="tr"
                  key={register.key}
                  data-testid={register.testId}
                  data-hidden={register.hidden}
                  sx={{
                    borderTop: 1,
                    borderColor: 'divider',
                    color: register.hidden ? 'text.disabled' : 'text.primary'
                  }}
                >
                  <Box
                    component="td"
                    sx={[CELL_SX, { textAlign: 'left', fontFamily: 'body1.fontFamily' }]}
                  >
                    <Box
                      component="span"
                      sx={{ color: register.color, opacity: register.hidden ? 0.5 : 1, mr: 0.75 }}
                    >
                      ■
                    </Box>
                    {register.label}
                  </Box>
                  {convert === undefined ? (
                    <Box
                      component="td"
                      colSpan={LINE_FIELDS.length}
                      data-field="lane"
                      sx={[CELL_SX, { textAlign: 'left' }]}
                    >
                      {lane === undefined ? '–' : laneText(lane.share, lane.switches, lane.last)}
                    </Box>
                  ) : (
                    cells.map(({ field, text }) => (
                      <Box component="td" key={field} data-field={field} sx={CELL_SX}>
                        {text}
                      </Box>
                    ))
                  )}
                  <Box component="td" data-field="n" sx={CELL_SX}>
                    {(line ?? lane)?.n ?? '–'}
                  </Box>
                </Box>
              )
            })}
          </Box>
        </Box>
      </Box>
    )
  }
)

export default TrendSelectionPanel
