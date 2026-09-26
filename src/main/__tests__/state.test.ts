import { describe, it, expect, beforeEach } from 'vitest'
import { AppState, withoutUndefined } from '../state'
import {
  ClientUnit,
  ConnectionConfigSchema,
  defaultConnectionConfig,
  defaultRegisterConfig,
  newClientUnit
} from '@shared'

describe('withoutUndefined', () => {
  it('drops a key set to undefined and keeps the rest', () => {
    expect(withoutUndefined({ a: 1, b: undefined })).toEqual({ a: 1 })
  })

  it('drops one nested two deep', () => {
    expect(withoutUndefined({ a: { b: { c: undefined, d: 2 } } })).toEqual({ a: { b: { d: 2 } } })
  })

  it('hands an array back as an array', () => {
    // Recursing would return the indices as an object, and deepmerge would
    // never see an array again.
    expect(withoutUndefined({ a: [1, 2] }).a).toEqual([1, 2])
    expect(Array.isArray(withoutUndefined({ a: [1, 2] }).a)).toBe(true)
  })

  it('leaves null alone', () => {
    expect(withoutUndefined({ a: null })).toEqual({ a: null })
  })
})

const mapped = (uuid: string): ClientUnit => ({
  ...newClientUnit(uuid, 1),
  registerMapping: {
    coils: {},
    discrete_inputs: {},
    input_registers: {},
    holding_registers: { 0: { dataType: 'int16', scalingFactor: 1 } }
  }
})

describe('AppState', () => {
  let state: AppState

  beforeEach(() => {
    state = new AppState()
  })

  describe('initial state', () => {
    it('has default connection config', () => {
      expect(state.connectionConfig).toEqual(defaultConnectionConfig)
    })

    it('has default register config', () => {
      expect(state.registerConfig).toEqual(defaultRegisterConfig)
    })

    it('has no units initially', () => {
      expect(state.units).toEqual([])
    })

    // Every nested object, because a spread would copy the top level and leave
    // `tcp.options` shared. What writing into a shared one costs is in
    // `modbusClient.test.ts`, where modbus-serial does it.
    it('does not share the exported defaults', () => {
      expect(state.connectionConfig).not.toBe(defaultConnectionConfig)
      expect(state.connectionConfig.tcp).not.toBe(defaultConnectionConfig.tcp)
      expect(state.connectionConfig.tcp.options).not.toBe(defaultConnectionConfig.tcp.options)
      expect(state.connectionConfig.rtu.options).not.toBe(defaultConnectionConfig.rtu.options)
      expect(state.registerConfig).not.toBe(defaultRegisterConfig)
    })
  })

  describe('updateConnectionConfig', () => {
    it('deep merges partial TCP config', () => {
      state.updateConnectionConfig({ tcp: { host: '10.0.0.1' } })
      expect(state.connectionConfig.tcp.host).toBe('10.0.0.1')
      // Port should still be the default
      expect(state.connectionConfig.tcp.options.port).toBe(502)
    })

    it('deep merges partial RTU config', () => {
      state.updateConnectionConfig({ rtu: { options: { baudRate: '19200' } } })
      expect(state.connectionConfig.rtu.options.baudRate).toBe('19200')
      // COM port should still be the default
      expect(state.connectionConfig.rtu.com).toBe('COM3')
    })

    it('updates protocol', () => {
      state.updateConnectionConfig({ protocol: 'ModbusRtu' })
      expect(state.connectionConfig.protocol).toBe('ModbusRtu')
    })

    it('preserves unmodified fields after multiple updates', () => {
      state.updateConnectionConfig({ tcp: { options: { port: 5020 } } })
      state.updateConnectionConfig({ tcp: { host: '192.168.0.1' } })
      expect(state.connectionConfig.tcp.options.port).toBe(5020)
      expect(state.connectionConfig.tcp.host).toBe('192.168.0.1')
      expect(state.connectionConfig.protocol).toBe('ModbusTcp')
    })
  })

  // What a payload carrying an explicit `undefined` does. Zod's deepPartial
  // keeps the key and structured clone carries it over IPC, so the merge is
  // what has to drop it rather than copy it over the stored value. The last
  // case separates dropping the key from dropping the whole update.
  describe('updateConnectionConfig with an undefined field', () => {
    it('keeps the stored host', () => {
      state.updateConnectionConfig({ tcp: { host: '10.0.0.1' } })
      state.updateConnectionConfig({ tcp: { host: undefined } })

      expect(state.connectionConfig.tcp.host).toBe('10.0.0.1')
    })

    it('leaves a config the schema still accepts', () => {
      state.updateConnectionConfig({ tcp: { host: undefined } })

      expect(ConnectionConfigSchema.safeParse(state.connectionConfig).success).toBe(true)
    })

    it('keeps a nested option the payload leaves undefined', () => {
      state.updateConnectionConfig({ rtu: { options: { parity: undefined } } })

      expect(state.connectionConfig.rtu.options.parity).toBe(
        defaultConnectionConfig.rtu.options.parity
      )
    })

    it('still writes the fields that carry a value', () => {
      state.updateConnectionConfig({ protocol: undefined, tcp: { host: '10.0.0.2' } })

      expect(state.connectionConfig.tcp.host).toBe('10.0.0.2')
      expect(state.connectionConfig.protocol).toBe(defaultConnectionConfig.protocol)
    })
  })

  describe('updateRegisterConfig', () => {
    it('deep merges partial register config', () => {
      state.updateRegisterConfig({ timeout: 3000 })
      expect(state.registerConfig.timeout).toBe(3000)
      expect(state.registerConfig.pollRate).toBe(defaultRegisterConfig.pollRate)
    })

    it('updates poll rate', () => {
      state.updateRegisterConfig({ pollRate: 5000 })
      expect(state.registerConfig.pollRate).toBe(5000)
    })

    it('toggles show64BitValues', () => {
      state.updateRegisterConfig({ show64BitValues: true })
      expect(state.registerConfig.show64BitValues).toBe(true)
    })
  })

  describe('setReadConfiguration', () => {
    it('defaults to false', () => {
      expect(state.readConfiguration('u')).toBe(false)
    })

    it('sets readConfiguration to true for that unit only', () => {
      state.setReadConfiguration('u', true)
      expect(state.readConfiguration('u')).toBe(true)
      expect(state.readConfiguration('v')).toBe(false)
    })

    it('sets readConfiguration back to false', () => {
      state.setReadConfiguration('u', true)
      state.setReadConfiguration('u', false)
      expect(state.readConfiguration('u')).toBe(false)
    })
  })

  describe('setUnits', () => {
    it('sets the units, mapping and all', () => {
      const unit = mapped('u')
      state.setUnits([unit])
      expect(state.units).toEqual([unit])
      expect(state.unit('u')).toEqual(unit)
    })

    it('replaces the previous units', () => {
      state.setUnits([mapped('u')])
      state.setUnits([newClientUnit('v', 2)])
      expect(state.units.map((unit) => unit.uuid)).toEqual(['v'])
      expect(state.unit('u')).toBeUndefined()
    })

    it('takes a unit that left out of read configuration', () => {
      state.setUnits([mapped('u')])
      state.setReadConfiguration('u', true)
      state.setUnits([])
      expect(state.readConfiguration('u')).toBe(false)
    })
  })

  describe('readGeneration', () => {
    const units = (): ClientUnit[] => [newClientUnit('u', 1), newClientUnit('v', 2)]

    it('moves for the unit whose unit id changed, and for no other', () => {
      state.setUnits(units())
      const [u, v] = [state.readGeneration('u'), state.readGeneration('v')]

      state.setUnits(units().map((unit) => (unit.uuid === 'u' ? { ...unit, unitId: 9 } : unit)))

      expect(state.readGeneration('u')).toBe(u + 1)
      expect(state.readGeneration('v')).toBe(v)
    })

    it('moves for a unit whose section or mapping changed', () => {
      state.setUnits(units())
      const before = state.readGeneration('u')
      const [first, second] = units()
      if (!first || !second) throw new Error('units() makes two')

      state.setUnits([
        {
          ...first,
          sections: { ...first.sections, coils: { address: 5, length: 1, polled: true } }
        },
        second
      ])
      state.setUnits([{ ...first, registerMapping: mapped('u').registerMapping }, second])

      expect(state.readGeneration('u')).toBe(before + 2)
    })

    it('stands still for a name, byte order or address base', () => {
      state.setUnits(units())
      const before = state.readGeneration('u')

      state.setUnits(
        units().map((unit) => ({ ...unit, name: 'meter', littleEndian: true, addressBase: '1' }))
      )

      expect(state.readGeneration('u')).toBe(before)
    })

    it('moves for a unit that left, and for no unit that stayed', () => {
      state.setUnits(units())
      const [u, v] = [state.readGeneration('u'), state.readGeneration('v')]

      state.setUnits(units().filter((unit) => unit.uuid === 'v'))

      expect(state.readGeneration('u')).toBe(u + 1)
      expect(state.readGeneration('v')).toBe(v)
    })

    it('moves for the unit whose read configuration is set, and for no other', () => {
      state.setUnits(units())
      const [u, v] = [state.readGeneration('u'), state.readGeneration('v')]

      state.setReadConfiguration('u', true)

      expect(state.readGeneration('u')).toBe(u + 1)
      expect(state.readGeneration('v')).toBe(v)
    })
  })
})
