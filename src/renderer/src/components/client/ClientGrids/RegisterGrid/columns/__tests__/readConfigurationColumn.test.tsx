// @vitest-environment happy-dom
//
// The group column says which read a row came back in, which only read
// configuration has more than one of. It follows the switch of the unit on
// screen: read configuration is held per unit, and a record of them is an
// object whether any unit has it on or not.
import { describe, it, expect, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { renderHook } from '@testing-library/react'
import { getSelectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import useRegisterGridColumns from '..'
import { patchSelectedClient } from '@renderer/context/__tests__/selectedClient'

const fields = (): string[] =>
  renderHook(() => useRegisterGridColumns()).result.current.map(({ field }) => field)

describe('the group column', () => {
  it('is not there while the unit on screen reads its window', () => {
    patchSelectedClient(useClientZustand, {}, { readConfiguration: { 'another-unit': true } })
    expect(fields()).not.toContain('groupIndex')
  })

  it('is there while the unit on screen reads its configuration', () => {
    const unit = getSelectedUnit().uuid
    patchSelectedClient(useClientZustand, {}, { readConfiguration: { [unit]: true } })
    expect(fields()).toContain('groupIndex')
  })
})
