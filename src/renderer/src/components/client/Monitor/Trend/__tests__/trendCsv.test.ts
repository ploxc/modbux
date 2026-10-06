// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

// logCsv converts as the grid does, whose module reaches the client store,
// which calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { csvTime } from '@renderer/components/client/Logging/ExportLog/logCsv'
import { csvHeader, trendCsvRows } from '../trendCsv'

describe('csvHeader', () => {
  it('heads a column with the address, the name and the unit', () => {
    expect(csvHeader(8, 'Voltage setpoint', 'V')).toBe('8 Voltage setpoint (V)')
  })

  it('leaves out a unit, and a name, the register has none of', () => {
    expect(csvHeader(3, 'Pump', '')).toBe('3 Pump')
    expect(csvHeader(3, undefined, 'kW')).toBe('3 (kW)')
    expect(csvHeader(3, '', '')).toBe('3')
  })
})

describe('trendCsvRows', () => {
  it('writes a row per moment any register took a sample, in time order', () => {
    expect(
      trendCsvRows(
        ['0 Voltage (V)', '1 Current (A)'],
        [
          [
            { time: 2000, value: 230 },
            { time: 1000, value: 229 }
          ],
          [
            { time: 1000, value: 4.5 },
            { time: 1500, value: 4.6 }
          ]
        ]
      )
    ).toEqual([
      'time,0 Voltage (V),1 Current (A)',
      `${csvTime(1000)},229,4.5`,
      `${csvTime(1500)},,4.6`,
      `${csvTime(2000)},230,`
    ])
  })

  it('leaves a failed read empty, and writes a coil as 0 or 1', () => {
    expect(
      trendCsvRows(
        ['5 Temperature (°C)', '0 Pump'],
        [
          [{ time: 1000, value: undefined }],
          [
            { time: 1000, value: 1 },
            { time: 2000, value: 0 }
          ]
        ]
      )
    ).toEqual(['time,5 Temperature (°C),0 Pump', `${csvTime(1000)},,1`, `${csvTime(2000)},,0`])
  })

  it('quotes a heading with a comma in it', () => {
    expect(trendCsvRows(['0 Pump, left'], [[]])).toEqual(['time,"0 Pump, left"'])
  })
})
