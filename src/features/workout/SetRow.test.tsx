import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SetRow } from './SetRow'
import { useSessionStore } from './sessionStore'
import type { PrescribedExercise } from '../../domain/types'

const baseSet = { weight: null, reps: 8, done: false }

beforeEach(() => {
  useSessionStore.getState().reset()
})

describe('SetRow', () => {
  it('shows the Weight field by default', () => {
    render(<SetRow exIdx={0} setIdx={0} set={baseSet} />)
    expect(screen.getByLabelText('Weight')).toBeInTheDocument()
    expect(screen.getByLabelText('Reps')).toBeInTheDocument()
  })
  it('hides the Weight field when hideWeight is set', () => {
    render(<SetRow exIdx={0} setIdx={0} set={baseSet} hideWeight />)
    expect(screen.queryByLabelText('Weight')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Reps')).toBeInTheDocument()
  })
  it('shows an empty RPE control when unset (not 0) and a warmup toggle', () => {
    render(<SetRow exIdx={0} setIdx={0} set={{ weight: 100, reps: 5, done: false }} />)
    const rpe = screen.getByLabelText('RPE') as HTMLSelectElement
    expect(rpe.value).toBe('') // unset, not "0"
    expect(screen.getByRole('button', { name: /warmup/i })).toHaveAttribute('aria-pressed', 'false')
  })
  it('reflects a set already marked warmup with rpe', () => {
    render(<SetRow exIdx={0} setIdx={0} set={{ weight: 100, reps: 5, done: false, isWarmup: true, rpe: 8 }} />)
    expect((screen.getByLabelText('RPE') as HTMLSelectElement).value).toBe('8')
    expect(screen.getByRole('button', { name: /warmup/i })).toHaveAttribute('aria-pressed', 'true')
  })
  it('clicking warmup and changing RPE patches the real store', () => {
    const prescription: PrescribedExercise[] = [
      { exerciseName: 'Bench Press', tmKey: 'bench', sets: [{ weight: 135, reps: 5 }] },
    ]
    useSessionStore.getState().startFromPrescription(prescription, {
      sessionType: 'A',
      dayName: 'Day 1',
      dayIndex: 0,
      clientId: 'client-1',
      startedAt: new Date().toISOString(),
    })

    function Wrapper() {
      const set = useSessionStore((s) => s.exercises[0].sets[0])
      return <SetRow exIdx={0} setIdx={0} set={set} />
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
      sessionType: 'A',
      dayName: 'Day 1',
      dayIndex: 0,
      clientId: 'client-1',
      startedAt: new Date().toISOString(),
    })

    function Wrapper() {
      const set = useSessionStore((s) => s.exercises[0].sets[0])
      return <SetRow exIdx={0} setIdx={0} set={set} />
    }
    render(<Wrapper />)

    // Stepper buttons should not be present
    expect(screen.queryByLabelText('Increase Weight')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Decrease Weight')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Increase Reps')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Decrease Reps')).not.toBeInTheDocument()

    // But inputs should be present
    expect(screen.getByLabelText('Weight')).toBeInTheDocument()
    expect(screen.getByLabelText('Reps')).toBeInTheDocument()

    // Done and remove buttons should still be present
    expect(screen.getByRole('button', { name: /Set 1 done/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove set 1/i })).toBeInTheDocument()

    // Typing in the Weight input should still trigger updateSet
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '155' } })
    const set = useSessionStore.getState().exercises[0].sets[0]
    expect(set.weight).toBe(155)
  })
})
