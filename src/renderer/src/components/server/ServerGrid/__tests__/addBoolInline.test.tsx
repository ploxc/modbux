// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// No test rendered this bar. Its address is component state seeded once from
// what the unit holds, and Add refused an address with nothing free above it in
// silence.
import { describe, it, expect, beforeEach, vi } from 'vitest'

// The server store registers IPC listeners and runs init() at import time.
vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: { on: () => () => {}, send: () => {}, invoke: async () => undefined }
  }
  w.api = new Proxy({}, { get: () => () => Promise.resolve(undefined) })
})

const { enqueueSnackbar } = vi.hoisted(() => ({ enqueueSnackbar: vi.fn() }))
vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar }) }))

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useServerZustand } from '@renderer/context/server.zustand'
import { ServerBoolEntry, UnitIdString } from '@shared'
import ServerBooleans from '../ServerBooleans'

const UUID = 'u'
const SECOND_UUID = 'a-second-server'

const coil = (): ServerBoolEntry => ({ value: false, comment: undefined })

/** The coils one unit holds, by address. */
const coilsAt = (unitId: UnitIdString, addresses: number[]): Record<string, unknown> => ({
  [unitId]: {
    coils: Object.fromEntries(addresses.map((address) => [String(address), coil()])),
    discrete_inputs: {},
    input_registers: {},
    holding_registers: {}
  }
})

const addressField = (): HTMLElement =>
  within(screen.getByTestId('add-bool-address-input-coils')).getByRole('textbox')

const type = (value: string): void => {
  act(() => {
    fireEvent.input(addressField(), { target: { value } })
  })
}

const addBool = vi.fn()

beforeEach(() => {
  enqueueSnackbar.mockClear()
  addBool.mockClear()
  useServerZustand.setState({
    selectedUuid: UUID,
    uuids: [UUID],
    ready: { [UUID]: true },
    unitId: { [UUID]: '0' },
    serverRegisters: { [UUID]: { ...coilsAt('0', [0, 1]), ...coilsAt('1', [0]) } },
    addBool
  } as never)
})

describe('the address the inline add bar offers', () => {
  it('is the first one the unit does not hold', () => {
    render(<ServerBooleans name="Coils" type="coils" />)

    expect(addressField()).toHaveValue('2')
  })

  // The field held what the last unit ended on, so adding on a unit holding
  // fewer addresses started above every one of them. The unit switched to here
  // holds one coil rather than none: an empty one was already put back to 0.
  it('is read again when another unit is selected', () => {
    render(<ServerBooleans name="Coils" type="coils" />)
    expect(addressField()).toHaveValue('2')

    act(() => {
      useServerZustand.setState({ unitId: { [UUID]: '1' } } as never)
    })

    expect(addressField()).toHaveValue('1')
  })

  // Two servers can be on the same unit id, and then the unit id does not move
  // across the switch. Selecting a server is also how the bar's map changes
  // most often, because a unit id is picked once per server.
  it('is read again when another server is selected', () => {
    useServerZustand.setState({
      uuids: [UUID, SECOND_UUID],
      ready: { [UUID]: true, [SECOND_UUID]: true },
      unitId: { [UUID]: '0', [SECOND_UUID]: '0' },
      serverRegisters: {
        [UUID]: coilsAt('0', [0, 1]),
        [SECOND_UUID]: coilsAt('0', [0])
      }
    } as never)
    render(<ServerBooleans name="Coils" type="coils" />)
    expect(addressField()).toHaveValue('2')

    act(() => {
      useServerZustand.setState({ selectedUuid: SECOND_UUID } as never)
    })

    expect(addressField()).toHaveValue('1')
  })
})

describe('an address with nothing free above it', () => {
  beforeEach(() => {
    useServerZustand.setState({
      serverRegisters: { [UUID]: coilsAt('0', [65535]) }
    } as never)
  })

  it('is refused with a message', () => {
    render(<ServerBooleans name="Coils" type="coils" />)
    type('65535')

    fireEvent.click(screen.getByTestId('add-bool-btn-coils'))

    expect(enqueueSnackbar).toHaveBeenCalledWith({
      message: 'Every address from 65535 up is taken',
      variant: 'error'
    })
    expect(addBool).not.toHaveBeenCalled()
  })

  it('takes the one below it with nothing said', () => {
    render(<ServerBooleans name="Coils" type="coils" />)
    type('65534')

    fireEvent.click(screen.getByTestId('add-bool-btn-coils'))

    expect(enqueueSnackbar).not.toHaveBeenCalled()
    expect(addBool).toHaveBeenCalledWith('coils', 65534)
  })
})
