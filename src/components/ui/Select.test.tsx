import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Select } from './Select'

const options = [
  { value: 'strength', label: 'Strength' },
  { value: 'hypertrophy', label: 'Hypertrophy' },
]

describe('Select', () => {
  it('renders its label and current value', () => {
    render(<Select label="Goal" value="strength" onChange={vi.fn()} options={options} />)
    expect(screen.getByLabelText('Goal')).toHaveValue('strength')
  })

  it('calls onChange with the new string value when the selection changes', () => {
    const onChange = vi.fn()
    render(<Select label="Goal" value="strength" onChange={onChange} options={options} />)
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'hypertrophy' } })
    expect(onChange).toHaveBeenCalledWith('hypertrophy')
  })
})
