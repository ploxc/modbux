// A client config opened on the server, or a server config in the client, is
// refused by name. A client config from before versioned files migrated on the
// server to a server with no registers, reported as "Configuration updated from
// older format", and the server view clears itself before it loads.
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { migrateClientConfig, migrateServerConfig } from '@shared'

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, '../../../../e2e/fixtures/config-files', name), 'utf8')

/** A client config as Modbux wrote it before files carried a version. */
const clientV1 = JSON.stringify({
  Coils: {},
  DiscreteInputs: {},
  HoldingRegisters: { 30000: { dataType: 'utf8', comment: 'Model' } },
  InputRegisters: {}
})

/**
 * A server config as Modbux wrote it before a server had units, before
 * `14893ff`: one set of registers, which is unit 0, with the byte order on each
 * register and a bool as a bare boolean.
 */
const serverBeforeUnits = JSON.stringify({
  name: 'Before units',
  serverRegisters: {
    coils: { 3: true },
    discrete_inputs: {},
    input_registers: {},
    holding_registers: {
      10: {
        value: 42,
        params: {
          address: 10,
          registerType: 'holding_registers',
          dataType: 'int16',
          littleEndian: false,
          comment: 'setpoint',
          value: 42
        }
      }
    }
  }
})

const clientV2 = fixture('client-basic.json')
const serverV1 = fixture('server-v1-legacy.json')
const serverV2 = fixture('server-basic.json')

describe('the server', () => {
  it('refuses a client config from before versioned files', () => {
    expect(() => migrateServerConfig(clientV1)).toThrow('This is not a server configuration')
  })

  it('refuses a versioned client config', () => {
    expect(() => migrateServerConfig(clientV2)).toThrow('This is not a server configuration')
  })

  it('opens a server config from before versioned files', () => {
    expect(Object.keys(migrateServerConfig(serverV1).config.serverRegistersPerUnit)).toEqual(['0'])
  })

  it('opens a server config from before units, as unit 0', () => {
    const { config } = migrateServerConfig(serverBeforeUnits)
    expect(config.serverRegistersPerUnit['0']?.holding_registers['10']?.value).toBe(42)
    expect(config.serverRegistersPerUnit['0']?.coils['3']).toEqual({ value: true })
  })

  it('opens a versioned server config', () => {
    expect(Object.keys(migrateServerConfig(serverV2).config.serverRegistersPerUnit)).toEqual(['0'])
  })
})

describe('the client', () => {
  it('refuses a server config from before versioned files', () => {
    expect(() => migrateClientConfig(serverV1)).toThrow('This is not a client configuration')
  })

  it('refuses a versioned server config', () => {
    expect(() => migrateClientConfig(serverV2)).toThrow('This is not a client configuration')
  })

  // A server config this build saves is v3, and the client's own version is
  // 2, so without the refusal it took the newer-version path and loaded an
  // empty mapping.
  it('refuses a server config this build saves', () => {
    const serverV3 = JSON.stringify({ ...JSON.parse(serverV2), version: 3 })
    expect(() => migrateClientConfig(serverV3)).toThrow('This is not a client configuration')
  })

  it('refuses a server config from before units', () => {
    expect(() => migrateClientConfig(serverBeforeUnits)).toThrow(
      'This is not a client configuration'
    )
  })

  it('opens a client config from before versioned files', () => {
    const { config } = migrateClientConfig(clientV1)
    expect(Object.keys(config.registerMapping.holding_registers ?? {})).toEqual(['30000'])
  })

  it('opens a versioned client config', () => {
    expect(migrateClientConfig(clientV2).migrated).toBe(false)
  })
})
