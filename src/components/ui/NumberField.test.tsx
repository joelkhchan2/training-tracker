import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NumberField } from './NumberField'

describe('NumberField', () => {
  it('renders its label and current value', () => {
    render(<NumberField label="Weight" value={100} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Weight')).toHaveValue('100')
  })

  it('calls onChange with a number when the input changes', () => {
    const onChange = vi.fn()
    render(<NumberField label="Weight" value={100} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '135' } })
    expect(onChange).toHaveBeenCalledWith(135)
  })

  it('increments by step when the + stepper is clicked', () => {
    const onChange = vi.fn()
    render(<NumberField label="Weight" value={100} onChange={onChange} step={5} />)
    fireEvent.click(screen.getByRole('button', { name: 'Increase Weight' }))
    expect(onChange).toHaveBeenCalledWith(105)
  })

  it('decrements by step when the − stepper is clicked, clamped at min', () => {
    const onChange = vi.fn()
    render(<NumberField label="Reps" value={2} onChange={onChange} step={5} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Reps' }))
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('hides stepper buttons when hideSteppers is true, but input still works', () => {
    const onChange = vi.fn()
    render(<NumberField label="Weight" value={100} onChange={onChange} hideSteppers />)
    expect(screen.queryByLabelText('Increase Weight')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Decrease Weight')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Weight')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '150' } })
    expect(onChange).toHaveBeenCalledWith(150)
  })

  // Regression guard: when used as a flex-1 field (e.g. two side-by-side in a
  // SetRow), the input's intrinsic ~20-char preferred width leaks up through
  // any flex ancestor left at min-width:auto, forcing horizontal overflow that
  // blows the whole page wider than the viewport. min-w-0 on BOTH wrapper divs
  // (not just the input) is what lets the field shrink. jsdom can't measure
  // layout, so we assert the load-bearing classes are present.
  it('keeps min-w-0 on both flex wrappers so the field can shrink', () => {
    render(<NumberField label="Weight" value={100} onChange={vi.fn()} hideSteppers />)
    const input = screen.getByLabelText('Weight')
    const inputRow = input.parentElement as HTMLElement
    const outerWrapper = inputRow.parentElement as HTMLElement
    expect(input).toHaveClass('min-w-0')
    expect(inputRow).toHaveClass('min-w-0')
    expect(outerWrapper).toHaveClass('min-w-0')
  })
})
