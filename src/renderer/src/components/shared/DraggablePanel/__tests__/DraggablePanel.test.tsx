// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// The panel floats over a page that keeps working: nothing beside it is
// hidden from screen readers, it is no dialog to the undo keys, and Escape
// closes it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import DraggablePanel from '../DraggablePanel'

afterEach(cleanup)

const renderPanel = (onClose = vi.fn()): { page: HTMLElement; onClose: () => void } => {
  const anchor = document.createElement('div')
  document.body.appendChild(anchor)
  render(
    <>
      <main data-testid="page">
        <button type="button">A control of the page</button>
      </main>
      <DraggablePanel anchor={anchor} onClose={onClose} paperSx={{ width: 300 }} label="Trend">
        <span>inside</span>
      </DraggablePanel>
    </>
  )
  return { page: screen.getByTestId('page'), onClose }
}

describe('DraggablePanel', () => {
  it('leaves the page beside it visible to screen readers and to role queries', () => {
    const { page } = renderPanel()

    expect(screen.getByRole('region', { name: 'Trend' })).toBeInTheDocument()
    expect(page.closest('[aria-hidden="true"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'A control of the page' })).toBeInTheDocument()
  })

  // The undo keys wait while a dialog is open.
  it('is no dialog', () => {
    renderPanel()

    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('closes on Escape', () => {
    const { onClose } = renderPanel()

    fireEvent.keyDown(screen.getByText('inside'), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
