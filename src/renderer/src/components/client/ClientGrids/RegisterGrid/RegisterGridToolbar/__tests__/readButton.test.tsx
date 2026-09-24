// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// Pressing it asks main for a read, and main refuses one while anything else
// owns the client. The button says so by going dead, rather than taking a press
// that answers with a warning.
import { describe, it, expect, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { render, screen } from '@testing-library/react'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useClientZustand } from '@renderer/context/client.zustand'
import { ClientState, defaultClientState, emptyRegisterMapping } from '@shared'
import ReadButton from '../ReadButton'
import { patchShownData } from '../../../../../../context/__tests__/shownData'
import { patchSelectedClient } from '../../../../../../context/__tests__/selectedClient'

interface Toolbar {
  /** What the Length field's validity flag reads. */
  lengthGiven?: boolean
  /** Read configuration on, with a group for the register type or without. */
  mappedGroup?: boolean
}

const renderButton = (
  clientState: Partial<ClientState>,
  { lengthGiven = true, mappedGroup }: Toolbar = {}
): HTMLElement => {
  patchShownData(useDataZustand, {
    clientState: { ...defaultClientState, connectState: 'connected', ...clientState }
  })
  const registerMapping = emptyRegisterMapping()
  if (mappedGroup) registerMapping.holding_registers = { 0: { dataType: 'uint16' } }
  patchSelectedClient(
    useClientZustand,
    { registerMapping },
    {
      readConfiguration: mappedGroup !== undefined,
      valid: { host: true, com: true, length: lengthGiven }
    }
  )
  render(<ReadButton />)
  return screen.getByTestId('read-btn')
}

describe('the Read button', () => {
  it('takes a press while the client is idle', () => {
    expect(renderButton({})).toBeEnabled()
  })

  it('takes none while a read is in flight', () => {
    expect(renderButton({ reading: true })).toBeDisabled()
  })

  // A write holds the client from its own request to the end of the read back,
  // and `reading` covers the second half of that stretch alone.
  it('takes none while a write is in flight', () => {
    expect(renderButton({ writing: true })).toBeDisabled()
  })

  it('takes none while a poll runs', () => {
    expect(renderButton({ polling: true })).toBeDisabled()
  })

  // Both scans were missing from the question this button asked, so the press
  // was refused by main and the button took it anyway. What kept it out of
  // reach was the strip a register scan draws over the toolbar and the
  // backdrop a unit id scan draws over the window.
  it('takes none while a register scan runs', () => {
    expect(renderButton({ scanningRegisters: true })).toBeDisabled()
  })

  it('takes none while a unit id scan runs', () => {
    expect(renderButton({ scanningUnitIds: true })).toBeDisabled()
  })

  it('takes none while nothing is connected', () => {
    expect(renderButton({ connectState: 'disconnected' })).toBeDisabled()
  })

  // Main refuses a read of no registers, which is the toolbar's block at a
  // length the field refused and kept.
  it('takes none at a length the field refused', () => {
    expect(renderButton({}, { lengthGiven: false })).toBeDisabled()
  })

  it('takes a press at that length when read configuration reads its groups', () => {
    expect(renderButton({}, { lengthGiven: false, mappedGroup: true })).toBeEnabled()
  })

  it('takes none at that length when read configuration has no group for the type', () => {
    expect(renderButton({}, { lengthGiven: false, mappedGroup: false })).toBeDisabled()
  })
})
