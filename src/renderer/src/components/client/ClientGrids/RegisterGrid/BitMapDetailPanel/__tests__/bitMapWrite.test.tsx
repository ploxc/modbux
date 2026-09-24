// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// A toggle writes the whole word, and sixteen circles a click apart are sixteen
// writes. Main refuses a write while one is in flight and says so in a
// snackbar, so the circles stop taking a click for that stretch instead.
import { describe, it, expect, beforeEach, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { fireEvent, render, screen } from '@testing-library/react'
import { getSelectedClient, useClientZustand } from '@renderer/context/client.zustand'
import { useDataZustand } from '@renderer/context/data.zustand'
import { ApiCall, recordApiCalls } from '@renderer/context/__tests__/stubRenderer'
import { ClientState, defaultClientState, MAIN_CLIENT_UUID, RegisterData } from '@shared'
import BitMapDetailPanel from '../BitMapDetailPanel'
import { patchSelectedClient } from '../../../../../../context/__tests__/selectedClient'

const calls: ApiCall[] = []

const row = {
  id: 0,
  buffer: new Uint8Array(2),
  hex: '0000',
  words: { uint16: 0 },
  bit: false,
  isScanned: false
} as unknown as RegisterData

const renderPanel = (clientState: Partial<ClientState>): void => {
  useDataZustand.setState({
    clientState: { ...defaultClientState, connectState: 'connected', ...clientState }
  })
  patchSelectedClient(
    useClientZustand,
    { registerConfig: { ...getSelectedClient().registerConfig, type: 'holding_registers' } },
    { ready: true }
  )
  useDataZustand.setState({ registerData: [row] })
  render(<BitMapDetailPanel address={0} />)
}

beforeEach(() => {
  calls.length = 0
  recordApiCalls(calls)
})

describe('the bit a toggle writes', () => {
  it('goes to main while the client is idle', () => {
    renderPanel({})

    fireEvent.click(screen.getByTestId('bit-circle-3'))

    expect(calls).toEqual([
      {
        method: 'write',
        payload: {
          uuid: MAIN_CLIENT_UUID,
          parameters: {
            address: 0,
            dataType: 'uint16',
            type: 'holding_registers',
            value: 8,
            single: true
          }
        }
      }
    ])
  })

  it('goes nowhere while a write is in flight', () => {
    renderPanel({ writing: true })

    fireEvent.click(screen.getByTestId('bit-circle-3'))

    expect(calls).toEqual([])
  })

  it('goes nowhere while a poll runs', () => {
    renderPanel({ polling: true })

    fireEvent.click(screen.getByTestId('bit-circle-3'))

    expect(calls).toEqual([])
  })
})
