import { describe, expect, it } from 'vitest'
import { newClientUnit } from '../default'
import { ClientUnitsSchema } from '../types/clientChannels'

describe('ClientUnitsSchema', () => {
  it('refuses two units of one client with the same unit ID', () => {
    const units = [newClientUnit('a', 2), newClientUnit('b', 2)]
    expect(ClientUnitsSchema.safeParse({ uuid: 'client', units }).success).toBe(false)
  })

  it('takes units with different unit IDs', () => {
    const units = [newClientUnit('a', 1), newClientUnit('b', 2)]
    expect(ClientUnitsSchema.safeParse({ uuid: 'client', units }).success).toBe(true)
  })
})
