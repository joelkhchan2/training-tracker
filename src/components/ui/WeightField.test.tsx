import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WeightField } from './WeightField'
import { usePrefs } from '../../features/settings/usePrefs'

afterEach(() => {
  usePrefs.setState({ weightUnit: 'lb' }) // restore default so later tests aren't polluted
})

describe('WeightField — lb mode (regression guard: behaves like a bare NumberField)', () => {
  it('renders the bare label and the raw lb value, and passes the typed number straight back', () => {
    const onChangeLb = vi.fn()
    render(<WeightField label="Weight" valueLb={135} onChangeLb={onChangeLb} stepLb={5} />)

    expect(screen.getByLabelText('Weight')).toHaveValue('135')
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '155' } })
    expect(onChangeLb).toHaveBeenCalledWith(155)
  })
})

describe('WeightField — kg mode', () => {
  it('shows the converted value, a "(kg)" label suffix, and back-converts onChange to lb', () => {
    usePrefs.setState({ weightUnit: 'kg' })
    const onChangeLb = vi.fn()
    render(<WeightField label="Weight" valueLb={100} onChangeLb={onChangeLb} />)

    expect(screen.getByLabelText('Weight (kg)')).toHaveValue('45.4')
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '60' } })
    expect(onChangeLb).toHaveBeenCalledWith(132.3) // round1(60 / 0.45359237)
  })
})

describe('WeightField — nullable variant (body weight)', () => {
  it('renders empty for null in both units and never converts the empty value', () => {
    const onChangeLb = vi.fn()
    const { rerender } = render(
      <WeightField label="Body weight" nullable valueLb={null} onChangeLb={onChangeLb} id="bw" />,
    )
    expect(screen.getByLabelText('Body weight')).toHaveValue(null)

    usePrefs.setState({ weightUnit: 'kg' })
    rerender(<WeightField label="Body weight" nullable valueLb={null} onChangeLb={onChangeLb} id="bw" />)
    expect(screen.getByLabelText('Body weight (kg)')).toHaveValue(null)
  })

  it('clearing the input calls onChangeLb(null) with no conversion', () => {
    const onChangeLb = vi.fn()
    render(<WeightField label="Body weight" nullable valueLb={200} onChangeLb={onChangeLb} id="bw" />)
    fireEvent.change(screen.getByLabelText('Body weight'), { target: { value: '' } })
    expect(onChangeLb).toHaveBeenCalledWith(null)
  })

  it('a non-null nullable value round-trips through conversion in kg mode', () => {
    usePrefs.setState({ weightUnit: 'kg' })
    const onChangeLb = vi.fn()
    render(<WeightField label="Body weight" nullable valueLb={181.5} onChangeLb={onChangeLb} id="bw" />)
    expect(screen.getByLabelText('Body weight (kg)')).toHaveValue(82.3) // round1(181.5 * 0.45359237)
    fireEvent.change(screen.getByLabelText('Body weight (kg)'), { target: { value: '80' } })
    expect(onChangeLb).toHaveBeenCalledWith(176.4) // round1(80 / 0.45359237)
  })
})
