import { describe, expect, it } from 'vitest'
import { CURRENT_SERVER_ZUSTAND_VERSION, migrateServerState } from '../server/zustand'

/**
 * The steps `migrateServerState` runs, asked of the function rather than of the
 * helpers it calls.
 *
 * Each helper had tests and each call had none, so removing a whole `if` left
 * the suite green. That was invisible while the block sat inline in
 * `server.zustand.ts`, where no test could reach it at all.
 */
describe('the migration a server store blob runs', () => {
  /** A v1 blob: byte order per register, and no server mode. */
  const v1 = (): Record<string, unknown> => ({
    serverRegisters: {
      'server-1': {
        '1': {
          coils: {},
          discrete_inputs: {},
          input_registers: {},
          holding_registers: {
            '0': {
              value: 1,
              params: {
                address: 0,
                registerType: 'holding_registers',
                dataType: 'uint16',
                comment: '',
                value: 1,
                littleEndian: true
              }
            }
          }
        }
      }
    }
  })

  /** One server out of a migrated blob, which keys them by uuid. */
  const server = (state: Record<string, unknown>, uuid = 'server-1'): Record<string, unknown> => {
    const servers = state.servers as Record<string, Record<string, unknown>> | undefined
    const found = servers?.[uuid]
    if (!found) throw new Error(`the migrated blob has no server ${uuid}`)
    return found
  }

  /** The unit map of that server: unit id, register type, address, entry. */
  type Units = Record<string, Record<string, Record<string, { params: Record<string, unknown> }>>>

  const units = (state: Record<string, unknown>): Units => server(state).registers as Units

  it('lifts the byte order off each register onto its server', () => {
    const state = migrateServerState(v1(), 1)

    expect(server(state).littleEndian).toBe(true)

    const params = units(state)['1']?.holding_registers?.['0']?.params
    expect(params && 'littleEndian' in params).toBe(false)
  })

  // Six records keyed by uuid, with `uuids` beside them as the list that was
  // supposed to agree with all six. A uuid the list did not carry was never on
  // screen, so the fold takes the list and the rest goes.
  it('folds the six records a shipped blob keeps into one record of servers', () => {
    const state = migrateServerState(
      {
        uuids: ['server-1'],
        port: { 'server-1': '5020', 'never-listed': '503' },
        unitId: { 'server-1': '7' },
        name: { 'server-1': 'bench' },
        littleEndian: { 'server-1': true },
        serverRegisters: { 'server-1': {} },
        usedAddresses: { 'server-1': {} }
      },
      3
    )

    expect(Object.keys(state.servers as object)).toEqual(['server-1'])
    expect(server(state)).toEqual({
      port: '5020',
      unitId: '7',
      name: 'bench',
      littleEndian: true,
      registers: {},
      usedAddresses: {}
    })
    expect(Object.keys(state)).toEqual(['servers'])
  })

  // The list is what is lost then, and the servers are what is left.
  it('keys off the six records where the list is not a list of uuids', () => {
    const state = migrateServerState({ uuids: 'nope', port: { 'server-1': '5020' } }, 3)

    expect(Object.keys(state.servers as object)).toEqual(['server-1'])
    expect(server(state).port).toBe('5020')
  })

  it('gives a blob with no server mode the TCP one and a serial config', () => {
    const state = migrateServerState({}, 2)

    expect(state.serverMode).toBe('tcp')
    const serialConfig = state.serialConfig as Record<string, Record<string, unknown>>
    expect(serialConfig.options?.baudRate).toBe('9600')
  })

  // A coil was a bare boolean before it carried a comment beside its value.
  it('gives a bare boolean coil the shape a comment fits in', () => {
    const state = migrateServerState(
      { serverRegisters: { 'server-1': { '1': { coils: { '3': true } } } } },
      2
    )

    expect(units(state)['1']?.coils?.['3']).toEqual({ value: true })
  })

  // Nothing above runs for a blob already at the current version.
  it('leaves a current blob alone', () => {
    const state = migrateServerState({ serverMode: 'rtu' }, CURRENT_SERVER_ZUSTAND_VERSION)

    expect(state).toEqual({ serverMode: 'rtu' })
  })

  /**
   * A blob from a newer Modbux, which persist hands this the same way.
   *
   * `repairPersisted` reads it field by field with `savedByNewerVersion` set,
   * so a newer blob is where a value this build's schemas refuse comes from,
   * and the steps that save a field from one such value ran for the versions
   * below this one alone. `migrateServerConfig` has had its own
   * `detectedVersion > CURRENT` branch since the file migration was written.
   */
  describe('a blob claiming a version above this one', () => {
    const future = (): Record<string, unknown> => ({
      serialConfig: { options: { parity: 'mark', baudRate: '9600' } },
      servers: {
        'server-1': {
          registers: {
            '1': {
              coils: {},
              discrete_inputs: {},
              input_registers: {},
              holding_registers: {
                '0': { value: 1, params: { address: 70000 } },
                '5': {
                  value: 1,
                  params: {
                    address: 5,
                    registerType: 'holding_registers',
                    dataType: 'uint16',
                    comment: '',
                    value: 1
                  }
                }
              }
            }
          }
        }
      }
    })

    it('drops the register this build cannot serve and keeps the one beside it', () => {
      const state = migrateServerState(future(), CURRENT_SERVER_ZUSTAND_VERSION + 5)

      expect(Object.keys(units(state)['1']?.holding_registers ?? {})).toEqual(['5'])
    })

    it('replaces a parity the serial binding refuses', () => {
      const state = migrateServerState(future(), CURRENT_SERVER_ZUSTAND_VERSION + 5)

      const serialConfig = state.serialConfig as Record<string, Record<string, unknown>>
      expect(serialConfig.options?.parity).toBe('none')
      expect(serialConfig.options?.baudRate).toBe('9600')
    })
  })
})
