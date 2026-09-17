// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ServerRegisterEntry } from '@shared'

// ─── Store stub ──────────────────────────────────────────────────────
// The real server store persists through window.api on import, which is more
// machinery than sixteen circles need.

const mockAddRegister = vi.fn()
const serverState = {
  selectedUuid: 'main',
  getUnitId: (): string => '0',
  littleEndian: { main: false },
  addRegister: mockAddRegister
}

/** Answers the entry's own value, which is what the real one does with an empty batcher. */
const mockPendingRegisterValue = vi.fn(
  (_uuid: string, _unitId: string, entry: ServerRegisterEntry): number => Number(entry.value)
)

vi.mock('@renderer/context/server.zustand', () => ({
  useServerZustand: Object.assign(
    (selector: (state: typeof serverState) => unknown) => selector(serverState),
    { getState: () => serverState }
  ),
  pendingRegisterValue: (uuid: string, unitId: string, entry: ServerRegisterEntry): number =>
    mockPendingRegisterValue(uuid, unitId, entry)
}))

import ServerBitMapDetail from '../ServerBitMapDetail'

const BIT_INDICES = Array.from({ length: 16 }, (_, i) => i)

/** A fixed bitmap register, which is what the expander offers the panel. */
const bitmapAt100 = (
  value: number,
  bitMap?: Record<string, { comment?: string }>
): ServerRegisterEntry => ({
  value,
  params: {
    address: 100,
    registerType: 'holding_registers',
    dataType: 'bitmap',
    comment: 'server status',
    value,
    min: undefined,
    max: undefined,
    interval: undefined,
    bitMap
  }
})

/** The register params the panel wrote back, or a failure naming what is missing. */
const writtenParams = (call = 0): ServerRegisterEntry['params'] => {
  const written = mockAddRegister.mock.calls[call]?.[0]
  if (!written) throw new Error(`addRegister was called ${mockAddRegister.mock.calls.length} times`)
  return written.params
}

beforeEach(() => {
  mockAddRegister.mockReset()
  mockPendingRegisterValue.mockReset()
  mockPendingRegisterValue.mockImplementation((_uuid, _unitId, entry) => Number(entry.value))
})

describe('which bits the panel shows as on', () => {
  it('reads them out of the register value', () => {
    render(<ServerBitMapDetail register={bitmapAt100(5)} />)

    for (const bitIndex of BIT_INDICES) {
      expect(screen.getByTestId(`server-bit-circle-${bitIndex}`)).toHaveAttribute(
        'data-active',
        bitIndex === 0 || bitIndex === 2 ? 'true' : 'false'
      )
    }
  })

  it('shows the top bit of the word', () => {
    render(<ServerBitMapDetail register={bitmapAt100(0x8000)} />)

    expect(screen.getByTestId('server-bit-circle-15')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('server-bit-circle-0')).toHaveAttribute('data-active', 'false')
  })
})

describe('toggling a bit', () => {
  it('sets one that was off', async () => {
    render(<ServerBitMapDetail register={bitmapAt100(5)} />)

    await userEvent.click(screen.getByTestId('server-bit-circle-1'))

    expect(writtenParams().value).toBe(7)
  })

  it('clears one that was on', async () => {
    render(<ServerBitMapDetail register={bitmapAt100(5)} />)

    await userEvent.click(screen.getByTestId('server-bit-circle-0'))

    expect(writtenParams().value).toBe(4)
  })

  // A toggled bit is a value the user set, and a generator would write over it
  // on its next interval.
  it('drops the generator fields', async () => {
    const generator = bitmapAt100(5)
    generator.params.min = 0
    generator.params.max = 65535
    generator.params.interval = 1000

    render(<ServerBitMapDetail register={generator} />)

    await userEvent.click(screen.getByTestId('server-bit-circle-1'))

    const params = writtenParams()
    expect(params.min).toBeUndefined()
    expect(params.max).toBeUndefined()
    expect(params.interval).toBeUndefined()
  })

  // `register.value` is a write behind for as long as the batcher holds one,
  // and a toggle writes the whole word back, so reading it dropped every bit
  // set since.
  it('reads the word the batcher is holding, not the one the entry shows', async () => {
    mockPendingRegisterValue.mockReturnValue(8)
    render(<ServerBitMapDetail register={bitmapAt100(0)} />)

    await userEvent.click(screen.getByTestId('server-bit-circle-0'))

    expect(writtenParams().value).toBe(9)
  })
})

describe('a toggle that arrives before the one before it has landed', () => {
  /** A write main has taken the call for and not answered yet. */
  const heldWrite = (): (() => void) => {
    let answer: () => void = () => {}
    mockAddRegister.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          answer = (): void => resolve(true)
        })
    )
    return () => answer()
  }

  it('moves its bit in the word that one sent', async () => {
    const answerFirst = heldWrite()
    render(<ServerBitMapDetail register={bitmapAt100(0)} />)

    await userEvent.click(screen.getByTestId('server-bit-circle-0'))
    await userEvent.click(screen.getByTestId('server-bit-circle-1'))

    expect(writtenParams(1).value).toBe(3)
    answerFirst()
  })

  it('clears a bit the toggle before it set', async () => {
    const answerFirst = heldWrite()
    render(<ServerBitMapDetail register={bitmapAt100(0)} />)

    await userEvent.click(screen.getByTestId('server-bit-circle-0'))
    await userEvent.click(screen.getByTestId('server-bit-circle-0'))

    expect(writtenParams(1).value).toBe(0)
    answerFirst()
  })

  // Discriminates the guard on the clear from an unconditional one: with two
  // writes out and the first answered, the word the second sent is still the
  // only one the third can build on.
  it('keeps the newest word when an older write answers first', async () => {
    const answerFirst = heldWrite()
    const answerSecond = heldWrite()
    render(<ServerBitMapDetail register={bitmapAt100(0)} />)

    await userEvent.click(screen.getByTestId('server-bit-circle-0'))
    await userEvent.click(screen.getByTestId('server-bit-circle-1'))
    answerFirst()
    await userEvent.click(screen.getByTestId('server-bit-circle-2'))

    expect(writtenParams(2).value).toBe(7)
    answerSecond()
  })

  it('goes back to the store once the answer is in', async () => {
    render(<ServerBitMapDetail register={bitmapAt100(0)} />)

    await userEvent.click(screen.getByTestId('server-bit-circle-0'))
    // A client wrote the top bit while the panel was open, and the store has it.
    mockPendingRegisterValue.mockReturnValue(0x8000)
    await userEvent.click(screen.getByTestId('server-bit-circle-1'))

    expect(writtenParams(1).value).toBe(0x8002)
  })
})

describe('the bit comments', () => {
  it('come from the register bitMap', () => {
    render(<ServerBitMapDetail register={bitmapAt100(5, { '2': { comment: 'warning lamp' } })} />)

    expect(screen.getByTestId('server-bit-comment-2')).toHaveTextContent('warning lamp')
    expect(screen.getByTestId('server-bit-comment-3')).toHaveTextContent('...')
  })

  it('writes an edited one back under its own index', async () => {
    render(<ServerBitMapDetail register={bitmapAt100(5)} />)

    await userEvent.click(screen.getByTestId('server-bit-comment-7'))
    await userEvent.type(screen.getByRole('textbox'), 'heartbeat{Enter}')

    expect(writtenParams().bitMap).toEqual({
      '7': { comment: 'heartbeat' }
    })
  })
})
