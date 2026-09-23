import { describe, it, expect } from 'vitest'
import { MAIN_CLIENT_UUID } from '@shared'
import { CLIENT_UUID } from '../client-uuid'

describe('the uuid the specs address the client by', () => {
  it('is the one the client store uses', () => {
    expect(CLIENT_UUID).toBe(MAIN_CLIENT_UUID)
  })
})
