// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// The protocol select replaced two toggles and a checkbox in the cog menu, and
// the timing selects replaced two sliders in a popover. Each writes the store
// through the setter main has to accept, and each is refused while the client
// is in the state that reads it.
import { describe, it, expect, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { getSelectedClient, useClientZustand } from '@renderer/context/client.zustand'
import { useLiveZustand } from '@renderer/context/live.zustand'
import { ClientState, defaultClientState, defaultConnectionConfig } from '@shared'
import ConnectionConfig from '../ConnectionConfig'
import { PollRateSelect } from '../ReadTiming'
import { patchSelectedClient } from '@renderer/context/__tests__/selectedClient'
import { patchShownData } from '@renderer/context/__tests__/shownData'

const seed = (clientState: Partial<ClientState> = {}): void => {
  patchShownData(useLiveZustand, { clientState: { ...defaultClientState, ...clientState } })
  patchSelectedClient(
    useClientZustand,
    { connectionConfig: { ...defaultConnectionConfig, protocol: 'ModbusTcp' } },
    { valid: { host: true, com: true, length: true } }
  )
}

/** Open a MUI select and press one of its options. */
const pick = (select: HTMLElement, option: string): void => {
  const button = within(select).getByRole('combobox')
  fireEvent.mouseDown(button)
  fireEvent.click(within(screen.getByRole('listbox')).getByText(option))
}

describe('the protocol select', () => {
  it('sets RTU over TCP, which only the cog menu could before', async () => {
    seed()
    render(<ConnectionConfig />)
    pick(screen.getByTestId('protocol-select'), 'RTU over TCP')
    await waitFor(() =>
      expect(getSelectedClient().connectionConfig.protocol).toBe('ModbusRtuOverTcp')
    )
  })

  it('is refused while connected', () => {
    seed({ connectState: 'connected' })
    render(<ConnectionConfig />)
    expect(within(screen.getByTestId('protocol-select')).getByRole('combobox')).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })
})

describe('the poll rate select', () => {
  it('writes milliseconds for the seconds it shows', async () => {
    seed()
    render(<PollRateSelect />)
    pick(screen.getByTestId('poll-rate-select'), '3 s')
    await waitFor(() => expect(getSelectedClient().registerConfig.pollRate).toBe(3000))
  })

  it('is refused while polling', () => {
    seed({ connectState: 'connected', polling: true })
    render(<PollRateSelect />)
    expect(within(screen.getByTestId('poll-rate-select')).getByRole('combobox')).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })
})
