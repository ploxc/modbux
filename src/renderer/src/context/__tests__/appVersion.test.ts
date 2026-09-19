// @vitest-environment happy-dom
//
// The version was fetched from `client.zustand`'s module tail, which is guarded
// on the main window, so the fetch was the one call that tail made from both.
// `OpenSaveClear` writes `version` into every server config saved, and the
// split out server window is where that button is, so the fetch has to happen
// there too. It is `layout.zustand`'s now, which owns the field and is guarded
// on nothing.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiCall, recordApiCalls, stubRenderer } from './stubRenderer'

const calls: ApiCall[] = []

/** Waits out the module tail's microtasks, so the answer is in the store. */
const settle = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  calls.length = 0
})

describe('the app version', () => {
  it('reaches the layout store in the main window', async () => {
    stubRenderer()

    const { useLayoutZustand } = await import('../layout.zustand')
    await settle()

    expect(useLayoutZustand.getState().version).toBe('0.0.0-test')
  })

  it('reaches the layout store in the split out server window', async () => {
    stubRenderer({ isServerWindow: true })

    const { useLayoutZustand } = await import('../layout.zustand')
    await settle()

    expect(useLayoutZustand.getState().version).toBe('0.0.0-test')
  })

  it('is asked for once, by the layout store', async () => {
    stubRenderer({ isServerWindow: true })
    recordApiCalls(calls)

    await import('../layout.zustand')
    await import('../client.zustand')
    await settle()

    expect(calls.filter(({ method }) => method === 'getAppVersion')).toHaveLength(1)
  })
})
