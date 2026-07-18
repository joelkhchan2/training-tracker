import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Textarea } from './Textarea'

describe('Textarea', () => {
  it('renders its label and current value', () => {
    render(<Textarea label="Notes" value="Rest 90s between sets" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Notes')).toHaveValue('Rest 90s between sets')
  })

  it('calls onChange with the new string value when the textarea changes', () => {
    const onChange = vi.fn()
    render(<Textarea label="Notes" value="Rest 90s between sets" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Rest 2 minutes' } })
    expect(onChange).toHaveBeenCalledWith('Rest 2 minutes')
  })
})
