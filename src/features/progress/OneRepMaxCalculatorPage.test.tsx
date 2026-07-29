import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { OneRepMaxCalculatorPage } from './OneRepMaxCalculatorPage'
import { usePrefs } from '../settings/usePrefs'

const nav = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => nav,
}))

beforeEach(() => {
  nav.mockReset()
})

describe('OneRepMaxCalculatorPage', () => {
  it('renders the default estimate (weight 100, reps 5) with the %-of-1RM table', () => {
    render(<OneRepMaxCalculatorPage />)
    expect(screen.getByText('116.7')).toBeInTheDocument()
    expect(screen.getByText('95%')).toBeInTheDocument()
  })

  it('shows a prompt and no table when weight is set to 0', () => {
    render(<OneRepMaxCalculatorPage />)
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '0' } })
    expect(screen.getByText('Enter a weight and reps.')).toBeInTheDocument()
    expect(screen.queryByText('95%')).not.toBeInTheDocument()
  })

  it('navigates to /progress when the back control is clicked', () => {
    render(<OneRepMaxCalculatorPage />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(nav).toHaveBeenCalledWith('/progress')
  })
})

describe('OneRepMaxCalculatorPage — kg mode', () => {
  afterEach(() => usePrefs.setState({ weightUnit: 'lb' }))

  it('shows the kg-converted estimate and a kg-labelled weight input', () => {
    usePrefs.setState({ weightUnit: 'kg' })
    render(<OneRepMaxCalculatorPage />)
    // default weight 100 lb -> 45.4 kg; epley e1RM = 116.6667 lb -> round1 116.7 -> 52.9 kg
    expect(screen.getByLabelText('Weight (kg)')).toHaveValue('45.4')
    expect(screen.getByText('52.9 kg')).toBeInTheDocument()
  })
})
