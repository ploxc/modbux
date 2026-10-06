import { clientAddress } from '@renderer/components/client/ClientSidebar/clientStatus'
import { csvAbout, csvTime } from '@renderer/components/client/Logging/ExportLog/logCsv'
import { downloadText } from '@renderer/components/shared/downloadText'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import snakeCase from 'lodash/snakeCase'
import { DateTime } from 'luxon'
import { csvHeader, CsvSample, trendCsvRows } from './trendCsv'
import { trendKey, TrendStretch, useTrendPanelZustand } from './trendPanel.zustand'
import { addressOf, convertOf, isLane, mapValueOf } from './trendRegister'
import { logSamples } from './useSelectionSamples'

/**
 * Hands over a wide CSV of `stretch` of the trend's log: a time column and a
 * column per register the trend shows, in its order, each sample converted as
 * the grid converts it, a bit as 0 or 1 and a bitmap as its word. It starts
 * with the lines the log's export starts with, the stretch added to the second.
 */
export const exportTrendCsv = async (stretch: TrendStretch): Promise<void> => {
  const { uuid, entries, name } = useTrendPanelZustand.getState()
  const client = useClientZustand.getState().clients[uuid]
  const units = client?.units ?? []
  const shown = entries.filter(({ hidden }) => hidden !== true)
  const samples = await logSamples(uuid, shown, stretch, () => false)
  const columns = shown.map((entry) => {
    const mapValue = mapValueOf(units, entry)
    const convert = isLane(entry, mapValue)
      ? (raw: number): number => raw
      : convertOf(entry, mapValue)
    return {
      header: csvHeader(addressOf(units, entry), mapValue?.comment, mapValue?.unit ?? ''),
      samples: (samples[trendKey(entry)] ?? []).map(
        ({ time, value, error }): CsvSample => ({
          time,
          value: error === undefined ? convert(value) : undefined
        })
      )
    }
  })
  const status = dataOf(useLiveZustand.getState(), uuid).clientState.log
  const [title, complete] = csvAbout(
    client?.name ?? '',
    client === undefined ? '' : clientAddress(client.connectionConfig),
    status
  )
  const lines = [
    title,
    `${complete}; the trend from ${csvTime(stretch.from)} to ${csvTime(stretch.to)}`,
    ...trendCsvRows(
      columns.map(({ header }) => header),
      columns.map((column) => column.samples)
    )
  ]
  const stamp = DateTime.now().toFormat('yyyyMMdd_HHmmss')
  downloadText(
    `modbux_trend_${snakeCase(name ?? '') || 'trend'}_${stamp}.csv`,
    [lines.join('\n')],
    'text/csv'
  )
}
