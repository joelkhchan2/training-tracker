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
})
