import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CompactSelect } from './CompactSelect'

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
]

describe('CompactSelect', () => {
  it('renders a native select reachable by its aria-label, showing the current value', () => {
    render(<CompactSelect ariaLabel="Pick" value="b" onChange={vi.fn()} options={options} />)
    const select = screen.getByLabelText('Pick') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('b')
  })

  it('renders all options', () => {
    render(<CompactSelect ariaLabel="Pick" value="a" onChange={vi.fn()} options={options} />)
    const select = screen.getByLabelText('Pick') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Alpha', 'Beta'])
  })

  it('calls onChange with the chosen value', () => {
    const onChange = vi.fn()
    render(<CompactSelect ariaLabel="Pick" value="a" onChange={onChange} options={options} />)
    fireEvent.change(screen.getByLabelText('Pick'), { target: { value: 'b' } })
    expect(onChange).toHaveBeenCalledWith('b')
  })
})
