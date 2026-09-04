import { describe, expect, it } from 'vitest'
import { migrateClientConfig } from '../client/config'
import { migrateServerConfig } from '../server/config'
import { renameLegacyRegisterTypeKeys } from '../shared'

/** The four register type names, as a config from before `b3474fe` spells them. */
const legacyNames = ['Coils', 'DiscreteInputs', 'InputRegisters', 'HoldingRegisters'] as const

/** A v2 server config whose name and comments read like register type names. */
const serverConfigNamed = (text: string): string =>
  JSON.stringify({
    version: 2,
    modbuxVersion: '2.2.0',
    name: text,
    littleEndian: false,
    serverRegistersPerUnit: {
      '1': {
        coils: { '0': { value: true, comment: text } },
        discrete_inputs: {},
        input_registers: {},
        holding_registers: {
          '0': {
            value: 1,
            params: {
              address: 0,
              registerType: 'holding_registers',
              dataType: 'int16',
              comment: text,
              value: 1
            }
          }
        }
      }
    }
  })

/** A v2 client config whose name and comment read like register type names. */
const clientConfigNamed = (text: string): string =>
  JSON.stringify({
    version: 2,
    modbuxVersion: '2.2.0',
    name: text,
    littleEndian: false,
    registerMapping: {
      coils: {},
      discrete_inputs: {},
      input_registers: {},
      holding_registers: { '0': { dataType: 'int16', comment: text } }
    }
  })

describe('the text a config carries', () => {
  it.each(legacyNames)('keeps a server config named after %s', (name) => {
    const result = migrateServerConfig(serverConfigNamed(`${name} bank A`))

    expect(result.migrated).toBe(false)
    expect(result.config.name).toBe(`${name} bank A`)
  })

  it('keeps the comment on a server coil and on a server register', () => {
    const text = 'read InputRegisters here, DiscreteInputs too'
    const result = migrateServerConfig(serverConfigNamed(text))
    const registers = result.config.serverRegistersPerUnit['1']

    expect(registers?.coils['0']?.comment).toBe(text)
    expect(registers?.holding_registers['0']?.params.comment).toBe(text)
  })

  it.each(legacyNames)('keeps a client config named after %s', (name) => {
    const result = migrateClientConfig(clientConfigNamed(`${name} bank A`))

    expect(result.migrated).toBe(false)
    expect(result.config.name).toBe(`${name} bank A`)
  })

  it('keeps the comment on a client register', () => {
    const text = 'HoldingRegisters start, see Coils sheet'
    const result = migrateClientConfig(clientConfigNamed(text))

    expect(result.config.registerMapping?.holding_registers['0']?.comment).toBe(text)
  })
})

describe('a v1 config keyed the old way', () => {
  const v1Server = JSON.stringify({
    name: 'Coils bank A',
    serverRegistersPerUnit: {
      '1': {
        Coils: { '0': true },
        DiscreteInputs: {},
        InputRegisters: {},
        HoldingRegisters: {
          '2': {
            value: 7,
            params: {
              address: 2,
              registerType: 'holding_registers',
              dataType: 'int16',
              littleEndian: false,
              comment: 'Coils sheet row 3',
              value: 7
            }
          }
        }
      }
    }
  })

  // The oldest client config is the register map itself, with no name beside it.
  const v1Client = JSON.stringify({
    Coils: {},
    DiscreteInputs: {},
    InputRegisters: {},
    HoldingRegisters: { '5': { dataType: 'int16', comment: 'Coils sheet row 3' } }
  })

  it('arrives under the current server keys, and under those alone', () => {
    const result = migrateServerConfig(v1Server)
    const registers = result.config.serverRegistersPerUnit['1']

    expect(result.migrated).toBe(true)
    expect(Object.keys(registers ?? {})).toStrictEqual([
      'coils',
      'discrete_inputs',
      'input_registers',
      'holding_registers'
    ])
    expect(registers?.holding_registers['2']?.value).toBe(7)
    expect(registers?.coils['0']).toStrictEqual({ value: true })
  })

  it('arrives under the current client keys, and under those alone', () => {
    const result = migrateClientConfig(v1Client)
    const mapping = result.config.registerMapping

    expect(result.migrated).toBe(true)
    expect(Object.keys(mapping ?? {})).toStrictEqual([
      'coils',
      'discrete_inputs',
      'input_registers',
      'holding_registers'
    ])
    expect(mapping?.holding_registers['5']?.dataType).toBe('int16')
  })

  it('keeps the name and the comment a v1 file carries', () => {
    const server = migrateServerConfig(v1Server)
    const client = migrateClientConfig(v1Client)

    expect(server.config.name).toBe('Coils bank A')
    expect(server.config.serverRegistersPerUnit['1']?.holding_registers['2']?.params.comment).toBe(
      'Coils sheet row 3'
    )
    expect(client.config.registerMapping?.holding_registers['5']?.comment).toBe('Coils sheet row 3')
  })
})

describe('the rename on its own', () => {
  it('leaves a key it does not name', () => {
    const value = { name: 'Coils bank A', Coils: {} }
    renameLegacyRegisterTypeKeys(value)

    expect(Object.keys(value)).toStrictEqual(['name', 'coils'])
  })

  it('walks past a null and a string where an object could sit', () => {
    const value = { unit: null, name: 'Coils', nested: { Coils: { '0': true } } }
    renameLegacyRegisterTypeKeys(value)

    expect(value).toStrictEqual({ unit: null, name: 'Coils', nested: { coils: { '0': true } } })
  })

  it('reaches a key inside an array', () => {
    const value = { units: [{ Coils: { '0': true } }] }
    renameLegacyRegisterTypeKeys(value)

    expect(value).toStrictEqual({ units: [{ coils: { '0': true } }] })
  })
})
