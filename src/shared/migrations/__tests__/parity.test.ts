import { describe, expect, it } from 'vitest'
import { ConnectionConfigSchema, ParitySchema, SerialPortOptionsSchema } from '../../types/client'
import { CURRENT_CLIENT_ZUSTAND_VERSION, migrateClientState } from '../client/zustand'
import { CURRENT_SERVER_ZUSTAND_VERSION } from '../server/zustand'
import { repairPersistedParity } from '../shared'
import { defaultConnectionConfig } from '../../default'

/** The last store version whose blobs can carry a parity the binding refuses. */
const LAST_VERSION_OFFERING_MARK = 2
const LAST_SERVER_VERSION_OFFERING_MARK = 3

/** A persisted client blob whose RTU options carry `parity`. */
const persistedWithParity = (parity: string): Record<string, unknown> => ({
  name: 'bench',
  connectionConfig: {
    ...defaultConnectionConfig,
    rtu: {
      com: '/dev/ttys011',
      options: { baudRate: '19200', dataBits: 8, stopBits: 1, parity }
    }
  }
})

/** The RTU options of a migrated blob, or a failure naming what is missing. */
const migratedRtuOptions = (state: Record<string, unknown>): Record<string, unknown> => {
  const connectionConfig = state.connectionConfig as Record<string, unknown> | undefined
  const rtu = connectionConfig?.rtu as Record<string, unknown> | undefined
  const options = rtu?.options as Record<string, unknown> | undefined
  if (!options) throw new Error('the migrated blob has no connectionConfig.rtu.options')
  return options
}

describe('the parity the schema names', () => {
  it('offers the three the POSIX serial binding has a case for', () => {
    expect(ParitySchema.options).toEqual(['none', 'even', 'odd'])
  })

  it('refuses mark and space', () => {
    const options = { baudRate: '9600', dataBits: 8, stopBits: 1 }
    expect(SerialPortOptionsSchema.safeParse({ ...options, parity: 'mark' }).success).toBe(false)
    expect(SerialPortOptionsSchema.safeParse({ ...options, parity: 'space' }).success).toBe(false)
  })
})

describe('a persisted parity the binding refuses', () => {
  // `migrate` runs for a stored version that is not the current one, so a blob
  // written while `mark` was on offer only reaches the repair below if the
  // store now asks for a version above the last one that could hold it.
  it('is reached at all, because the store version moved past it', () => {
    expect(CURRENT_CLIENT_ZUSTAND_VERSION).toBeGreaterThan(LAST_VERSION_OFFERING_MARK)
    expect(CURRENT_SERVER_ZUSTAND_VERSION).toBeGreaterThan(LAST_SERVER_VERSION_OFFERING_MARK)
  })

  it.each(['mark', 'space'])('becomes none, so the config still parses: %s', (parity) => {
    const state = migrateClientState(persistedWithParity(parity), 2)

    expect(migratedRtuOptions(state).parity).toBe('none')
    expect(ConnectionConfigSchema.safeParse(state.connectionConfig).success).toBe(true)
  })

  it('leaves the com port and the baud rate beside it', () => {
    const state = migrateClientState(persistedWithParity('mark'), 2)

    expect(migratedRtuOptions(state).baudRate).toBe('19200')
    const rtu = (state.connectionConfig as Record<string, unknown>).rtu as Record<string, unknown>
    expect(rtu.com).toBe('/dev/ttys011')
  })
})

describe('a persisted parity the binding accepts', () => {
  it.each(['none', 'even', 'odd'])('is left as it was: %s', (parity) => {
    const state = migrateClientState(persistedWithParity(parity), 2)

    expect(migratedRtuOptions(state).parity).toBe(parity)
  })

  it('stays absent when it was never set', () => {
    const state = migrateClientState(
      {
        connectionConfig: {
          ...defaultConnectionConfig,
          rtu: { com: '', options: { baudRate: '9600', dataBits: 8, stopBits: 1 } }
        }
      },
      2
    )

    expect('parity' in migratedRtuOptions(state)).toBe(false)
  })
})

describe('the repair on its own', () => {
  it('reaches the server store path', () => {
    const state: Record<string, unknown> = {
      serialConfig: { com: 'COM3', options: { baudRate: '9600', parity: 'space' } }
    }

    repairPersistedParity(state, 'serialConfig', 'options')

    const serialConfig = state.serialConfig as Record<string, unknown>
    expect((serialConfig.options as Record<string, unknown>).parity).toBe('none')
  })

  it('writes nothing when the path is not there', () => {
    const state: Record<string, unknown> = { serverMode: 'tcp' }

    repairPersistedParity(state, 'serialConfig', 'options')

    expect(state).toEqual({ serverMode: 'tcp' })
  })

  // A hand-edited file is where a null in the middle of the path comes from,
  // and reading a field off it throws rather than failing a schema.
  it('writes nothing when the path ends on a null', () => {
    const state: Record<string, unknown> = { serialConfig: { com: 'COM3', options: null } }

    repairPersistedParity(state, 'serialConfig', 'options')

    expect(state).toEqual({ serialConfig: { com: 'COM3', options: null } })
  })
})
