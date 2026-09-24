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

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { getSelectedClient, useClientZustand } from '@renderer/context/client.zustand'
import { useDataZustand } from '@renderer/context/data.zustand'
import MenuRegisterOptions from '../MenuRegisterOptions'
import MenuConnectionOptions from '../MenuConnectionOptions'
import { MAIN_CLIENT_UUID, defaultClientState } from '@shared'
import { patchSelectedClient } from '../../../../../../../context/__tests__/selectedClient'
import { patchShownData } from '../../../../../../../context/__tests__/shownData'

// The options menu groups register options / connection options / actions,
// each section carrying its own trailing divider so empty sections never
// leave a stray separator. These tests guard that null-behaviour and the
// RTU-over-TCP toggle without needing a real Modbus server.

const seed = (client: Parameters<typeof patchSelectedClient>[1]): void => {
  patchSelectedClient(useClientZustand, client)
}

beforeEach(() => {
  // The setter writes what main accepted, so a stub answering `undefined`
  // refuses every payload and the store never moves.
  window.api = { updateConnectionConfig: vi.fn(() => Promise.resolve(true)) } as never
  patchSelectedClient(useClientZustand, {}, { ready: true })
  patchShownData(useDataZustand, {
    clientState: {
      ...defaultClientState,
      connectState: 'disconnected',
      polling: false,
      scanningUnitIds: false,
      scanningRegisters: false
    }
  })
})

describe('MenuRegisterOptions', () => {
  it('renders advanced/64-bit options with a trailing divider for 16-bit register types', () => {
    seed({
      registerConfig: { ...getSelectedClient().registerConfig, type: 'holding_registers' }
    })

    const { container } = render(<MenuRegisterOptions />)

    expect(screen.getByTestId('advanced-mode-checkbox')).toBeInTheDocument()
    expect(screen.getByTestId('show-64bit-checkbox')).toBeInTheDocument()
    expect(container.querySelectorAll('hr')).toHaveLength(1)
  })

  it('renders nothing (no options, no divider) for non-16-bit register types', () => {
    seed({ registerConfig: { ...getSelectedClient().registerConfig, type: 'coils' } })

    const { container } = render(<MenuRegisterOptions />)

    expect(screen.queryByTestId('advanced-mode-checkbox')).not.toBeInTheDocument()
    expect(container.querySelectorAll('hr')).toHaveLength(0)
  })
})

describe('MenuConnectionOptions', () => {
  it('renders the RTU-over-TCP checkbox with a trailing divider when TCP is selected', () => {
    seed({
      connectionConfig: { ...getSelectedClient().connectionConfig, protocol: 'ModbusTcp' }
    })

    const { container } = render(<MenuConnectionOptions />)

    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(container.querySelectorAll('hr')).toHaveLength(1)
  })

  it('checks the box when the protocol is RTU over TCP', () => {
    seed({
      connectionConfig: {
        ...getSelectedClient().connectionConfig,
        protocol: 'ModbusRtuOverTcp'
      }
    })

    render(<MenuConnectionOptions />)

    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('renders nothing (no checkbox, no divider) for serial RTU', () => {
    seed({
      connectionConfig: { ...getSelectedClient().connectionConfig, protocol: 'ModbusRtu' }
    })

    const { container } = render(<MenuConnectionOptions />)

    expect(screen.queryByTestId('rtu-over-tcp-checkbox')).not.toBeInTheDocument()
    expect(container.querySelectorAll('hr')).toHaveLength(0)
  })

  it('toggles the protocol between TCP and RTU-over-TCP via the checkbox', async () => {
    seed({
      connectionConfig: { ...getSelectedClient().connectionConfig, protocol: 'ModbusTcp' }
    })

    render(<MenuConnectionOptions />)

    fireEvent.click(screen.getByTestId('rtu-over-tcp-checkbox'))
    await waitFor(() =>
      expect(getSelectedClient().connectionConfig.protocol).toBe('ModbusRtuOverTcp')
    )
    expect(window.api.updateConnectionConfig).toHaveBeenCalledWith({
      uuid: MAIN_CLIENT_UUID,
      connectionConfig: { protocol: 'ModbusRtuOverTcp' }
    })

    fireEvent.click(screen.getByTestId('rtu-over-tcp-checkbox'))
    await waitFor(() => expect(getSelectedClient().connectionConfig.protocol).toBe('ModbusTcp'))
  })

  it('disables the checkbox while not disconnected', () => {
    seed({
      connectionConfig: { ...getSelectedClient().connectionConfig, protocol: 'ModbusTcp' }
    })
    patchShownData(useDataZustand, {
      clientState: {
        ...defaultClientState,
        connectState: 'connected',
        polling: false,
        scanningUnitIds: false,
        scanningRegisters: false
      }
    })

    render(<MenuConnectionOptions />)

    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})
