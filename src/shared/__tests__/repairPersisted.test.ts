import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { keepCorrupt, repairPersisted, resetMessage } from '../repairPersisted'

const Schema = z.object({
  name: z.string(),
  port: z.number(),
  mapping: z.record(z.string(), z.number())
})

const defaults = { name: 'Modbux', port: 502, mapping: {} }

describe('repairPersisted', () => {
  it('keeps every field when they all parse', () => {
    const stored = { name: 'Plant', port: 5020, mapping: { '5': 1 } }

    const repair = repairPersisted(Schema, stored, defaults)

    expect(repair.state).toEqual(stored)
    expect(repair.reset).toBeUndefined()
  })

  it('keeps the siblings of a field that failed', () => {
    // The mapping is what a user built by hand, and clearing the whole key to
    // answer a broken connection config is what took it.
    const stored = { name: 'Plant', port: 'nope', mapping: { '5': 1 } }

    const repair = repairPersisted(Schema, stored, defaults)

    expect(repair.state.mapping).toEqual({ '5': 1 })
    expect(repair.state.name).toBe('Plant')
    expect(repair.state.port).toBe(502)
    expect(repair.reset?.fields).toEqual(['port'])
  })

  it('names every field it had to reset', () => {
    const stored = { name: 42, port: 'nope', mapping: { '5': 1 } }

    const repair = repairPersisted(Schema, stored, defaults)

    expect(repair.reset?.fields).toEqual(['name', 'port'])
  })

  it('resets a field that is missing rather than leaving it undefined', () => {
    const repair = repairPersisted(Schema, { name: 'Plant' }, defaults)

    expect(repair.state.port).toBe(502)
    expect(repair.reset?.fields).toEqual(['port', 'mapping'])
  })

  it('defaults everything when the blob is not an object', () => {
    for (const stored of [null, 'nope', 42, undefined]) {
      const repair = repairPersisted(Schema, stored, defaults)
      expect(repair.state, String(stored)).toEqual(defaults)
      expect(repair.reset?.fields, String(stored)).toEqual(['name', 'port', 'mapping'])
    }
  })

  it('ignores a field the schema does not declare', () => {
    const stored = { name: 'Plant', port: 5020, mapping: {}, fromTheFuture: true }

    const repair = repairPersisted(Schema, stored, defaults)

    expect(repair.state).not.toHaveProperty('fromTheFuture')
    expect(repair.reset).toBeUndefined()
  })

  it('carries the newer-version flag through', () => {
    const repair = repairPersisted(Schema, { name: 'Plant' }, defaults, true)

    expect(repair.reset?.savedByNewerVersion).toBe(true)
    expect(repair.state.name).toBe('Plant')
  })

  it('leaves the defaults it was given alone', () => {
    const given = { name: 'Modbux', port: 502, mapping: {} }

    repairPersisted(Schema, { name: 'Plant', port: 5020, mapping: { '1': 2 } }, given)

    expect(given).toEqual({ name: 'Modbux', port: 502, mapping: {} })
  })
})

describe('resetMessage', () => {
  it('names the one field it reset, and says the rest was kept', () => {
    const message = resetMessage('Client', {
      fields: ['connectionConfig'],
      savedByNewerVersion: false
    })

    expect(message).toBe(
      'Client configuration: the connection settings could not be read and was reset. ' +
        'Everything else was kept.'
    )
  })

  it('lists several fields and agrees with itself about the verb', () => {
    const message = resetMessage('Server', {
      fields: ['port', 'uuids', 'serialConfig'],
      savedByNewerVersion: false
    })

    expect(message).toContain('the ports, the server list and the serial settings')
    expect(message).toContain('were reset')
  })

  it('names a field the labels do not know rather than dropping it', () => {
    const message = resetMessage('Client', { fields: ['whatIsThis'], savedByNewerVersion: false })

    expect(message).toContain('`whatIsThis`')
  })

  it('says where a newer config came from', () => {
    const message = resetMessage('Client', {
      fields: ['connectionConfig'],
      savedByNewerVersion: true
    })

    expect(message).toContain('saved by a newer version of Modbux')
    expect(message).toContain('did not come across')
  })

  it('still says so when a newer config lost nothing', () => {
    const message = resetMessage('Server', { fields: [], savedByNewerVersion: true })

    expect(message).toBe(
      'Server configuration was saved by a newer version of Modbux and was read in full.'
    )
  })
})

describe('keepCorrupt', () => {
  /** Just enough Storage, and a record of what was written. */
  const storage = (
    initial: Record<string, string> = {}
  ): {
    held: Record<string, string>
    getItem: (k: string) => string | null
    setItem: (k: string, v: string) => void
  } => {
    const held = { ...initial }
    return {
      held,
      getItem: (k: string): string | null => held[k] ?? null,
      setItem: (k: string, v: string): void => {
        held[k] = v
      }
    }
  }

  it('copies the blob under a key nothing reads', () => {
    const store = storage({ 'client.zustand': '{"broken":true}' })

    keepCorrupt(store, 'client.zustand', () => 1756800000000)

    expect(store.held['client.zustand.corrupt-1756800000000']).toBe('{"broken":true}')
  })

  it('leaves the original where it is', () => {
    const store = storage({ 'client.zustand': '{"broken":true}' })

    keepCorrupt(store, 'client.zustand', () => 1)

    expect(store.held['client.zustand']).toBe('{"broken":true}')
  })

  it('writes nothing when there is no blob', () => {
    const store = storage()

    keepCorrupt(store, 'client.zustand', () => 1)

    expect(Object.keys(store.held)).toEqual([])
  })

  it('says nothing when storage throws', () => {
    const throwing = {
      getItem: (): string => {
        throw new Error('unavailable')
      },
      setItem: (): void => {}
    }

    expect(() => keepCorrupt(throwing, 'client.zustand')).not.toThrow()
  })
})
