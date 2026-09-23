// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// The two server lists select the addresses they draw, not the map holding
// them. Mutative gives a map a new identity on every value written into it, so
// a list that selected the map drew itself again on every toggle and every
// generator tick, sorting its keys each time.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: { on: () => () => {}, send: () => {}, invoke: async () => undefined }
  }
  w.api = new Proxy({}, { get: () => () => Promise.resolve(undefined) })
})

vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar: vi.fn() }) }))

// Counts the renders of every `meme` component whose props are `{ type }` and
// nothing else. In these two files that is the list and only the list: the
// panel takes a name as well, and a row takes an address or a register.
const { listRenders } = vi.hoisted(() => ({ listRenders: { count: 0 } }))
vi.mock('@renderer/components/shared/inputs/meme', async (importOriginal) => {
  const original = await importOriginal<typeof import('@renderer/components/shared/inputs/meme')>()
  const counted = (component: (props: Record<string, unknown>) => unknown) => {
    const wrapped = (props: Record<string, unknown>) => {
      if (Object.keys(props).join() === 'type') listRenders.count++
      return component(props)
    }
    return wrapped
  }
  return {
    // A forwardRef component is an object, and none of those is a list.
    meme: (component: Parameters<typeof original.meme>[0]) =>
      original.meme(
        typeof component === 'function'
          ? (counted(component as Parameters<typeof counted>[0]) as typeof component)
          : component
      )
  }
})

import { act, render, screen } from '@testing-library/react'
import { useServerZustand } from '@renderer/context/server.zustand'
import { getDefaultServer } from '@renderer/context/server.zustand.helpers'
import { ServerRegisterEntry } from '@shared'
import ServerBooleans from '../ServerBooleans'
import ServerRegisters from '../ServerRegisters/ServerRegisters'

const UUID = 'u'

const holdingAt = (address: number, value: number): ServerRegisterEntry => ({
  value,
  params: {
    address,
    registerType: 'holding_registers',
    dataType: 'uint16',
    comment: '',
    value,
    min: undefined,
    max: undefined,
    interval: undefined
  }
})

beforeEach(() => {
  listRenders.count = 0
  useServerZustand.setState({
    selectedUuid: UUID,
    ready: { [UUID]: true },
    servers: {
      [UUID]: {
        ...getDefaultServer(),
        unitId: '0',
        registers: {
          '0': {
            coils: { 0: { value: false }, 1: { value: false }, 2: { value: false } },
            discrete_inputs: {},
            input_registers: {},
            holding_registers: { 0: holdingAt(0, 1), 1: holdingAt(1, 2) }
          }
        }
      }
    }
  } as never)
})

describe('the coil list', () => {
  it('does not draw itself again when a coil changes value', () => {
    render(<ServerBooleans name="Coils" type="coils" />)
    const before = listRenders.count

    act(() => {
      useServerZustand.getState().setBool({ registerType: 'coils', address: 1, boolState: true })
    })

    expect(listRenders.count).toBe(before)
  })

  it('draws the coil a new address adds', () => {
    render(<ServerBooleans name="Coils" type="coils" />)

    act(() => {
      useServerZustand.getState().setBool({ registerType: 'coils', address: 7, boolState: false })
    })

    expect(screen.getByTestId('server-bool-coils-circle-7')).toBeTruthy()
  })
})

describe('the holding register list', () => {
  it('does not draw itself again when a register changes value', () => {
    render(<ServerRegisters name="Holding Registers" type="holding_registers" />)
    const before = listRenders.count

    act(() => {
      useServerZustand
        .getState()
        .setRegisterValue({ registerType: 'holding_registers', address: 1, value: 42 })
    })

    expect(listRenders.count).toBe(before)
  })

  it('shows the value a register changes to', () => {
    render(<ServerRegisters name="Holding Registers" type="holding_registers" />)

    act(() => {
      useServerZustand
        .getState()
        .setRegisterValue({ registerType: 'holding_registers', address: 1, value: 42 })
    })

    expect(screen.getByTestId('server-reg-value-holding_registers-1').textContent).toContain('42')
  })
})
