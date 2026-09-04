import { beforeEach, describe, expect, it } from 'vitest'
import {
  carryFormerClientState,
  CLIENT_ZUSTAND_STORAGE_KEY,
  FORMER_CLIENT_ZUSTAND_STORAGE_KEY
} from '../client/zustand'

const saved = JSON.stringify({
  state: { name: 'bench', connectionConfig: { unitId: 3 } },
  version: 2
})

/** A Storage the test owns, so nothing here depends on a DOM. */
const create = (): Storage & { map: Map<string, string> } => {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key): string | null => map.get(key) ?? null,
    setItem: (key, value): void => void map.set(key, value),
    removeItem: (key): void => void map.delete(key),
    clear: (): void => map.clear(),
    key: (index): string | null => [...map.keys()][index] ?? null,
    get length(): number {
      return map.size
    }
  }
}

let storage: Storage
beforeEach(() => {
  storage = create()
})

describe('carrying the client store to its new key', () => {
  it('moves a config saved under the old name', () => {
    storage.setItem(FORMER_CLIENT_ZUSTAND_STORAGE_KEY, saved)

    carryFormerClientState(storage)

    expect(storage.getItem(CLIENT_ZUSTAND_STORAGE_KEY)).toBe(saved)
  })

  it('leaves the old key where it is, so an earlier build still finds it', () => {
    storage.setItem(FORMER_CLIENT_ZUSTAND_STORAGE_KEY, saved)

    carryFormerClientState(storage)

    expect(storage.getItem(FORMER_CLIENT_ZUSTAND_STORAGE_KEY)).toBe(saved)
  })

  // Every launch after the first runs this again. A second copy would undo
  // whatever the user changed in between.
  it('does not overwrite a config already saved under the new name', () => {
    const current = JSON.stringify({ state: { name: 'current' }, version: 2 })
    storage.setItem(FORMER_CLIENT_ZUSTAND_STORAGE_KEY, saved)
    storage.setItem(CLIENT_ZUSTAND_STORAGE_KEY, current)

    carryFormerClientState(storage)

    expect(storage.getItem(CLIENT_ZUSTAND_STORAGE_KEY)).toBe(current)
  })

  it('writes nothing when there was never an old key', () => {
    carryFormerClientState(storage)

    expect(storage.getItem(CLIENT_ZUSTAND_STORAGE_KEY)).toBeNull()
  })

  // This runs while the module graph is loading, before anything can catch it.
  // A browser with site data blocked throws from getItem rather than answering
  // null, which is the case the try exists for.
  it('does not throw when storage refuses to answer', () => {
    const refusing: Storage = {
      ...storage,
      getItem: () => {
        throw new Error('storage disabled')
      }
    }

    expect(() => carryFormerClientState(refusing)).not.toThrow()
  })
})
