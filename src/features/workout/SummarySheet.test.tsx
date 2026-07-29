import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { SummarySheet } from './SummarySheet'
import type { ProgressionOutcomeDisplay } from './SummarySheet'
import { usePrefs } from '../settings/usePrefs'
import type { DetectedPR } from '../../domain'

describe('SummarySheet progression outcomes', () => {
  it('renders an increase outcome as "Name prev → next (+delta)"', () => {
    const outcomes: ProgressionOutcomeDisplay[] = [
      { exerciseName: 'Squat', action: 'increase', previousWeight: 100, nextWeight: 105 },
    ]
    render(
      <SummarySheet
        tonnage={0}
        setCount={0}
        exerciseCount={0}
        prs={[]}
        progressionOutcomes={outcomes}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Squat 100 → 105 (+5)')).toBeInTheDocument()
  })

  it('renders a hold outcome with the fails count when known', () => {
    const outcomes: ProgressionOutcomeDisplay[] = [
      { exerciseName: 'Bench Press', action: 'hold', previousWeight: 135, nextWeight: 135, fails: 2, failsBeforeDeload: 3 },
    ]
    render(
      <SummarySheet
        tonnage={0}
        setCount={0}
        exerciseCount={0}
        prs={[]}
        progressionOutcomes={outcomes}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Bench Press held (2/3 fails)')).toBeInTheDocument()
  })

  it('renders a hold outcome without a fails count as plain "held"', () => {
    const outcomes: ProgressionOutcomeDisplay[] = [
      { exerciseName: 'Bench Press', action: 'hold', previousWeight: 135, nextWeight: 135 },
    ]
    render(
      <SummarySheet
        tonnage={0}
        setCount={0}
        exerciseCount={0}
        prs={[]}
        progressionOutcomes={outcomes}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Bench Press held')).toBeInTheDocument()
  })

  it('renders a deload outcome as "Name deload → next"', () => {
    const outcomes: ProgressionOutcomeDisplay[] = [
      { exerciseName: 'Deadlift', action: 'deload', previousWeight: 100, nextWeight: 90 },
    ]
    render(
      <SummarySheet
        tonnage={0}
        setCount={0}
        exerciseCount={0}
        prs={[]}
        progressionOutcomes={outcomes}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Deadlift deload → 90')).toBeInTheDocument()
  })

  it('renders nothing progression-related when there are no outcomes', () => {
    render(
      <SummarySheet tonnage={0} setCount={0} exerciseCount={0} prs={[]} onClose={vi.fn()} />,
    )

    expect(screen.queryByText(/held|deload|→/)).not.toBeInTheDocument()
  })
})

describe('SummarySheet — weight unit (kg)', () => {
  afterEach(() => usePrefs.setState({ weightUnit: 'lb' }))

  it('progression delta equals the difference of the two DISPLAYED (converted) endpoints', () => {
    usePrefs.setState({ weightUnit: 'kg' })
    const outcomes: ProgressionOutcomeDisplay[] = [
      { exerciseName: 'Squat', action: 'increase', previousWeight: 100, nextWeight: 105 },
    ]
    render(<SummarySheet tonnage={0} setCount={0} exerciseCount={0} prs={[]} progressionOutcomes={outcomes} onClose={vi.fn()} />)
    // 100->45.4, 105->47.6, delta = round1(47.6 - 45.4) = 2.2 (NOT 2.3 from converting the raw lb delta)
    expect(screen.getByText('Squat 45.4 kg → 47.6 kg (+2.2)')).toBeInTheDocument()
  })

  it('formatPr converts e1RM/volume values but leaves a V-grade PR unconverted', () => {
    usePrefs.setState({ weightUnit: 'kg' })
    const prs: DetectedPR[] = [
      { exerciseName: 'Squat', prType: 'e1rm', oldValue: 250, newValue: 265 },
      { exerciseName: 'Climbing', prType: 'max_v_grade', oldValue: 4, newValue: 5 },
    ]
    render(<SummarySheet tonnage={0} setCount={0} exerciseCount={0} prs={prs} onClose={vi.fn()} />)
    // 265 -> 120.2 kg, 250 -> 113.4 kg
    expect(screen.getByText('🎉 Squat — new e1RM 120.2 kg (was 113.4 kg)')).toBeInTheDocument()
    expect(screen.getByText('🎉 Climbing — new max V-grade 5 (was 4)')).toBeInTheDocument()
  })
})

describe('SummarySheet — tonnage tile', () => {
  afterEach(() => usePrefs.setState({ weightUnit: 'lb' }))

  it('keeps thousands grouping in lb mode', () => {
    render(<SummarySheet tonnage={1000} setCount={0} exerciseCount={0} prs={[]} onClose={vi.fn()} />)
    expect(screen.getByText('1,000')).toBeInTheDocument()
  })

  it('converts (and keeps grouping) in kg mode', () => {
    usePrefs.setState({ weightUnit: 'kg' })
    render(<SummarySheet tonnage={1000} setCount={0} exerciseCount={0} prs={[]} onClose={vi.fn()} />)
    expect(screen.getByText('453.6 kg')).toBeInTheDocument() // toDisplayWeight(1000, 'kg')
  })
})
