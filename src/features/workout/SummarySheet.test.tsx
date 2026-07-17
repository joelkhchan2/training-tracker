import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SummarySheet } from './SummarySheet'
import type { ProgressionOutcomeDisplay } from './SummarySheet'

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
