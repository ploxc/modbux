// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// One click dropped every data type, scaling factor, comment, group end and
// bitmap, and the button sits beside Save. It asks first now, and only when
// there is something to lose.
import { describe, it, expect, beforeEach, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time, and
// `isServerWindow` is a boolean the preload exposes rather than a channel.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { fireEvent, render, screen } from '@testing-library/react'
import { useClientZustand, getSelectedClient } from '@renderer/context/client.zustand'
import { emptyRegisterMapping } from '@shared'
import ClearConfigButton from '../ClearConfigButton'
import { patchSelectedClient } from '../../../../../../context/__tests__/selectedClient'

const clearRegisterMapping = vi.fn()

/** The store holding a mapping over these holding registers, and a name. */
const mapped = (addresses: number[], name = 'the plant'): void => {
  const registerMapping = emptyRegisterMapping()
  for (const address of addresses)
    registerMapping.holding_registers[address] = { dataType: 'int16' }
  patchSelectedClient(useClientZustand, { registerMapping, name })
  useClientZustand.setState({ clearRegisterMapping } as never)
}

/** What the grid leaves behind when a comment is typed and then emptied. */
const emptied = (addresses: number[]): void => {
  const registerMapping = emptyRegisterMapping()
  for (const address of addresses) {
    registerMapping.holding_registers[address] = { comment: '', groupEnd: false }
  }
  patchSelectedClient(useClientZustand, { registerMapping, name: '' })
  useClientZustand.setState({ clearRegisterMapping } as never)
}

const clickClear = (): void => {
  fireEvent.click(screen.getByTestId('clear-config-btn'))
}

beforeEach(() => {
  clearRegisterMapping.mockClear()
})

describe('a configuration with mapped registers', () => {
  it('is not cleared until the dialog says so', () => {
    mapped([0, 5])
    render(<ClearConfigButton />)

    clickClear()

    expect(screen.getByText(/2 registers carry/)).toBeInTheDocument()
    expect(clearRegisterMapping).not.toHaveBeenCalled()
    expect(getSelectedClient().name).toBe('the plant')
  })

  it('is kept when the dialog is dismissed', () => {
    mapped([0, 5])
    render(<ClearConfigButton />)
    clickClear()

    fireEvent.click(screen.getByTestId('clear-config-cancel-btn'))

    expect(screen.queryByTestId('clear-config-confirm-btn')).toBe(null)
    expect(clearRegisterMapping).not.toHaveBeenCalled()
  })

  it('is cleared, name included, once the dialog says so', () => {
    mapped([0, 5])
    render(<ClearConfigButton />)
    clickClear()

    fireEvent.click(screen.getByTestId('clear-config-confirm-btn'))

    expect(clearRegisterMapping).toHaveBeenCalled()
    expect(getSelectedClient().name).toBe('')
    expect(screen.queryByTestId('clear-config-confirm-btn')).toBe(null)
  })

  // The count is what the dialog is worth saying, and one register is not two.
  it('counts one register as one', () => {
    mapped([7])
    render(<ClearConfigButton />)

    clickClear()

    expect(screen.getByText(/1 register carries/)).toBeInTheDocument()
  })
})

describe('a configuration with nothing mapped', () => {
  it('is cleared without asking', () => {
    mapped([], '')
    render(<ClearConfigButton />)

    clickClear()

    expect(screen.queryByTestId('clear-config-confirm-btn')).toBe(null)
    expect(clearRegisterMapping).toHaveBeenCalled()
  })

  // The name is typed by hand and the button takes it too, so it is worth a
  // question of its own.
  it('is asked about when it still holds a name', () => {
    mapped([], 'the plant')
    render(<ClearConfigButton />)

    clickClear()

    expect(screen.getByText(/The configuration name goes too/)).toBeInTheDocument()
    expect(clearRegisterMapping).not.toHaveBeenCalled()
  })
})

// An entry outlives what was in it: the grid writes `comment: ''` when a
// comment is emptied and `groupEnd: false` when a group end is switched off,
// and neither is something to lose.
describe('registers whose entries hold nothing', () => {
  it('are not counted, and the configuration clears without asking', () => {
    emptied([0, 1, 2])
    render(<ClearConfigButton />)

    clickClear()

    expect(screen.queryByTestId('clear-config-confirm-btn')).toBe(null)
    expect(clearRegisterMapping).toHaveBeenCalled()
  })
})
