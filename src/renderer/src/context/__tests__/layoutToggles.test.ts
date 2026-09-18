// @vitest-environment happy-dom
//
// The three toggles read their own field through `get()` from inside a
// mutative recipe, where the draft holds it. They read the draft now, and a
// draft that answered a stale value would make a toggle a no-op on the second
// press rather than on the first.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubRenderer } from './stubRenderer'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('the layout toggles', () => {
  it('flip their own field and flip it back', async () => {
    const { useLayoutZustand } = await import('../layout.zustand')

    for (const [toggle, field] of [
      ['toggleShowLog', 'showLog'],
      ['toggleShowClientRawValues', 'showClientRawValues'],
      ['toggleShowGridWhileScanning', 'showGridWhileScanning']
    ] as const) {
      const before = useLayoutZustand.getState()[field]

      useLayoutZustand.getState()[toggle]()
      expect(useLayoutZustand.getState()[field]).toBe(!before)

      useLayoutZustand.getState()[toggle]()
      expect(useLayoutZustand.getState()[field]).toBe(before)
    }
  })

  it('leaves the other two where they were', async () => {
    const { useLayoutZustand } = await import('../layout.zustand')
    const { showClientRawValues, showGridWhileScanning } = useLayoutZustand.getState()

    useLayoutZustand.getState().toggleShowLog()

    expect(useLayoutZustand.getState().showClientRawValues).toBe(showClientRawValues)
    expect(useLayoutZustand.getState().showGridWhileScanning).toBe(showGridWhileScanning)
  })
})
