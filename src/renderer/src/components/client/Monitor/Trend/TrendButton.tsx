import ShowChart from '@mui/icons-material/ShowChart'
import IconButton from '@mui/material/IconButton'
import { alpha } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { TREND_COLORS } from '@renderer/theme'
import { enqueueSnackbar } from 'notistack'
import { MouseEvent, useCallback } from 'react'
import { MonitorRegisterRow } from '../monitorRows'
import { trendKey, useTrendPopoverZustand } from './trendPopover.zustand'

/**
 * A Monitor row's Log icon, which adds that register to the trend, opening it
 * when it is closed. Lit while the trend draws it.
 */
const TrendButton = meme(
  ({ row, testId }: { row: MonitorRegisterRow; testId: string }): JSX.Element => {
    const uuid = useClientZustand((z) => z.selectedUuid)
    const key = trendKey({ uuid, unit: row.unit, type: row.type, address: row.address })
    const drawn = useTrendPopoverZustand((z) => z.entries.some((entry) => trendKey(entry) === key))

    // The grid, whose corner the trend opens in.
    const handleAdd = useCallback(
      (event: MouseEvent<HTMLElement>) => {
        const anchor =
          event.currentTarget.closest<HTMLElement>('.monitor-grid') ?? event.currentTarget
        const trendPopoverZustand = useTrendPopoverZustand.getState()
        const added = trendPopoverZustand.add(
          { uuid, unit: row.unit, type: row.type, address: row.address },
          anchor
        )
        if (!added)
          enqueueSnackbar({
            variant: 'info',
            message: `The trend draws ${TREND_COLORS.length} registers; take one out first`
          })
      },
      [uuid, row.unit, row.type, row.address]
    )

    return (
      <IconButton
        size="small"
        data-testid={testId}
        aria-label="Add to the trend"
        aria-pressed={drawn}
        title="Add to the trend"
        onClick={handleAdd}
        sx={(theme) => ({
          p: 0.25,
          color: 'success.main',
          ...(drawn && { background: alpha(theme.palette.success.main, 0.2) })
        })}
      >
        <ShowChart sx={{ fontSize: 16 }} />
      </IconButton>
    )
  }
)

export default TrendButton
