// @vitest-environment happy-dom
//
// Both stores refresh the same port list through the same helper, and the flag
// that gates their refresh buttons has to come down whatever the boundary
// answers. These go red on a store that releases it only on the success path.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SerialPortInfo } from '@shared'
import { stubRenderer } from './stubRenderer'

const ports: SerialPortInfo[] = [{ path: '/dev/ttyUSB0', manufacturer: 'FTDI' }]

/** Replaces one channel's answer, leaving the rest of the boundary alone. */
const answerWith = (method: string, answer: () => Promise<unknown>): void => {
  const w = window as unknown as { api: Record<string, unknown> }
  const boundary = w.api
  w.api = new Proxy(boundary, {
    get: (target, requested: string): unknown =>
      requested === method ? answer : Reflect.get(target, requested)
  })
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('the client store refreshing its port list', () => {
  it('holds what main answered and lets the flag go', async () => {
    answerWith('listSerialPorts', () => Promise.resolve(ports))
    const { useClientZustand } = await import('../client.zustand')

    await useClientZustand.getState().refreshSerialPorts()

    expect(useClientZustand.getState().serialPorts).toEqual(ports)
    expect(useClientZustand.getState().serialPortsLoading).toBe(false)
  })

  it('lets the flag go when main does not answer', async () => {
    answerWith('listSerialPorts', () => Promise.reject(new Error('no boundary')))
    const { useClientZustand } = await import('../client.zustand')

    await expect(useClientZustand.getState().refreshSerialPorts()).rejects.toThrow('no boundary')

    expect(useClientZustand.getState().serialPortsLoading).toBe(false)
  })
})

describe('the server store refreshing its port list', () => {
  it('holds what main answered and lets the flag go', async () => {
    answerWith('listSerialPorts', () => Promise.resolve(ports))
    const { useServerZustand } = await import('../server.zustand')

    await useServerZustand.getState().refreshSerialPorts()

    expect(useServerZustand.getState().serialPorts).toEqual(ports)
    expect(useServerZustand.getState().serialPortsLoading).toBe(false)
  })

  it('lets the flag go when main does not answer', async () => {
    answerWith('listSerialPorts', () => Promise.reject(new Error('no boundary')))
    const { useServerZustand } = await import('../server.zustand')

    await expect(useServerZustand.getState().refreshSerialPorts()).rejects.toThrow('no boundary')

    expect(useServerZustand.getState().serialPortsLoading).toBe(false)
  })
})

describe('the client store validating a port', () => {
  it('answers what main said and lets the flag go', async () => {
    const valid = { valid: true, message: '/dev/ttyUSB0 opened' }
    answerWith('validateSerialPort', () => Promise.resolve(valid))
    const { useClientZustand } = await import('../client.zustand')

    await expect(useClientZustand.getState().validateSerialPort('/dev/ttyUSB0')).resolves.toEqual(
      valid
    )

    expect(useClientZustand.getState().serialPortValidating).toBe(false)
  })

  it('lets the flag go when main does not answer', async () => {
    answerWith('validateSerialPort', () => Promise.reject(new Error('no boundary')))
    const { useClientZustand } = await import('../client.zustand')

    await expect(useClientZustand.getState().validateSerialPort('/dev/ttyUSB0')).rejects.toThrow(
      'no boundary'
    )

    expect(useClientZustand.getState().serialPortValidating).toBe(false)
  })
})
