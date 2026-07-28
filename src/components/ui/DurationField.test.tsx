import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DurationField } from './DurationField'

describe('DurationField', () => {
  it('shows the 0:00 placeholder and an empty value when valueSeconds is null', () => {
    render(<DurationField label="Duration" valueSeconds={null} onChange={vi.fn()} />)
    const input = screen.getByLabelText('Duration')
    expect(input).toHaveAttribute('placeholder', '0:00')
    expect(input).toHaveValue('')
  })

  it('displays a committed value formatted as m:ss', () => {
    render(<DurationField label="Duration" valueSeconds={90} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Duration')).toHaveValue('1:30')
  })

  it('commits bare seconds typed without a colon', () => {
    const onChange = vi.fn()
    render(<DurationField label="Duration" valueSeconds={null} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '90' } })
    expect(onChange).toHaveBeenCalledWith(90)
  })

  it('commits mm:ss typed with a colon', () => {
    const onChange = vi.fn()
    render(<DurationField label="Duration" valueSeconds={null} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '1:30' } })
    expect(onChange).toHaveBeenCalledWith(90)
  })

  it('does not commit an out-of-range seconds part (buffer-only, no onChange, no crash)', () => {
    const onChange = vi.fn()
    render(<DurationField label="Duration" valueSeconds={null} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '1:75' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Duration')).toHaveValue('1:75')
  })

  it('is erasable: clearing the field commits null immediately', () => {
    const onChange = vi.fn()
    render(<DurationField label="Duration" valueSeconds={90} onChange={onChange} />)
    const input = screen.getByLabelText('Duration')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('reformats to the canonical committed value on blur, discarding an incomplete edit', () => {
    render(<DurationField label="Duration" valueSeconds={90} onChange={vi.fn()} />)
    const input = screen.getByLabelText('Duration')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1:' } })
    expect(input).toHaveValue('1:')
    fireEvent.blur(input)
    expect(input).toHaveValue('1:30')
  })
})
