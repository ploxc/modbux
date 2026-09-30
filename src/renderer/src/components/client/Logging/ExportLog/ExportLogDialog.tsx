import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Typography from '@mui/material/Typography'
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { RichTreeView } from '@mui/x-tree-view/RichTreeView'
import { clientAddress } from '@renderer/components/client/ClientSidebar/clientStatus'
import DialogHeading from '@renderer/components/shared/DialogHeading'
import { downloadText } from '@renderer/components/shared/downloadText'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { textMuted } from '@renderer/theme'
import { ClientUnit, LogSeries } from '@shared'
import { snakeCase } from 'lodash'
import { DateTime } from 'luxon'
import { SyntheticEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { exportTree, exportTreeIds, seriesId } from './exportTree'
import { csvHead, csvLine } from './logCsv'

/** How many samples one request asks main for. */
const PAGE = 20_000

const NO_UNITS: ClientUnit[] = []

/**
 * A CSV of the log: every sample of the registers ticked in the tree, between
 * From and To when they are set. The tree lists what main's log holds, which
 * includes a register that no longer logs. Main hands the samples over in
 * pages, and each is converted here with the register's conversion as it is
 * now.
 */
const ExportLogDialog = meme(({ onClose }: { onClose: () => void }): JSX.Element => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const name = useClientZustand((z) => z.clients[z.selectedUuid]?.name ?? '')
  const units = useClientZustand((z) => z.clients[z.selectedUuid]?.units ?? NO_UNITS)
  const oldest = useLiveZustand((z) => dataOf(z, uuid).clientState.log.oldest)

  const address = useClientZustand((z) => {
    const config = z.clients[z.selectedUuid]?.connectionConfig
    return config && clientAddress(config)
  })

  const [held, setHeld] = useState<LogSeries[]>()
  const [selected, setSelected] = useState<string[]>([])
  // The tree opens with every unit showing its registers, all of them ticked.
  useEffect(() => {
    let cancelled = false
    void window.api.getLogSeries(uuid).then((series) => {
      if (cancelled) return
      const answer = series ?? []
      setHeld(answer)
      setSelected(exportTreeIds(answer))
    })
    return (): void => {
      cancelled = true
    }
  }, [uuid])

  const tree = useMemo(() => exportTree(name, units, held ?? []), [name, units, held])
  const branchIds = useMemo(() => [tree.id, ...tree.children.map((unit) => unit.id)], [tree])
  const [from, setFrom] = useState<DateTime | null>(null)
  const [to, setTo] = useState<DateTime | null>(null)
  const [exporting, setExporting] = useState(false)

  const chosen = (held ?? []).filter((series) => selected.includes(seriesId(series)))

  const handleSelected = useCallback((_event: SyntheticEvent | null, ids: string[]) => {
    setSelected(ids)
  }, [])

  const handleExport = useCallback(async () => {
    setExporting(true)
    const status = dataOf(useLiveZustand.getState(), uuid).clientState.log
    const unitsByUuid = new Map(units.map((unit) => [unit.uuid, unit]))
    const lines = csvHead(name, address ?? '', status)
    let after: number | undefined = 0
    while (after !== undefined) {
      const page = await window.api.getLogPage({
        uuid,
        after,
        limit: PAGE,
        from: from?.toMillis(),
        to: to?.toMillis(),
        series: chosen
      })
      if (!page) break
      for (const sample of page.samples) lines.push(csvLine(sample, unitsByUuid.get(sample.unit)))
      after = page.next
    }
    const stamp = DateTime.now().toFormat('yyyyMMdd_HHmmss')
    downloadText(
      `modbux_log_${snakeCase(name) || 'client'}_${stamp}.csv`,
      [lines.join('\n')],
      'text/csv'
    )
    setExporting(false)
    onClose()
  }, [uuid, name, address, units, from, to, chosen, onClose])

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogHeading icon={<FileDownloadOutlined />} tone="success">
        Export the log
      </DialogHeading>
      <DialogContent>
        <LocalizationProvider dateAdapter={AdapterLuxon}>
          <Typography sx={{ fontSize: 12, color: textMuted }}>
            Range, the whole log unless narrowed
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.25, pt: 0.75 }}>
            <DateTimePicker
              label="From"
              value={from}
              onChange={setFrom}
              ampm={false}
              minDateTime={oldest === undefined ? undefined : DateTime.fromMillis(oldest)}
              slotProps={{
                textField: {
                  size: 'medium',
                  slotProps: { htmlInput: { 'data-testid': 'log-export-from-input' } }
                },
                field: { clearable: true }
              }}
            />
            <DateTimePicker
              label="To"
              value={to}
              onChange={setTo}
              ampm={false}
              slotProps={{
                textField: {
                  size: 'medium',
                  slotProps: { htmlInput: { 'data-testid': 'log-export-to-input' } }
                },
                field: { clearable: true }
              }}
            />
          </Box>
        </LocalizationProvider>
        <Typography sx={{ fontSize: 12, color: textMuted }}>Registers</Typography>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, py: 0.5 }}>
          {held && (
            <RichTreeView
              data-testid="log-export-tree"
              items={[tree]}
              multiSelect
              checkboxSelection
              selectionPropagation={{ parents: true, descendants: true }}
              selectedItems={selected}
              onSelectedItemsChange={handleSelected}
              defaultExpandedItems={branchIds}
            />
          )}
        </Box>
        <Typography sx={{ fontSize: 12, lineHeight: 1.5, color: textMuted }}>
          One row per sample: time, unit, address, name, raw, converted, unit of measure, status.
          The head names the client and says from when the log is complete.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button data-testid="log-export-cancel-btn" variant="text" onClick={onClose}>
          Cancel
        </Button>
        <Button
          data-testid="log-export-btn"
          disabled={chosen.length === 0 || exporting}
          onClick={handleExport}
        >
          {exporting ? 'Exporting…' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  )
})

export default ExportLogDialog
