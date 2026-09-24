// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// The root store registers IPC listeners (window.electron.ipcRenderer) and runs
// init() (window.api.*) at import time. Stub both before the store is imported.
vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: { on: () => () => {}, send: () => {}, invoke: async () => undefined }
  }
  w.api = new Proxy({}, { get: () => () => Promise.resolve(undefined) })
})

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import {
  getSelectedClient,
  getSelectedSession,
  useClientZustand
} from '@renderer/context/client.zustand'
import { useDataZustand } from '@renderer/context/data.zustand'
import { defaultClientState, RegisterType } from '@shared'
import RegisterConfig from '../RegisterConfig'
import { patchSelectedClient } from '../../../../context/__tests__/selectedClient'

// Read configuration reads the addresses a data type was set on. What the
// button offers has to be that same set, because a mapping it cannot read
// leaves the user with an empty grid and two disabled fields.

const seed = (type: RegisterType, mapping: Record<number, object>): void => {
  patchSelectedClient(useClientZustand, {
    registerConfig: { ...getSelectedClient().registerConfig, type },
    registerMapping: {
      coils: {},
      discrete_inputs: {},
      input_registers: {},
      holding_registers: {},
      [type]: mapping
    }
  })
}

// The stub above answers `undefined` to every channel, `get_client_states`
// included, so the store gets no client state from main. The button reads the
// client state, so it gets one here.
beforeEach(() => {
  patchSelectedClient(useClientZustand, {}, { ready: true, readConfiguration: false })
  useDataZustand.setState({ clientState: { ...defaultClientState } })
})

describe('RegisterConfig read configuration', () => {
  it('offers the button for a mapping that carries a data type', () => {
    seed('holding_registers', { 0: { dataType: 'int16' } })

    render(<RegisterConfig />)

    expect(screen.getByTestId('reg-read-config-btn')).toBeEnabled()
  })

  it('refuses a mapping of comments on a bit type', () => {
    seed('coils', { 0: { comment: 'Inverter ON' }, 1: { comment: 'Grid Relay' } })

    render(<RegisterConfig />)

    expect(screen.getByTestId('reg-read-config-btn')).toBeDisabled()
  })

  it('refuses a mapping of comments on a register type', () => {
    seed('holding_registers', { 0: { comment: 'label only' } })

    render(<RegisterConfig />)

    expect(screen.getByTestId('reg-read-config-btn')).toBeDisabled()
  })

  it('refuses an address whose data type was set back to none', () => {
    seed('holding_registers', { 0: { dataType: 'none', comment: 'label only' } })

    render(<RegisterConfig />)

    expect(screen.getByTestId('reg-read-config-btn')).toBeDisabled()
  })

  it('refuses an empty mapping', () => {
    seed('holding_registers', {})

    render(<RegisterConfig />)

    expect(screen.getByTestId('reg-read-config-btn')).toBeDisabled()
  })

  // Pressing it asks main for a read, and main refuses one while a read is in
  // flight. The button says so instead of taking the press.
  it('refuses while a read is in flight, and offers again after it', () => {
    seed('holding_registers', { 0: { dataType: 'int16' } })
    useDataZustand.setState({
      clientState: { ...defaultClientState, connectState: 'connected', reading: true }
    })

    const { rerender } = render(<RegisterConfig />)
    expect(screen.getByTestId('reg-read-config-btn')).toBeDisabled()

    useDataZustand.setState({
      clientState: { ...defaultClientState, connectState: 'connected', reading: false }
    })
    rerender(<RegisterConfig />)

    expect(screen.getByTestId('reg-read-config-btn')).toBeEnabled()
  })

  // A write holds the client until it has read the register back, and main
  // refuses a read for that whole stretch.
  it('refuses while a write is in flight', () => {
    seed('holding_registers', { 0: { dataType: 'int16' } })
    useDataZustand.setState({
      clientState: { ...defaultClientState, connectState: 'connected', writing: true }
    })

    render(<RegisterConfig />)

    expect(screen.getByTestId('reg-read-config-btn')).toBeDisabled()
  })

  // Both scans were missing from the question this toggle asked, so a press
  // there drew the mapping and then dropped the read without a word.
  it.each(['scanningRegisters', 'scanningUnitIds'] as const)(
    'refuses while %s owns the client',
    (flag) => {
      seed('holding_registers', { 0: { dataType: 'int16' } })
      useDataZustand.setState({
        clientState: { ...defaultClientState, connectState: 'connected', [flag]: true }
      })

      render(<RegisterConfig />)

      expect(screen.getByTestId('reg-read-config-btn')).toBeDisabled()
    }
  )

  // A poll is the one owner that fills the grid on its own, and the press that
  // turns read configuration off asks main for nothing, so neither direction
  // has anything to wait for.
  it('offers while a poll runs', () => {
    seed('holding_registers', { 0: { dataType: 'int16' } })
    useDataZustand.setState({
      clientState: { ...defaultClientState, connectState: 'connected', polling: true }
    })

    render(<RegisterConfig />)

    expect(screen.getByTestId('reg-read-config-btn')).toBeEnabled()
  })

  // A mapping with nothing to read turns read configuration off. A read in
  // flight greys the same button and must not, or the grid empties while the
  // read that is about to fill it is still on the wire.
  it('leaves read configuration on while a read is in flight', () => {
    seed('holding_registers', { 0: { dataType: 'int16' } })
    patchSelectedClient(useClientZustand, {}, { readConfiguration: true })
    useDataZustand.setState({
      clientState: { ...defaultClientState, connectState: 'connected', reading: true }
    })

    render(<RegisterConfig />)

    expect(getSelectedSession().readConfiguration).toBe(true)
  })
})

// A scan reads the register type once for the chunk size one response carries,
// and again for every chunk. Changing it in between asks a device for 2000
// holding registers.
describe('RegisterConfig type select', () => {
  it('is off while a register scan runs', () => {
    useDataZustand.setState({
      clientState: { ...defaultClientState, connectState: 'connected', scanningRegisters: true }
    })

    render(<RegisterConfig />)

    expect(within(screen.getByTestId('reg-type-select')).getByRole('combobox')).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

  it('is there to press when no scan runs', () => {
    render(<RegisterConfig />)

    expect(within(screen.getByTestId('reg-type-select')).getByRole('combobox')).not.toHaveAttribute(
      'aria-disabled'
    )
  })
})

// A read has two ceilings and the field held the wrong one. `LengthInput` was
// `Math.min(125, max)`, so what the caller passed could only lower it and a
// coil read stopped at 125 of the 2000 FC01 answers.
describe('RegisterConfig length field', () => {
  // The mask is what holds the ceiling, so the field is what this reads. An
  // emptied field stores 0 and renders it, and the digits land behind it, which
  // is why the number rather than the string.
  const typeLength = async (text: string): Promise<number> => {
    render(<RegisterConfig />)
    const input = within(screen.getByTestId('reg-length-input')).getByRole('textbox')
    const user = userEvent.setup()
    await user.clear(input)
    await user.type(input, text)
    return Number((input as HTMLInputElement).value)
  }

  it('takes 2000 bits of coils', async () => {
    patchSelectedClient(useClientZustand, {
      registerConfig: { ...getSelectedClient().registerConfig, type: 'coils', address: 0 }
    })

    expect(await typeLength('2000')).toBe(2000)
  })

  it('holds a register read at 125', async () => {
    patchSelectedClient(useClientZustand, {
      registerConfig: {
        ...getSelectedClient().registerConfig,
        type: 'holding_registers',
        address: 0
      }
    })

    expect(await typeLength('2000')).toBe(125)
  })

  // The other ceiling: how many registers are left from the address.
  it('holds a read near the end of the range to what is there', async () => {
    patchSelectedClient(useClientZustand, {
      registerConfig: {
        ...getSelectedClient().registerConfig,
        type: 'coils',
        address: 65500
      }
    })

    expect(await typeLength('2000')).toBe(36)
  })
})

// Turning it on hands main the mapping and then asks it to read out of that
// mapping, so a refused mapping would read out of the one before it.
describe('RegisterConfig turning read configuration on', () => {
  // The stub above is a Proxy with a `get` trap and no keys, so spreading it
  // answers nothing: every channel it does not name would be gone.
  const answerWith = (answer: true | undefined): void => {
    const stubbed = window.api as unknown as Record<string, unknown>
    const named: Record<string, unknown> = {
      setRegisterMapping: vi.fn(() => Promise.resolve(answer)),
      setReadConfiguration: vi.fn(),
      read: vi.fn()
    }
    window.api = new Proxy(
      {},
      { get: (_target, method: string) => named[method] ?? stubbed[method] }
    ) as never
  }

  it('turns on once main has the mapping', async () => {
    seed('holding_registers', { 0: { dataType: 'int16' } })
    answerWith(true)

    render(<RegisterConfig />)
    fireEvent.click(screen.getByTestId('reg-read-config-btn'))

    await waitFor(() => expect(getSelectedSession().readConfiguration).toBe(true))
  })

  // The store is written after the round trip, so a second press inside it
  // still reads the toggle as off and would flush, draw and read a second time.
  it('takes one press while the first is still in flight', async () => {
    seed('holding_registers', { 0: { dataType: 'int16' } })
    let take: (answer: true) => void = () => {}
    const setRegisterMapping = vi.fn(
      () =>
        new Promise<true>((resolve) => {
          take = resolve
        })
    )
    const stubbed = window.api as unknown as Record<string, unknown>
    const named: Record<string, unknown> = {
      setRegisterMapping,
      setReadConfiguration: vi.fn(),
      read: vi.fn()
    }
    window.api = new Proxy(
      {},
      { get: (_target, method: string) => named[method] ?? stubbed[method] }
    ) as never

    render(<RegisterConfig />)
    fireEvent.click(screen.getByTestId('reg-read-config-btn'))
    fireEvent.click(screen.getByTestId('reg-read-config-btn'))
    take(true)

    await waitFor(() => expect(getSelectedSession().readConfiguration).toBe(true))
    expect(setRegisterMapping).toHaveBeenCalledTimes(1)
  })

  it('stays off when main refuses the mapping', async () => {
    seed('holding_registers', { 0: { dataType: 'int16' } })
    answerWith(undefined)

    render(<RegisterConfig />)
    fireEvent.click(screen.getByTestId('reg-read-config-btn'))

    await waitFor(() => expect(window.api.setRegisterMapping).toHaveBeenCalled())
    expect(getSelectedSession().readConfiguration).toBe(false)
    expect(window.api.setReadConfiguration).not.toHaveBeenCalled()
  })
})
