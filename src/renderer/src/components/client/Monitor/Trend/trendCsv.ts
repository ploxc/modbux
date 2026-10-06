import { csvField, csvTime } from '@renderer/components/client/Logging/ExportLog/logCsv'

/** A register's sample as the trend's CSV writes it: none for a failed read. */
export interface CsvSample {
  time: number
  value: number | undefined
}

/**
 * A column's heading: the register's address, its name and its engineering
 * unit in parentheses, leaving out a name it has none of and a unit it has
 * none of.
 */
export const csvHeader = (address: number, name: string | undefined, unit: string): string =>
  [String(address), name, unit === '' ? undefined : `(${unit})`]
    .filter((part) => part !== undefined && part !== '')
    .join(' ')

/**
 * The rows of a wide CSV: a time column, then a column per register in the
 * order given, and a row per moment any register took a sample, in time
 * order. A register with no sample at a moment, or a failed read there, has
 * an empty cell.
 */
export const trendCsvRows = (headers: string[], samplesPerColumn: CsvSample[][]): string[] => {
  const byTime = new Map<number, Map<number, number | undefined>>()
  for (const [column, samples] of samplesPerColumn.entries())
    for (const { time, value } of samples) {
      const row = byTime.get(time) ?? new Map<number, number | undefined>()
      row.set(column, value)
      byTime.set(time, row)
    }
  return [
    ['time', ...headers].map(csvField).join(','),
    ...[...byTime.entries()]
      .sort(([a], [b]) => a - b)
      .map(([time, row]) =>
        [
          csvTime(time),
          ...headers.map((_header, column) => {
            const value = row.get(column)
            return value === undefined ? '' : csvField(value)
          })
        ].join(',')
      )
  ]
}
