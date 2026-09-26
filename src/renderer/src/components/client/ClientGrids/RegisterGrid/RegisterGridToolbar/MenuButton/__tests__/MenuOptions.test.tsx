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

import { render, screen } from '@testing-library/react'
import { getSelectedClient, useClientZustand } from '@renderer/context/client.zustand'
import { useLiveZustand } from '@renderer/context/live.zustand'
import MenuRegisterOptions from '../MenuRegisterOptions'
import { defaultClientState } from '@shared'
import { patchSelectedClient } from '../../../../../../../context/__tests__/selectedClient'
import { patchShownData } from '../../../../../../../context/__tests__/shownData'

// The options menu groups register options and actions,
// each section carrying its own trailing divider so empty sections never
// leave a stray separator. These tests guard that null-behaviour without
// needing a real Modbus server.

const seed = (client: Parameters<typeof patchSelectedClient>[1]): void => {
  patchSelectedClient(useClientZustand, client)
}

beforeEach(() => {
  patchSelectedClient(useClientZustand, {}, { ready: true })
  patchShownData(useLiveZustand, {
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
