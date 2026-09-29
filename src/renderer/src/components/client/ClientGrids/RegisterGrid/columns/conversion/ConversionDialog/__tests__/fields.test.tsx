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

  it('takes a comma as the decimal point', async () => {
    const set = vi.fn()
    render(<ScaleField factorText="" set={set} />)

    await userEvent.setup().type(screen.getByTestId('conversion-factor-input'), '0,5')

    expect(set).toHaveBeenLastCalledWith('0.5')
  })

  // The mask hands its setter the value it mounts with, so a stored factor it
  // would rewrite is saved rewritten: String(0.0000001) is 1e-7.
  it('keeps a stored factor written with an exponent as it is', () => {
    const set = vi.fn()
    render(<ScaleField factorText="1e-7" set={set} />)

    expect(screen.getByTestId('conversion-factor-input')).toHaveValue('1e-7')
    expect(set.mock.calls.every(([text]) => text === '1e-7')).toBe(true)
  })
})

describe('the interpolation fields', () => {
  const lerp = { x1: '40000', x2: '1', y1: '40000', y2: '1' }

  it('mark a raw point outside INT16 red and name the range', () => {
    render(<LerpFields {...lerp} dataType="int16" set={vi.fn()} />)

    expect(screen.getByTestId('conversion-x1-input')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('-32768 to 32767')).toBeInTheDocument()
  })

  // A migrated raw point is the old one over the scale, with every digit that
  // division leaves.
  it('keep every decimal of a stored point', () => {
    const set = vi.fn()
    render(<LerpFields {...lerp} x1="3.3333333333333335" dataType="int16" set={set} />)

    expect(screen.getByTestId('conversion-x1-input')).toHaveValue('3.3333333333333335')
    expect(set).not.toHaveBeenCalledWith('x1', '3.3333333')
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
