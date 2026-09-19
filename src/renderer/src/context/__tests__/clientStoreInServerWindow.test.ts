// @vitest-environment happy-dom
//
// `App.tsx` imports `containers/Client` statically and `Client.tsx:11` imports
// `client.zustand`, so `out/renderer/assets/` holds one js file and both windows
// evaluate that module scope. It called main five times from whichever window
// ran it, and `set_read_configuration(false)` is the one that costs: with the
// flag off, `modbusClient.ts:586` polls one flat `[address, length]` block
// instead of the configured groups, while the main window's toggle reads on.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_ZUSTAND_STORAGE_KEY } from '@shared'
import { ApiCall, recordApiCalls, stubRenderer } from './stubRenderer'

const calls: ApiCall[] = []

/** Waits out `init`'s microtasks, so a call it makes is recorded before the read. */
const settle = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  calls.length = 0
})

describe('client.zustand in the split out server window', () => {
  it('tells main nothing at module scope', async () => {
    stubRenderer({ isServerWindow: true })
    recordApiCalls(calls)

    await import('../client.zustand')
    await settle()

    expect(calls.map(({ method }) => method)).toEqual([])
  })

  // persist wraps `setState`, so `init`'s own `set` wrote the whole partialized
  // state under the shared key on every open of the split out window.
  it('does not write the shared storage key', async () => {
    stubRenderer({ isServerWindow: true })

    await import('../client.zustand')
    await settle()

    expect(localStorage.getItem(CLIENT_ZUSTAND_STORAGE_KEY)).toBeNull()
  })

  it('still calls main from the main window', async () => {
    stubRenderer()
    recordApiCalls(calls)

    await import('../client.zustand')
    await settle()

    const methods = calls.map(({ method }) => method)
    expect(methods).toContain('updateConnectionConfig')
    expect(methods).toContain('updateRegisterConfig')
    expect(methods).toContain('stopScanningUnitIds')
    expect(calls.find(({ method }) => method === 'setReadConfiguration')?.payload).toBe(false)
  })
})
