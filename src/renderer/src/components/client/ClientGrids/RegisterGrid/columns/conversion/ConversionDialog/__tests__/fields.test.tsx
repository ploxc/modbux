// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// The dialog's number fields take a number and nothing else, and a raw point
// of an interpolation has to lie in what the register's data type can read.
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { problemOf } from '../draft'
import { LerpFields, ScaleField } from '../KindFields'

describe('the factor field', () => {
  it('drops letters and hands the setter the number', async () => {
    const set = vi.fn()
    render(<ScaleField factorText="" set={set} />)

    await userEvent.setup().type(screen.getByTestId('conversion-factor-input'), 'a1b.5')

    expect(set).toHaveBeenLastCalledWith('1.5')
  })
})

describe('the interpolation fields', () => {
  const lerp = { x1: '40000', x2: '1', y1: '40000', y2: '1' }

  it('mark a raw point outside INT16 red and name the range', () => {
    render(<LerpFields {...lerp} dataType="int16" set={vi.fn()} />)

    expect(screen.getByTestId('conversion-x1-input')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('-32768 to 32767')).toBeInTheDocument()
  })

  it('leave a value point and a raw point inside the range alone', () => {
    render(<LerpFields {...lerp} dataType="int16" set={vi.fn()} />)

    expect(screen.getByTestId('conversion-y1-input')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByTestId('conversion-x2-input')).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('problemOf an interpolation', () => {
  const draft = { kind: 'lerp', x1: '-40000', x2: '1', y1: '0', y2: '1' } as const

  it('refuses a raw point outside the data type', () => {
    expect(problemOf(draft, '1', 'int16')).toBe('A raw point lies outside the data type')
  })

  it('takes the same point where the data type reads it', () => {
    expect(problemOf(draft, '1', 'int32')).toBeUndefined()
  })
})
