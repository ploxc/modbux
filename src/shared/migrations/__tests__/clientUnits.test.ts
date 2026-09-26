import { describe, expect, it } from 'vitest'
import { foldClientIntoUnits } from '../client/zustand'
import { ClientUnitSchema, defaultSection } from '@shared'

// A client from before units read one register type, with one unit id and one
// byte order, and held one mapping. All of it goes into one unit, and the type
// it read is the one section a poll reads.

const clientBeforeUnits = (): Record<string, unknown> => ({
  name: 'Meter',
  connectionConfig: {
    protocol: 'ModbusTcp',
    unitId: 7,
    tcp: { host: '10.0.0.2', options: { port: 502 } }
  },
  registerConfig: {
    type: 'input_registers',
    address: 30,
    length: 6,
    pollRate: 2000,
    timeout: 3000,
    littleEndian: true,
    addressBase: '1',
    advancedMode: true
  },
  registerMapping: {
    coils: {},
    discrete_inputs: {},
    input_registers: { '30': { dataType: 'uint16', comment: 'Voltage L1' } },
    holding_registers: {}
  }
})

describe('a client from before units', () => {
  it('becomes one unit with its unit id, byte order, base and mapping', () => {
    const client = clientBeforeUnits()
    foldClientIntoUnits(client, () => 'unit-1')

    const units = client.units as unknown[]
    expect(units).toHaveLength(1)
    const unit = ClientUnitSchema.parse(units[0])
    expect(unit.uuid).toBe('unit-1')
    expect(unit.unitId).toBe(7)
    expect(unit.littleEndian).toBe(true)
    expect(unit.addressBase).toBe('1')
    expect(unit.registerMapping.input_registers[30]?.comment).toBe('Voltage L1')
  })

  it('polls the type it read, from its address and length, and no other', () => {
    const client = clientBeforeUnits()
    foldClientIntoUnits(client, () => 'unit-1')

    const unit = ClientUnitSchema.parse((client.units as unknown[])[0])
    expect(unit.sections.input_registers).toEqual({ address: 30, length: 6, polled: true })
    expect(unit.sections.holding_registers).toEqual(defaultSection())
    expect(unit.sections.coils.polled).toBe(false)
  })

  it('leaves the timing and the view on the client, and the unit fields nowhere else', () => {
    const client = clientBeforeUnits()
    foldClientIntoUnits(client, () => 'unit-1')

    expect(client.registerConfig).toEqual({ pollRate: 2000, timeout: 3000, advancedMode: true })
    expect(client.connectionConfig).not.toHaveProperty('unitId')
    expect(client).not.toHaveProperty('registerMapping')
  })

  it('leaves a client that already holds units as it is', () => {
    const client = { units: [{ uuid: 'kept' }], registerMapping: 'untouched' }
    foldClientIntoUnits(client, () => 'unit-1')

    expect(client).toEqual({ units: [{ uuid: 'kept' }], registerMapping: 'untouched' })
  })
})
