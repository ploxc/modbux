import { describe, it, expect, beforeEach } from 'vitest'
import { AppState } from '../state'
import { defaultConnectionConfig, defaultRegisterConfig } from '@shared'

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

    it('has no register mapping initially', () => {
      expect(state.registerMapping).toBeUndefined()
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

    it('updates unitId', () => {
      state.updateConnectionConfig({ unitId: 42 })
      expect(state.connectionConfig.unitId).toBe(42)
    })

    it('updates protocol', () => {
      state.updateConnectionConfig({ protocol: 'ModbusRtu' })
      expect(state.connectionConfig.protocol).toBe('ModbusRtu')
    })

    it('preserves unmodified fields after multiple updates', () => {
      state.updateConnectionConfig({ unitId: 5 })
      state.updateConnectionConfig({ tcp: { host: '192.168.0.1' } })
      expect(state.connectionConfig.unitId).toBe(5)
      expect(state.connectionConfig.tcp.host).toBe('192.168.0.1')
      expect(state.connectionConfig.protocol).toBe('ModbusTcp')
    })
  })

  describe('updateRegisterConfig', () => {
    it('deep merges partial register config', () => {
      state.updateRegisterConfig({ address: 100 })
      expect(state.registerConfig.address).toBe(100)
      expect(state.registerConfig.length).toBe(10) // default preserved
    })

    it('updates register type', () => {
      state.updateRegisterConfig({ type: 'input_registers' })
      expect(state.registerConfig.type).toBe('input_registers')
    })

    it('updates poll rate', () => {
      state.updateRegisterConfig({ pollRate: 5000 })
      expect(state.registerConfig.pollRate).toBe(5000)
    })

    it('toggles littleEndian', () => {
      state.updateRegisterConfig({ littleEndian: true })
      expect(state.registerConfig.littleEndian).toBe(true)
    })
  })

  describe('setRegisterMapping', () => {
    it('sets register mapping', () => {
      const mapping = {
        coils: {},
        discrete_inputs: {},
        input_registers: {},
        holding_registers: {
          0: { dataType: 'int16' as const, scalingFactor: 1 }
        }
      }
      state.setRegisterMapping(mapping)
      expect(state.registerMapping).toEqual(mapping)
    })

    it('overwrites previous mapping', () => {
      const mapping1 = {
        coils: {},
        discrete_inputs: {},
        input_registers: {},
        holding_registers: { 0: { dataType: 'int16' as const } }
      }
      const mapping2 = {
        coils: {},
        discrete_inputs: {},
        input_registers: { 10: { dataType: 'float' as const } },
        holding_registers: {}
      }
      state.setRegisterMapping(mapping1)
      state.setRegisterMapping(mapping2)
      expect(state.registerMapping).toEqual(mapping2)
    })
  })
})
