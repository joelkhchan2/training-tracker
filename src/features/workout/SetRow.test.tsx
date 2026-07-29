import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SetRow } from './SetRow'
import { useSessionStore } from './sessionStore'
import type { PrescribedExercise } from '../../domain/types'
import { usePrefs } from '../settings/usePrefs'

const baseSet = { weight: null, reps: 8, done: false, durationSeconds: null }

beforeEach(() => {
  useSessionStore.getState().reset()
})

describe('SetRow — weighted', () => {
  it('shows Weight and Reps fields, sized down via inputClassName', () => {
    render(<SetRow exIdx={0} setIdx={0} set={baseSet} inputType="weighted" />)
    expect(screen.getByLabelText('Weight')).toBeInTheDocument()
    expect(screen.getByLabelText('Reps')).toBeInTheDocument()
    expect(screen.queryByLabelText('Duration')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Weight')).toHaveClass('text-xl')
    expect(screen.getByLabelText('Weight')).not.toHaveClass('text-3xl')
  })
})

describe('SetRow — bodyweight', () => {
  it('shows only the Reps field', () => {
    render(<SetRow exIdx={0} setIdx={0} set={baseSet} inputType="bodyweight" />)
    expect(screen.queryByLabelText('Weight')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Reps')).toBeInTheDocument()
    expect(screen.queryByLabelText('Duration')).not.toBeInTheDocument()
  })
})

describe('SetRow — timed', () => {
  it('shows only the Duration field, no Weight or Reps', () => {
    const timedSet = { weight: null, reps: null, done: false, durationSeconds: 45 }
    render(<SetRow exIdx={0} setIdx={0} set={timedSet} inputType="timed" />)
    expect(screen.queryByLabelText('Weight')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Reps')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Duration')).toHaveValue('0:45')
  })

  it('typing into Duration calls updateSet with durationSeconds', () => {
    const prescription: PrescribedExercise[] = [{ exerciseName: 'Plank', sets: [{ reps: 0 }] }]
    useSessionStore.getState().startFromPrescription(prescription, {
      sessionType: 'A', dayName: 'Day 1', dayIndex: 0, clientId: 'client-1', startedAt: new Date().toISOString(),
    })
    useSessionStore.getState().setInputType(0, 'timed')

    function Wrapper() {
      const set = useSessionStore((s) => s.exercises[0].sets[0])
      return <SetRow exIdx={0} setIdx={0} set={set} inputType="timed" />
    }
    render(<Wrapper />)

    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '0:45' } })
    expect(useSessionStore.getState().exercises[0].sets[0].durationSeconds).toBe(45)
  })
})

describe('SetRow — weighted_time', () => {
  it('shows both Weight and Duration fields, no Reps', () => {
    const set = { weight: 45, reps: null, done: false, durationSeconds: 30 }
    render(<SetRow exIdx={0} setIdx={0} set={set} inputType="weighted_time" />)
    expect(screen.getByLabelText('Weight')).toHaveValue('45')
    expect(screen.getByLabelText('Duration')).toHaveValue('0:30')
    expect(screen.queryByLabelText('Reps')).not.toBeInTheDocument()
  })
})

describe('SetRow — RPE and warmup (unaffected by inputType)', () => {
  it('shows an empty RPE control when unset (not 0) and a warmup toggle', () => {
    render(<SetRow exIdx={0} setIdx={0} set={{ weight: 100, reps: 5, done: false, durationSeconds: null }} inputType="weighted" />)
    const rpe = screen.getByLabelText('RPE') as HTMLSelectElement
    expect(rpe.value).toBe('')
    expect(screen.getByRole('button', { name: /warmup/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reflects a set already marked warmup with rpe', () => {
    render(
      <SetRow
        exIdx={0}
        setIdx={0}
        set={{ weight: 100, reps: 5, done: false, isWarmup: true, rpe: 8, durationSeconds: null }}
        inputType="weighted"
      />,
    )
    expect((screen.getByLabelText('RPE') as HTMLSelectElement).value).toBe('8')
    expect(screen.getByRole('button', { name: /warmup/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking warmup and changing RPE patches the real store', () => {
    const prescription: PrescribedExercise[] = [
      { exerciseName: 'Bench Press', tmKey: 'bench', sets: [{ weight: 135, reps: 5 }] },
    ]
    useSessionStore.getState().startFromPrescription(prescription, {
      sessionType: 'A', dayName: 'Day 1', dayIndex: 0, clientId: 'client-1', startedAt: new Date().toISOString(),
    })

    function Wrapper() {
      const set = useSessionStore((s) => s.exercises[0].sets[0])
      return <SetRow exIdx={0} setIdx={0} set={set} inputType="weighted" />
    }
    render(<Wrapper />)

    fireEvent.click(screen.getByRole('button', { name: /warmup/i }))
    fireEvent.change(screen.getByLabelText('RPE'), { target: { value: '8' } })

    const set = useSessionStore.getState().exercises[0].sets[0]
    expect(set.isWarmup).toBe(true)
    expect(set.rpe).toBe(8)
  })

  it('does not render stepper buttons for Weight and Reps, but inputs work and done/remove buttons present', () => {
    const prescription: PrescribedExercise[] = [
      { exerciseName: 'Bench Press', tmKey: 'bench', sets: [{ weight: 135, reps: 5 }] },
    ]
    useSessionStore.getState().startFromPrescription(prescription, {
      sessionType: 'A', dayName: 'Day 1', dayIndex: 0, clientId: 'client-1', startedAt: new Date().toISOString(),
    })

    function Wrapper() {
      const set = useSessionStore((s) => s.exercises[0].sets[0])
      return <SetRow exIdx={0} setIdx={0} set={set} inputType="weighted" />
    }
    render(<Wrapper />)

    expect(screen.queryByLabelText('Increase Weight')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Decrease Weight')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Increase Reps')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Decrease Reps')).not.toBeInTheDocument()

    expect(screen.getByLabelText('Weight')).toBeInTheDocument()
    expect(screen.getByLabelText('Reps')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Set 1 done/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove set 1/i })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '155' } })
    const set = useSessionStore.getState().exercises[0].sets[0]
    expect(set.weight).toBe(155)
  })
})

describe('SetRow — showRpe gate', () => {
  afterEach(() => {
    usePrefs.setState({ showRpe: true }) // restore default so later tests aren't polluted
  })

  it('hides the RPE control when showRpe is false, leaving the Warmup pill untouched', () => {
    usePrefs.setState({ showRpe: false })
    render(<SetRow exIdx={0} setIdx={0} set={{ weight: 100, reps: 5, done: false, durationSeconds: null }} inputType="weighted" />)

    expect(screen.queryByLabelText('RPE')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /warmup/i })).toBeInTheDocument()
  })

  it('shows the RPE control when showRpe is true (default)', () => {
    render(<SetRow exIdx={0} setIdx={0} set={{ weight: 100, reps: 5, done: false, durationSeconds: null }} inputType="weighted" />)

    expect(screen.getByLabelText('RPE')).toBeInTheDocument()
  })
})

describe('SetRow — AMRAP/FSL badge gating', () => {
  it('shows the AMRAP badge for a weighted AMRAP set', () => {
    const set = { weight: 100, reps: 8, done: false, isAmrap: true, targetReps: 8, durationSeconds: null }
    render(<SetRow exIdx={0} setIdx={0} set={set} inputType="weighted" />)
    expect(screen.getByText(/AMRAP/)).toBeInTheDocument()
  })

  it('shows the FSL badge for a weighted FSL set', () => {
    const set = { weight: 100, reps: 8, done: false, isFsl: true, durationSeconds: null }
    render(<SetRow exIdx={0} setIdx={0} set={set} inputType="weighted" />)
    expect(screen.getByText('FSL')).toBeInTheDocument()
  })

  it('hides the AMRAP badge once the exercise is overridden away from weighted, even though isAmrap is still true', () => {
    const set = { weight: null, reps: null, done: false, isAmrap: true, targetReps: 8, durationSeconds: 45 }
    render(<SetRow exIdx={0} setIdx={0} set={set} inputType="timed" />)
    expect(screen.queryByText(/AMRAP/)).not.toBeInTheDocument()
  })

  it('hides the FSL badge once the exercise is overridden away from weighted', () => {
    const set = { weight: null, reps: null, done: false, isFsl: true, durationSeconds: 45 }
    render(<SetRow exIdx={0} setIdx={0} set={set} inputType="timed" />)
    expect(screen.queryByText('FSL')).not.toBeInTheDocument()
  })
})
