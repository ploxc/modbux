import { describe, expect, it } from 'vitest'
import { newClientUnit } from '@shared'
import type { ClientUnit } from '@shared'
import { allGroupKeys, groupKey, monitorRows } from '../monitorRows'

const unit = (uuid: string, unitId: number, change: (unit: ClientUnit) => void): ClientUnit => {
  const made = newClientUnit(uuid, unitId)
  change(made)
  return made
}

const inverter = unit('u1', 1, ({ registerMapping }) => {
  registerMapping.holding_registers = {
    0: { dataType: 'uint16' },
    2: { dataType: 'float' },
    5: { comment: 'no data type' },
    300: { dataType: 'int16' }
  }
  registerMapping.coils = { 4: { comment: 'Pump' } }
})
const meter = unit('u2', 2, ({ registerMapping }) => {
  registerMapping.input_registers = { 10: { dataType: 'uint32' } }
})

const shape = (rows: ReturnType<typeof monitorRows>): string[] =>
  rows.map((row) =>
    row.kind === 'head' ? `${row.unit} ${row.type} [${row.group.join(',')}]` : `  ${row.address}`
  )

describe('the rows Monitor draws', () => {
  it('lists each unit in turn, holding before input before coils, each group under its head', () => {
    expect(shape(monitorRows([inverter, meter], {}))).toEqual([
      'u1 holding_registers [0,4]',
      '  0',
      '  2',
      'u1 holding_registers [300,1]',
      '  300',
      'u1 coils [4,1]',
      '  4',
      'u2 input_registers [10,2]',
      '  10'
    ])
  })

  it('keeps the head of a folded group and leaves out its addresses', () => {
    const folded = { [groupKey('u1', 'holding_registers', [0, 4])]: true as const }

    expect(shape(monitorRows([inverter], folded)).slice(0, 3)).toEqual([
      'u1 holding_registers [0,4]',
      'u1 holding_registers [300,1]',
      '  300'
    ])
  })

  it('names every group for Collapse all', () => {
    expect(allGroupKeys([inverter, meter])).toEqual([
      'u1|holding_registers|0|4',
      'u1|holding_registers|300|1',
      'u1|coils|4|1',
      'u2|input_registers|10|2'
    ])
  })
})
