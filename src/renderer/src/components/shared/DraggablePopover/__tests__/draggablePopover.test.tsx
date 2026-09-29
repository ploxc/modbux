// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// The undo keys wait while a `[role="dialog"]` is open, and the popover is
// one: an undo behind it could take away the register its draft is about.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DraggablePopover from '../DraggablePopover'

describe('DraggablePopover', () => {
  it('is a dialog while it is open', () => {
    const anchor = document.createElement('button')
    document.body.append(anchor)
    render(
      <DraggablePopover anchor={anchor} onClose={vi.fn()} paperSx={{}}>
        inside
      </DraggablePopover>
    )

    expect(screen.getByRole('dialog')).toHaveTextContent('inside')
    anchor.remove()
  })
})
