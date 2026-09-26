// `readsNothingOf` is what the Read and Poll buttons and `readWhenMainCan` ask
// before a read main would refuse for asking no registers.
import { describe, expect, it } from 'vitest'
import { getDefaultClient, readsNothingOf, readySession } from '../client.zustand.helpers'

describe('readsNothingOf', () => {
  it('answers for the client under the uuid it names', () => {
    const client = getDefaultClient()
    const session = readySession(client)
    for (const unit of client.units) unit.sections[session.shownType].length = 0

    expect(readsNothingOf({ clients: { a: client }, sessions: { a: session } }, 'a')).toBe(true)
  })

  // Answered out of the client a selector falls back to, whose default window
  // asks for registers, so a uuid with nothing under it greys nothing.
  it('answers false for a uuid that holds no client', () => {
    expect(readsNothingOf({ clients: {}, sessions: {} }, 'gone')).toBe(false)
  })
})
