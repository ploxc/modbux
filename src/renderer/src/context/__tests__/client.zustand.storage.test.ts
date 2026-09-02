// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { carryFormerStorageKey, CLIENT_ZUSTAND_STORAGE_KEY } from '../client.zustand.storage'

const FORMER = 'root.zustand'
const saved = JSON.stringify({
  state: { name: 'bench', connectionConfig: { unitId: 3 } },
  version: 2
})

beforeEach(() => localStorage.clear())

describe('carrying the client store to its new key', () => {
  it('moves a config saved under the old name', () => {
    localStorage.setItem(FORMER, saved)

    carryFormerStorageKey()

    expect(localStorage.getItem(CLIENT_ZUSTAND_STORAGE_KEY)).toBe(saved)
  })

  it('leaves the old key where it is, so an earlier build still finds it', () => {
    localStorage.setItem(FORMER, saved)

    carryFormerStorageKey()

    expect(localStorage.getItem(FORMER)).toBe(saved)
  })

  // Every launch after the first runs this again. A second copy would undo
  // whatever the user changed in between.
  it('does not overwrite a config already saved under the new name', () => {
    const current = JSON.stringify({ state: { name: 'current' }, version: 2 })
    localStorage.setItem(FORMER, saved)
    localStorage.setItem(CLIENT_ZUSTAND_STORAGE_KEY, current)

    carryFormerStorageKey()

    expect(localStorage.getItem(CLIENT_ZUSTAND_STORAGE_KEY)).toBe(current)
  })

  it('writes nothing when there was never an old key', () => {
    carryFormerStorageKey()

    expect(localStorage.getItem(CLIENT_ZUSTAND_STORAGE_KEY)).toBeNull()
  })

  // This runs while the module graph is loading, before anything can catch it.
  // The spy goes on the localStorage instance rather than Storage.prototype,
  // which happy-dom's instance does not read through.
  it('does not throw when storage refuses to answer', () => {
    const refuse = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    expect(() => carryFormerStorageKey()).not.toThrow()
    expect(refuse).toHaveBeenCalled()

    refuse.mockRestore()
  })
})
