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

  it('lifts the byte order off each register onto its server', () => {
    const state = migrateServerState(v1(), 1)

    const byUuid = state.littleEndian as Record<string, boolean>
    expect(byUuid['server-1']).toBe(true)

    const servers = state.serverRegisters as Record<
      string,
      Record<string, Record<string, Record<string, { params: Record<string, unknown> }>>>
    >
    const params = servers['server-1']?.['1']?.holding_registers?.['0']?.params
    expect(params && 'littleEndian' in params).toBe(false)
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

    const servers = state.serverRegisters as Record<
      string,
      Record<string, Record<string, Record<string, { value: boolean }>>>
    >
    expect(servers['server-1']?.['1']?.coils?.['3']).toEqual({ value: true })
  })

  // Nothing above runs for a blob already at the current version.
  it('leaves a current blob alone', () => {
    const state = migrateServerState({ serverMode: 'rtu' }, CURRENT_SERVER_ZUSTAND_VERSION)

    expect(state).toEqual({ serverMode: 'rtu' })
  })
})
