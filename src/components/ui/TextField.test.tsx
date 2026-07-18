import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TextField } from './TextField'

describe('TextField', () => {
  it('renders its label and current value', () => {
    render(<TextField label="Program name" value="Push day" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Program name')).toHaveValue('Push day')
  })

  it('calls onChange with the new string value when the input changes', () => {
    const onChange = vi.fn()
    render(<TextField label="Program name" value="Push day" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Program name'), { target: { value: 'Pull day' } })
    expect(onChange).toHaveBeenCalledWith('Pull day')
  })

  it('renders error text when provided', () => {
    render(
      <TextField label="Program name" value="" onChange={vi.fn()} error="Name is required" />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required')
  })

  it('does not render an alert when no error is provided', () => {
    render(<TextField label="Program name" value="" onChange={vi.fn()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
