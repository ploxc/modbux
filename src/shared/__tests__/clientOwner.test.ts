import { describe, expect, it } from 'vitest'
import { clientOwner, readLoopOwner } from '../clientOwner'
import { defaultClientState } from '../default'
import type { ClientState } from '../types'
import { ClientStateSchema } from '../types'

/** Connected and idle, which is every state below with one flag turned on. */
const idle: ClientState = { ...defaultClientState, connectState: 'connected' }

/**
 * The one question about who may put a request on the wire.
 *
 * It was spelled out in four places and three of them were different subsets:
 * `modbusClient` named five states, `readWhenMainCan` named the same five,
 * `ReadButton` named the connect state plus three, and `RegisterConfig` named
 * two. Nothing was wrong at the time, because a register scan draws its dialog
 * over the top bar and a unit id scan draws a backdrop over the window, which
 * is layout rather than a guard.
 */
describe('who owns the client', () => {
  it('answers nothing when nothing is running', () => {
    expect(clientOwner(idle)).toBeUndefined()
  })

  it.each([
    ['polling', 'a poll'],
    ['scanningUnitIds', 'a unit id scan'],
    ['scanningRegisters', 'a register scan'],
    ['reading', 'another read'],
    ['writing', 'another write']
  ] as const)('names %s as %s', (flag, name) => {
    expect(clientOwner({ ...idle, [flag]: true })).toBe(name)
  })

  // Every boolean of `ClientState`, so a sixth one added later fails here
  // rather than being let through in silence.
  it('names every state the client reports but the connect state', () => {
    const flags = Object.entries(ClientStateSchema.shape)
      .filter(([key]) => key !== 'connectState')
      .map(([key]) => key)

    expect(flags.length).toBeGreaterThan(0)
    for (const flag of flags) {
      expect(clientOwner({ ...idle, [flag]: true })).toBeDefined()
    }
  })

  // A write holds the client from its own request to the end of the read back,
  // so `writing` covers a stretch in which `reading` is set too.
  it('names the write when a write is reading back', () => {
    expect(clientOwner({ ...idle, writing: true, reading: true })).toBe('another write')
  })

  describe('asked without the poll, which is what the two scans ask', () => {
    it('answers nothing during a poll, because a scan stops one', () => {
      expect(clientOwner({ ...idle, polling: true }, { exceptPolling: true })).toBeUndefined()
    })

    it.each([
      ['scanningUnitIds', 'a unit id scan'],
      ['scanningRegisters', 'a register scan'],
      ['reading', 'another read'],
      ['writing', 'another write']
    ] as const)('still names %s', (flag, name) => {
      expect(clientOwner({ ...idle, [flag]: true }, { exceptPolling: true })).toBe(name)
    })
  })
})

/**
 * The narrower question a write asks before its read back.
 *
 * A loop decides for itself when it is done, so a write that finds one reading
 * lets that read stand rather than adding its own.
 */
describe('which read loop owns the client', () => {
  it.each([
    ['polling', 'a poll'],
    ['scanningUnitIds', 'a unit id scan'],
    ['scanningRegisters', 'a register scan']
  ] as const)('names %s', (flag, name) => {
    expect(readLoopOwner({ ...idle, [flag]: true })).toBe(name)
  })

  it.each(['reading', 'writing'] as const)('answers nothing for %s', (flag) => {
    expect(readLoopOwner({ ...idle, [flag]: true })).toBeUndefined()
  })
})
