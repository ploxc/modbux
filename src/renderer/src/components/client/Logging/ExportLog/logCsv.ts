import { applyConversion } from '@renderer/components/client/ClientGrids/RegisterGrid/columns/convertedValue'
import { ClientUnit, isNumberRegister, LogSample, LogStatus } from '@shared'
import { DateTime } from 'luxon'

/** A time as the export writes it, to the millisecond, in the machine's zone. */
const csvTime = (millis: number): string =>
  DateTime.fromMillis(millis).toFormat('yyyy-MM-dd HH:mm:ss.SSS')

/** A field, quoted when it holds a comma, a quote or a line break. */
export const csvField = (value: string | number): string => {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const COLUMNS = [
  'time',
  'unit_id',
  'unit',
  'register_type',
  'address',
  'name',
  'raw',
  'value',
  'engineering_unit',
  'status'
]

/**
 * The lines a CSV starts with: what it came from, from when the log is
 * complete and how many samples before that were overwritten, and the column
 * names. The file says all of it itself, so it needs no uuid to stay readable.
 */
export const csvHead = (clientName: string, clientAddress: string, status: LogStatus): string[] => [
  `# Modbux log of ${clientName || 'Unnamed client'}, ${clientAddress}`,
  `# Complete from ${status.oldest === undefined ? '-' : csvTime(status.oldest)}; ${status.overwritten} samples before it were overwritten`,
  COLUMNS.join(',')
]

/**
 * One line per sample: the raw value the log holds, and the value as the
 * register's conversion makes it now. A read that failed has neither, and
 * says why in its status.
 */
export const csvLine = (sample: LogSample, unit: ClientUnit | undefined): string => {
  const mapValue = unit?.registerMapping[sample.type][sample.address]
  const failed = sample.error !== undefined
  // A bit has no conversion, and a script that fails leaves the value empty.
  const converted = isNumberRegister(sample.type)
    ? applyConversion(String(sample.value), mapValue?.dataType, mapValue?.conversion)
    : sample.value
  const value = !failed && typeof converted === 'number' ? converted : ''
  return [
    csvTime(sample.time),
    unit?.unitId ?? '',
    unit?.name ?? '',
    sample.type,
    sample.address + Number(unit?.addressBase ?? '0'),
    mapValue?.comment ?? '',
    failed ? '' : sample.value,
    value,
    mapValue?.unit ?? '',
    sample.error ?? 'ok'
  ]
    .map(csvField)
    .join(',')
}
