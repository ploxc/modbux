// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// 32 and 64 replaced "Advanced mode" and "Show 64 bit values", and the second
// no longer waits for the first: each button writes its own field.
import { describe, it, expect, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getSelectedClient, useClientZustand } from '@renderer/context/client.zustand'
import { RegisterType } from '@shared'
import BitWidthButtons from '../BitWidthButtons'
import { patchSelectedClient } from '@renderer/context/__tests__/selectedClient'

const seed = (type: RegisterType, advancedMode = false, show64BitValues = false): void => {
  patchSelectedClient(useClientZustand, {
    registerConfig: { ...getSelectedClient().registerConfig, type, advancedMode, show64BitValues }
  })
}

describe('the 32 and 64 buttons', () => {
  it('turn 64 on with 32 off', async () => {
    seed('holding_registers')
    render(<BitWidthButtons />)
    fireEvent.click(screen.getByTestId('bits-64-btn'))
    await waitFor(() => expect(getSelectedClient().registerConfig.show64BitValues).toBe(true))
    expect(getSelectedClient().registerConfig.advancedMode).toBe(false)
  })

  it('turn 32 off and leave 64 on', async () => {
    seed('holding_registers', true, true)
    render(<BitWidthButtons />)
    fireEvent.click(screen.getByTestId('bits-32-btn'))
    await waitFor(() => expect(getSelectedClient().registerConfig.advancedMode).toBe(false))
    expect(getSelectedClient().registerConfig.show64BitValues).toBe(true)
  })

  it('are not there for a bit type', () => {
    seed('coils')
    render(<BitWidthButtons />)
    expect(screen.queryByTestId('bits-32-btn')).not.toBeInTheDocument()
  })
})
