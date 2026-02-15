import { describe, it, expect } from 'vitest'
import {
  migrateServerConfig,
  migrateClientConfig,
  migrateServerRegistersState
} from '../configMigration'
import { readFileSync } from 'fs'
import { join } from 'path'

// Helper to load fixture files
const loadFixture = (filename: string): string => {
  return readFileSync(join(__dirname, '__fixtures__', filename), 'utf-8')
}

describe('configMigration', () => {
  describe('Server Config Migration', () => {
    describe('v1 to v2 migration', () => {
      it('migrates v1 big-endian config correctly', () => {
        const v1Config = loadFixture('server-config-v1-big-endian.json')
        const result = migrateServerConfig(v1Config)

        expect(result.migrated).toBe(true)
        expect(result.fromVersion).toBe(1)
        expect(result.config.version).toBe(2)
        expect(result.config.littleEndian).toBe(false)
        expect(result.config.name).toBe('Test Server Big Endian')
        expect(result.warning).toBeUndefined()

        // Verify littleEndian removed from register params
        const registers = result.config.serverRegistersPerUnit['1']?.input_registers
        expect(registers).toBeDefined()
        const register0 = registers?.['0']
        expect(register0?.params).not.toHaveProperty('littleEndian')
        expect(register0?.params.comment).toBe('Temperature')
      })

      it('migrates v1 little-endian config correctly', () => {
        const v1Config = loadFixture('server-config-v1-little-endian.json')
        const result = migrateServerConfig(v1Config)

        expect(result.migrated).toBe(true)
        expect(result.fromVersion).toBe(1)
        expect(result.config.littleEndian).toBe(true)
        expect(result.warning).toBeUndefined()
      })

      it('detects mixed endianness and chooses majority (big)', () => {
        const v1Config = loadFixture('server-config-v1-mixed-endian.json')
        const result = migrateServerConfig(v1Config)

        expect(result.migrated).toBe(true)
        expect(result.fromVersion).toBe(1)
        expect(result.config.littleEndian).toBe(false) // 2 big, 1 little
        expect(result.warning).toBe('MIXED_ENDIANNESS')
        expect(result.wasMixedEndianness).toBe(true)
      })

      it('handles empty config with default big-endian', () => {
        const v1Config = JSON.stringify({
          name: 'Empty',
          serverRegistersPerUnit: {
            '1': {
              coils: {},
              discrete_inputs: {},
              input_registers: {},
              holding_registers: {}
            }
          }
        })
        const result = migrateServerConfig(v1Config)

        expect(result.config.littleEndian).toBe(false)
        expect(result.warning).toBeUndefined()
      })

      it('handles 50/50 tie with default big-endian', () => {
        const v1Config = JSON.stringify({
          name: 'Tie',
          serverRegistersPerUnit: {
            '1': {
              coils: {},
              discrete_inputs: {},
              input_registers: {
                '0': {
                  value: 100,
                  params: {
                    address: 0,
                    registerType: 'input_registers',
                    dataType: 'int16',
                    littleEndian: false,
                    comment: 'Big 1',
                    value: 100
                  }
                },
                '1': {
                  value: 200,
                  params: {
                    address: 1,
                    registerType: 'input_registers',
                    dataType: 'int16',
                    littleEndian: false,
                    comment: 'Big 2',
                    value: 200
                  }
                },
                '2': {
                  value: 300,
                  params: {
                    address: 2,
                    registerType: 'input_registers',
                    dataType: 'int16',
                    littleEndian: true,
                    comment: 'Little 1',
                    value: 300
                  }
                },
                '3': {
                  value: 400,
                  params: {
                    address: 3,
                    registerType: 'input_registers',
                    dataType: 'int16',
                    littleEndian: true,
                    comment: 'Little 2',
                    value: 400
                  }
                }
              },
              holding_registers: {}
            }
          }
        })
        const result = migrateServerConfig(v1Config)

        // 2 big, 2 little => tie => defaults to false (big)
        expect(result.config.littleEndian).toBe(false)
        expect(result.warning).toBe('MIXED_ENDIANNESS')
      })

      it('applies legacy string replacements (camelCase to snake_case)', () => {
        const v1ConfigLegacy = JSON.stringify({
          name: 'Legacy',
          serverRegistersPerUnit: {
            '1': {
              Coils: {},
              DiscreteInputs: {},
              InputRegisters: {},
              HoldingRegisters: {}
            }
          }
        })

        // Should not throw
        expect(() => migrateServerConfig(v1ConfigLegacy)).not.toThrow()
      })
    })

    describe('v2 pass-through', () => {
      it('does not migrate v2 config (pass-through)', () => {
        const v2Config = loadFixture('server-config-v2-current.json')
        const result = migrateServerConfig(v2Config)

        expect(result.migrated).toBe(false)
        expect(result.fromVersion).toBe(2)
        expect(result.config.version).toBe(2)
        expect(result.config.littleEndian).toBe(false)
        expect(result.warning).toBeUndefined()
      })
    })

    describe('Future version handling', () => {
      it('handles future version (v3) with warning', () => {
        const v3Config = JSON.stringify({
          version: 3,
          modbuxVersion: '2.0.0',
          name: 'Future',
          littleEndian: false,
          newField: 'something',
          serverRegistersPerUnit: {}
        })
        const result = migrateServerConfig(v3Config)

        expect(result.migrated).toBe(false)
        expect(result.fromVersion).toBe(3)
        expect(result.warning).toBe('FUTURE_VERSION')
      })
    })

    describe('Error handling', () => {
      it('throws on invalid JSON', () => {
        expect(() => migrateServerConfig('invalid-json{{{')).toThrow()
      })

      it('throws on invalid config after migration', () => {
        const invalidConfig = JSON.stringify({
          name: 'Invalid',
          serverRegistersPerUnit: {
            '1': {
              input_registers: {
                '0': {
                  value: 'not-a-number', // Invalid - should be number
                  params: {
                    address: 0,
                    registerType: 'input_registers',
                    dataType: 'int16',
                    littleEndian: false,
                    comment: 'test'
                  }
                }
              }
            }
          }
        })

        expect(() => migrateServerConfig(invalidConfig)).toThrow()
      })
    })
  })

  describe('Client Config Migration', () => {
    describe('v1 to v2 migration', () => {
      it('migrates v1 client config correctly', () => {
        const v1Config = loadFixture('client-config-v1.json')
        const result = migrateClientConfig(v1Config)

        expect(result.migrated).toBe(true)
        expect(result.fromVersion).toBe(1)
        expect(result.config.version).toBe(2)
        expect(result.config.name).toBe('Test Client Config')
        expect(result.config.registerMapping).toBeDefined()
      })

      it('handles legacy format (just mapping, no name)', () => {
        const legacyConfig = JSON.stringify({
          coils: {},
          discrete_inputs: {},
          input_registers: {
            '0': { dataType: 'int16' }
          },
          holding_registers: {}
        })
        const result = migrateClientConfig(legacyConfig)

        expect(result.migrated).toBe(true)
        expect(result.config.version).toBe(2)
        expect(result.config.registerMapping).toBeDefined()
      })
    })

    describe('v2 pass-through', () => {
      it('does not migrate v2 config (pass-through)', () => {
        const v2Config = loadFixture('client-config-v2.json')
        const result = migrateClientConfig(v2Config)

        expect(result.migrated).toBe(false)
        expect(result.fromVersion).toBe(2)
        expect(result.config.version).toBe(2)
      })
    })

    describe('Future version handling', () => {
      it('handles future version with warning', () => {
        const v3Config = JSON.stringify({
          version: 3,
          modbuxVersion: '2.0.0',
          name: 'Future',
          registerMapping: {}
        })
        const result = migrateClientConfig(v3Config)

        expect(result.fromVersion).toBe(3)
        expect(result.warning).toBe('FUTURE_VERSION')
      })
    })
  })

  describe('LocalStorage / Zustand State Migration', () => {
    it('migrates server state with littleEndian per register to global', () => {
      const oldState = {
        serverRegisters: {
          'uuid-1': {
            '1': {
              coils: {},
              discrete_inputs: {},
              input_registers: {
                '0': {
                  value: 100,
                  params: {
                    address: 0,
                    registerType: 'input_registers',
                    dataType: 'int16',
                    littleEndian: false,
                    comment: 'Test',
                    value: 100
                  }
                }
              },
              holding_registers: {}
            }
          }
        }
      }

      const migrated = migrateServerRegistersState(oldState)

      const littleEndian = migrated.littleEndian as Record<string, boolean>
      expect(littleEndian).toBeDefined()
      expect(littleEndian['uuid-1']).toBe(false)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serverRegisters = migrated.serverRegisters as Record<string, Record<string, any>>
      const register = serverRegisters['uuid-1']['1'].input_registers['0']
      expect(register.params).not.toHaveProperty('littleEndian')
      expect(register.params.comment).toBe('Test')
    })

    it('handles mixed endianness in state migration', () => {
      const oldState = {
        serverRegisters: {
          'uuid-1': {
            '1': {
              coils: {},
              discrete_inputs: {},
              input_registers: {
                '0': {
                  value: 100,
                  params: {
                    address: 0,
                    registerType: 'input_registers',
                    dataType: 'int16',
                    littleEndian: false,
                    comment: 'Big',
                    value: 100
                  }
                },
                '1': {
                  value: 200,
                  params: {
                    address: 1,
                    registerType: 'input_registers',
                    dataType: 'int16',
                    littleEndian: true,
                    comment: 'Little',
                    value: 200
                  }
                }
              },
              holding_registers: {}
            }
          }
        }
      }

      const migrated = migrateServerRegistersState(oldState)

      // Should choose majority - 1 big, 1 little = tie, defaults to false (big)
      expect((migrated.littleEndian as Record<string, boolean>)['uuid-1']).toBe(false)
    })

    it('handles empty state gracefully', () => {
      const oldState = {}
      const migrated = migrateServerRegistersState(oldState)

      expect(migrated.littleEndian).toEqual({})
    })

    it('preserves other state fields', () => {
      const oldState = {
        name: { 'uuid-1': 'Test' },
        port: { 'uuid-1': '502' },
        serverRegisters: {}
      }

      const migrated = migrateServerRegistersState(oldState)

      expect(migrated.name).toEqual({ 'uuid-1': 'Test' })
      expect(migrated.port).toEqual({ 'uuid-1': '502' })
    })
  })
})
