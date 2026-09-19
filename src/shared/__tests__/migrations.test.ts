import { describe, it, expect } from 'vitest'
import { CURRENT_SERVER_CONFIG_VERSION, migrateServerConfig } from '../migrations/server/config'
import { migrateClientConfig } from '../migrations/client/config'
import { resetMessage } from '../repairPersisted'
import {
  migrateServerRegistersState,
  migrateBoolShape,
  migrateServerModeState
} from '../migrations/server/zustand'
import { defaultSerialPortOptions } from '../default'
import type { SerialPortOptions } from '../types/serial'
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
        expect(result.config.version).toBe(CURRENT_SERVER_CONFIG_VERSION)
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
    })

    // The v2 fixture is a migration now: a 64 bit value is a decimal string,
    // and a file this build writes has to say so, or v2.3.0 takes the
    // `detectedVersion === CURRENT` branch and refuses the whole file on
    // `z.number()` rather than the one register.
    describe('v2 to v3 migration', () => {
      it('migrates a v2 config to the current version', () => {
        const v2Config = loadFixture('server-config-v2-current.json')
        const result = migrateServerConfig(v2Config)

        expect(result.migrated).toBe(true)
        expect(result.fromVersion).toBe(2)
        expect(result.config.version).toBe(CURRENT_SERVER_CONFIG_VERSION)
        expect(result.config.littleEndian).toBe(false)
        expect(result.warning).toBeUndefined()
      })

      // The persisted store's own step is gated on the store version and does
      // not run on a config load, so without this the first single word write
      // after opening a v3 file folds from the rounded value.
      it('rewrites a 64 bit value a file of the current version holds as a number', () => {
        const result = migrateServerConfig(
          JSON.stringify({
            version: CURRENT_SERVER_CONFIG_VERSION,
            modbuxVersion: '3.0.0',
            name: 'hand edited',
            littleEndian: false,
            serverRegistersPerUnit: {
              '1': {
                coils: {},
                discrete_inputs: {},
                input_registers: {},
                holding_registers: {
                  '0': {
                    value: 72623859790382850,
                    params: {
                      address: 0,
                      registerType: 'holding_registers',
                      dataType: 'uint64',
                      comment: '',
                      value: 0
                    }
                  }
                }
              }
            }
          })
        )

        expect(result.migrated).toBe(false)
        expect(result.config.serverRegistersPerUnit['1']?.holding_registers['0']?.value).toBe(
          '72623859790382850'
        )
      })

      it('rewrites a 64 bit value a v2 file holds as a number', () => {
        // The key and `params.address` are one address, and `ServerRegisterSchema`
        // refuses an entry whose two disagree.
        const register = (address: number, dataType: string, value: number): unknown => ({
          value,
          params: { address, registerType: 'holding_registers', dataType, comment: '', value: 0 }
        })
        const result = migrateServerConfig(
          JSON.stringify({
            version: 2,
            modbuxVersion: '2.3.0',
            name: 'v2',
            littleEndian: false,
            serverRegistersPerUnit: {
              '1': {
                coils: {},
                discrete_inputs: {},
                input_registers: {},
                holding_registers: {
                  '0': register(0, 'uint64', 72623859790382850),
                  '10': register(10, 'uint16', 7)
                }
              }
            }
          })
        )

        const holding = result.config.serverRegistersPerUnit['1']?.holding_registers
        expect(holding?.['0']?.value).toBe('72623859790382850')
        expect(holding?.['10']?.value).toBe(7)
      })
    })

    describe('Future version handling', () => {
      it('handles a future version with warning', () => {
        const futureConfig = JSON.stringify({
          version: 9,
          modbuxVersion: '9.0.0',
          name: 'Future',
          littleEndian: false,
          newField: 'something',
          serverRegistersPerUnit: {}
        })
        const result = migrateServerConfig(futureConfig)

        expect(result.migrated).toBe(false)
        expect(result.fromVersion).toBe(9)
        expect(result.futureVersion).toBeDefined()
        expect(result.futureVersion?.savedByNewerVersion).toBe(true)
        expect(result.futureVersion?.fields).toEqual([])
      })

      // The branch cast the parsed JSON straight to `ServerConfig` and returned
      // it, so this was the one door into the app no schema stood in, and the
      // snackbar read as a compatibility notice rather than "this was not
      // checked". Both fixtures the suite had were well formed, so it was green
      // on the half that works.
      it('keeps the fields a future config still shares and names the rest', () => {
        const result = migrateServerConfig(
          JSON.stringify({
            version: 9,
            modbuxVersion: '9.0.0',
            name: 'Future',
            littleEndian: true,
            serverRegistersPerUnit: 'not a unit'
          })
        )

        expect(result.futureVersion).toBeDefined()
        expect(result.config.name).toBe('Future')
        expect(result.config.littleEndian).toBe(true)
        expect(result.config.serverRegistersPerUnit).toEqual({})
        expect(result.futureVersion?.fields).toEqual(['serverRegistersPerUnit'])
      })

      // `repairPersisted` reads a field whole, and `serverRegistersPerUnit` is
      // the one field a server config is about. `DataTypeSchema` is a closed
      // enum, so one register with a type this version does not name failed the
      // field and cost every register on every unit, after `useOpen` had
      // already emptied the store and main. That is the cost
      // `dropUnservableRegisters` exists to avoid on the persisted side.
      it('keeps the registers a future config shares and drops the one it does not', () => {
        const register = (address: number, dataType: string): unknown => ({
          value: 1,
          params: {
            address,
            registerType: 'holding_registers',
            dataType,
            comment: '',
            value: 1
          }
        })
        const result = migrateServerConfig(
          JSON.stringify({
            version: 9,
            modbuxVersion: '9.0.0',
            name: 'Future',
            littleEndian: false,
            serverRegistersPerUnit: {
              '1': {
                coils: {},
                discrete_inputs: {},
                input_registers: {},
                holding_registers: {
                  '0': register(0, 'uint16'),
                  '10': register(10, 'a_type_from_3_0'),
                  '20': register(20, 'int32')
                }
              }
            }
          })
        )

        expect(
          Object.keys(result.config.serverRegistersPerUnit['1']?.holding_registers ?? {})
        ).toEqual(['0', '20'])
        expect(result.futureVersion?.fields).toEqual([])
      })

      it('says so in a sentence naming the field', () => {
        const result = migrateServerConfig(
          JSON.stringify({
            version: 9,
            modbuxVersion: '9.0.0',
            name: 'Future',
            littleEndian: false,
            serverRegistersPerUnit: 'not a unit'
          })
        )
        const reset = result.futureVersion
        if (!reset) throw new Error('a future config always answers a reset')

        expect(resetMessage('Server', reset)).toBe(
          'Server configuration was saved by a newer version of Modbux, and the registers did not come across. Everything else was kept.'
        )
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

    // `parsed.version ?? 1` on any of these is `undefined`, so 1, so the v1 to
    // v2 step ran, and every field the migration needs sits behind a `??`. Each
    // came out a valid empty v2 config, reported as updated from an older
    // format, and `useOpen` had already emptied the server by then.
    describe('A file that is not a configuration', () => {
      it.each(['5', '[]', '"hello"', 'true', 'null'])('refuses %s', (raw) => {
        expect(() => migrateServerConfig(raw)).toThrow(
          'This file does not hold a Modbux configuration'
        )
        expect(() => migrateClientConfig(raw)).toThrow(
          'This file does not hold a Modbux configuration'
        )
      })

      // `JSON.parse` answers `any`, so nothing asked what was in this field,
      // and a relational operator coerces: `"3" > 2` and `2.5 > 2` are both
      // true, so those two took the future version branch and came back
      // `migrated: false` with the newer-version warning, while `true` and
      // `null` compared false against both and took the v1 path.
      it.each(['"3"', 'true', '2.5', 'null'])('refuses a version of %s', (version) => {
        const raw = `{"version": ${version}, "serverRegistersPerUnit": {}}`
        expect(() => migrateServerConfig(raw)).toThrow('which is not a version')
      })

      it.each(['"3"', 'true', '2.5', 'null'])(
        'refuses a client config claiming version %s',
        (version) => {
          const raw = `{"version": ${version}, "registerMapping": {}}`
          expect(() => migrateClientConfig(raw)).toThrow('which is not a version')
        }
      )

      it('still takes a file with no version at all', () => {
        const result = migrateServerConfig(JSON.stringify({ name: 'v1', coils: {} }))
        expect(result.fromVersion).toBe(1)
        expect(result.migrated).toBe(true)
      })
    })

    // A refused file is refused whole, so the message is the only thing that
    // says which register to go and fix.
    describe('What a refused config names', () => {
      const v2Config = (registersPerUnit: unknown): string =>
        JSON.stringify({
          version: 2,
          modbuxVersion: '2.0.0',
          name: 'probe',
          littleEndian: false,
          serverRegistersPerUnit: registersPerUnit
        })

      const unitWith = (...registers: [number, unknown][]): unknown => ({
        '1': {
          coils: {},
          discrete_inputs: {},
          input_registers: {},
          holding_registers: Object.fromEntries(
            registers.map(([address, params]) => [String(address), { value: 0, params }])
          )
        }
      })

      /** A register carrying a fixed value and a leftover range, which fits neither shape. */
      const halfFilled = (address: number): unknown => ({
        address,
        registerType: 'holding_registers',
        dataType: 'uint16',
        comment: '',
        value: 5,
        min: 0
      })

      const refusal = (config: string): string => {
        try {
          migrateServerConfig(config)
        } catch (error) {
          return (error as Error).message
        }
        throw new Error('the config was accepted')
      }

      // `RegisterParamsSchema` is a union, and a union answers `Invalid input`
      // at its own path with every branch's reason kept out of `issues`.
      it('names the address and the field a half filled register fits neither shape by', () => {
        const message = refusal(v2Config(unitWith([10, halfFilled(10)])))

        expect(message).toContain('holding_registers.10.params.min')
      })

      // Only the nearest branch is reported, and `z.undefined()` is nearer than
      // a unit holding two faults, so a union over the unit hides both.
      it('names both registers when a unit holds two of them', () => {
        const message = refusal(v2Config(unitWith([10, halfFilled(10)], [11, halfFilled(11)])))

        expect(message).toContain('holding_registers.10.params.min')
        expect(message).toContain('holding_registers.11.params.min')
      })

      it('names the address and the field a register is missing', () => {
        const message = refusal(
          v2Config(
            unitWith([
              10,
              { address: 10, registerType: 'holding_registers', dataType: 'uint16', value: 5 }
            ])
          )
        )

        expect(message).toContain('holding_registers.10.params.comment')
      })

      // The intersection refuses it on both halves, in the same words.
      it('says once that a register has no parameters at all', () => {
        const message = refusal(v2Config(unitWith([10, 5])))

        expect(message.split('\n')).toHaveLength(1)
        expect(message).toContain('holding_registers.10.params')
      })

      // The default enum message lists all 256 members.
      it('says what a unit id is rather than listing every one', () => {
        const message = refusal(
          v2Config({
            '256': { coils: {}, discrete_inputs: {}, input_registers: {}, holding_registers: {} }
          })
        )

        expect(message).toContain(
          'serverRegistersPerUnit.256: Unit id must be a whole number from 0 to 255'
        )
        expect(message.length).toBeLessThan(200)
      })

      // Five lines is the budget, and one register used to spend all of it.
      it('still reaches the unit id past a unit full of bad registers', () => {
        const message = refusal(
          v2Config({
            ...(unitWith([10, halfFilled(10)], [11, halfFilled(11)]) as object),
            '256': { coils: {}, discrete_inputs: {}, input_registers: {}, holding_registers: {} }
          })
        )

        expect(message).toContain('serverRegistersPerUnit.256')
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
        expect(result.config.littleEndian).toBe(false)
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
        expect(result.config.littleEndian).toBe(false)
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
        expect(result.config.littleEndian).toBe(false)
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
        expect(result.futureVersion).toBeDefined()
      })

      // `LoadButton` calls `replaceRegisterMapping(config.registerMapping)`
      // with no gate at all, so `'nope'` went into the persisted store and was
      // flushed to main.
      // `registerMapping` is one field too, and it is the one thing in the
      // client store built by hand, so one address this version cannot read
      // cost the whole mapping. `LoadButton` then flushed that nothing to main.
      it('keeps the mapping entries a future config shares and drops the one it does not', () => {
        const result = migrateClientConfig(
          JSON.stringify({
            version: 9,
            modbuxVersion: '9.0.0',
            littleEndian: false,
            registerMapping: {
              coils: {},
              discrete_inputs: {},
              input_registers: {},
              holding_registers: {
                '0': { dataType: 'uint16', comment: 'kept' },
                '10': { dataType: 'a_type_from_3_0' },
                '20': { dataType: 'int32' }
              }
            }
          })
        )

        expect(Object.keys(result.config.registerMapping.holding_registers)).toEqual(['0', '20'])
        expect(result.futureVersion?.fields).toEqual([])
      })

      it('keeps the fields a future config still shares and names the rest', () => {
        const result = migrateClientConfig(
          JSON.stringify({
            version: 9,
            modbuxVersion: '9.0.0',
            name: 'Future',
            littleEndian: true,
            registerMapping: 'nope'
          })
        )

        expect(result.futureVersion).toBeDefined()
        expect(result.config.name).toBe('Future')
        expect(result.config.littleEndian).toBe(true)
        expect(result.config.registerMapping).toEqual({
          coils: {},
          discrete_inputs: {},
          holding_registers: {},
          input_registers: {}
        })
        expect(result.futureVersion?.fields).toEqual(['registerMapping'])
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
      const register = serverRegisters['uuid-1']?.['1'].input_registers['0']
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

    it('converts old boolean coils/discrete_inputs to { value: boolean } shape', () => {
      const oldState = {
        serverRegisters: {
          'uuid-1': {
            '0': {
              coils: { '0': true, '1': false },
              discrete_inputs: { '3': true },
              input_registers: {},
              holding_registers: {}
            }
          }
        }
      }

      const migrated = migrateServerRegistersState(oldState)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const regs = (migrated.serverRegisters as any)['uuid-1']['0']

      expect(regs.coils['0']).toEqual({ value: true })
      expect(regs.coils['1']).toEqual({ value: false })
      expect(regs.discrete_inputs['3']).toEqual({ value: true })
    })
  })

  describe('migrateBoolShape', () => {
    it('converts boolean entries to { value: boolean } shape', () => {
      const serverRegisters: Record<string, Record<string, unknown> | undefined> = {
        'uuid-1': {
          '0': {
            coils: { '0': true, '5': false },
            discrete_inputs: { '0': false, '3': true },
            input_registers: {},
            holding_registers: {}
          }
        }
      }

      migrateBoolShape(serverRegisters)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const regs = serverRegisters['uuid-1']?.['0'] as any
      expect(regs.coils['0']).toEqual({ value: true })
      expect(regs.coils['5']).toEqual({ value: false })
      expect(regs.discrete_inputs['0']).toEqual({ value: false })
      expect(regs.discrete_inputs['3']).toEqual({ value: true })
    })

    it('skips already-migrated entries (objects with .value)', () => {
      const serverRegisters: Record<string, Record<string, unknown> | undefined> = {
        'uuid-1': {
          '0': {
            coils: { '0': { value: true }, '5': { value: false, comment: 'test' } },
            discrete_inputs: {},
            input_registers: {},
            holding_registers: {}
          }
        }
      }

      migrateBoolShape(serverRegisters)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const regs = serverRegisters['uuid-1']?.['0'] as any
      expect(regs.coils['0']).toEqual({ value: true })
      expect(regs.coils['5']).toEqual({ value: false, comment: 'test' })
    })

    it('handles undefined serverRegisters gracefully', () => {
      expect(() => migrateBoolShape(undefined)).not.toThrow()
    })
  })

  describe('Server Config Migration - Bool Shape', () => {
    it('v1 config migration converts bools to { value: boolean } shape', () => {
      const v1Config = JSON.stringify({
        name: 'Bool Test',
        serverRegistersPerUnit: {
          '1': {
            coils: { '0': true, '1': false },
            discrete_inputs: { '3': true },
            input_registers: {},
            holding_registers: {}
          }
        }
      })

      const result = migrateServerConfig(v1Config)

      const unit = result.config.serverRegistersPerUnit['1']
      if (!unit) throw new Error('the migrated config has no unit 1')
      expect(unit.coils['0']).toEqual({ value: true })
      expect(unit.coils['1']).toEqual({ value: false })
      expect(unit.discrete_inputs['3']).toEqual({ value: true })
    })

    it('v2 config with old boolean shape is auto-migrated on load', () => {
      const v2Config = JSON.stringify({
        version: 2,
        modbuxVersion: '1.5.0',
        name: 'Old Bool Shape',
        littleEndian: false,
        serverRegistersPerUnit: {
          '0': {
            coils: { '0': true, '1': false },
            discrete_inputs: {},
            input_registers: {},
            holding_registers: {}
          }
        }
      })

      const result = migrateServerConfig(v2Config)
      const unit = result.config.serverRegistersPerUnit['0']
      if (!unit) throw new Error('the migrated config has no unit 0')
      expect(unit.coils['0']).toEqual({ value: true })
      expect(unit.coils['1']).toEqual({ value: false })
    })

    // The step is `migrateBoolShapeForUnit`, which leaves a bool record that is
    // not an object where it found it. The copy this file used to hold built a
    // new record per bool type, so `coils: 5` became `{}` and loaded.
    it.each([5, true, 'ab'])('refuses a v1 coils holding %o', (coils) => {
      const v1Config = JSON.stringify({
        name: 'Not A Record',
        serverRegistersPerUnit: { '1': { coils, discrete_inputs: {} } }
      })

      expect(() => migrateServerConfig(v1Config)).toThrow(/serverRegistersPerUnit\.1\.coils/)
    })

    // A list is left out: `isRecord` takes one, so `[]` loads as an empty unit
    // the way it did before, and widening that guard reaches seven other
    // callers.
    it.each([5, true, 'ab'])('refuses a v1 unit holding %o', (unit) => {
      const v1Config = JSON.stringify({
        name: 'Not A Unit',
        serverRegistersPerUnit: { '1': unit }
      })

      expect(() => migrateServerConfig(v1Config)).toThrow(/serverRegistersPerUnit\.1/)
    })

    it('refuses a v1 serverRegistersPerUnit that is a string', () => {
      const v1Config = JSON.stringify({ name: 'Not Units', serverRegistersPerUnit: 'ab' })

      expect(() => migrateServerConfig(v1Config)).toThrow(/serverRegistersPerUnit/)
    })

    it.each([5, true, 'ab'])('refuses a v1 discrete_inputs holding %o', (discreteInputs) => {
      const v1Config = JSON.stringify({
        name: 'Not A Record',
        serverRegistersPerUnit: { '1': { coils: {}, discrete_inputs: discreteInputs } }
      })

      expect(() => migrateServerConfig(v1Config)).toThrow(
        /serverRegistersPerUnit\.1\.discrete_inputs/
      )
    })
  })

  describe('Server Zustand Migration - Serial Defaults', () => {
    it('writes the serial options the rest of the app defaults to', () => {
      const migrated = migrateServerModeState({})

      expect(migrated.serverMode).toBe('tcp')
      expect(migrated.serialConfig).toEqual({ com: '', options: defaultSerialPortOptions })

      // `default.ts` states the copy: a store writing one option has to leave
      // the other's alone, which handing the object itself over would break.
      // `toEqual` above passes either way, so the identity is its own half.
      const serialConfig = migrated.serialConfig as { options: SerialPortOptions }
      expect(serialConfig.options).not.toBe(defaultSerialPortOptions)
    })
  })
})
