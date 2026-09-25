// @vitest-environment happy-dom
//
// The collapse of each register type is kept under its own key. A value there
// that is not four booleans is a view preference gone wrong, not a user's
// data, so each type that does not read gets its default.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'server-grid.zustand'

const load = async (
  persisted?: unknown
): Promise<typeof import('../serverGrid.zustand').default> => {
  if (persisted !== undefined) {
    localStorage.setItem(KEY, JSON.stringify({ state: persisted, version: 0 }))
  }
  return (await import('../serverGrid.zustand')).default
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

describe('the server grid key', () => {
  it('keeps the collapse it saved', async () => {
    const store = await load({
      collapse: {
        coils: true,
        discrete_inputs: false,
        input_registers: true,
        holding_registers: false
      }
    })

    expect(store.getState().collapse).toEqual({
      coils: true,
      discrete_inputs: false,
      input_registers: true,
      holding_registers: false
    })
  })

  it.each([[null], ['open'], [[]], [{ coils: 'yes', input_registers: true }]])(
    'reads %o as the default for every type that does not read',
    async (collapse) => {
      const store = await load({ collapse })

      const read = store.getState().collapse
      expect(Object.values(read).every((value) => typeof value === 'boolean')).toBe(true)
      expect(read.coils).toBe(false)
    }
  )

  it('keeps a type that reads beside one that does not', async () => {
    const store = await load({ collapse: { coils: 'yes', input_registers: true } })

    expect(store.getState().collapse.input_registers).toBe(true)
  })
})
