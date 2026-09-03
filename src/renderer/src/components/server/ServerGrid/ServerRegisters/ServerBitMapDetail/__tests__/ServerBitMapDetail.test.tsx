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

vi.mock('@renderer/context/server.zustand', () => ({
  useServerZustand: Object.assign(
    (selector: (state: typeof serverState) => unknown) => selector(serverState),
    { getState: () => serverState }
  )
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
const writtenParams = (): ServerRegisterEntry['params'] => {
  const call = mockAddRegister.mock.calls[0]?.[0]
  if (!call) throw new Error('addRegister was never called')
  return call.params
}

beforeEach(() => {
  mockAddRegister.mockClear()
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
